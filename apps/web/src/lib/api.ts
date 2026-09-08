/**
 * API client. Access token lives in MEMORY only (never localStorage —
 * CLAUDE.md); the refresh cookie is handled by the browser. Every mutating
 * call carries an Idempotency-Key (I7). Impersonation headers on any
 * response flip the loud banner (§32 Phase 23).
 */

let accessToken: string | null = null;
let companyId: string | null = null;
let impersonation: { sessionId: string; by: string } | null = null;
const impersonationListeners = new Set<(v: { sessionId: string; by: string } | null) => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getCompanyId(): string | null {
  return companyId;
}
export function setCompanyId(id: string | null): void {
  companyId = id;
}
export function getImpersonation(): { sessionId: string; by: string } | null {
  return impersonation;
}
export function onImpersonationChange(
  fn: (v: { sessionId: string; by: string } | null) => void,
): () => void {
  impersonationListeners.add(fn);
  return () => impersonationListeners.delete(fn);
}

function captureImpersonation(res: Response): void {
  const sessionId = res.headers.get('X-Impersonation-Session');
  const by = res.headers.get('X-Impersonated-By');
  const next = sessionId && by ? { sessionId, by } : null;
  const changed = JSON.stringify(next) !== JSON.stringify(impersonation);
  impersonation = next;
  if (changed) for (const fn of impersonationListeners) fn(next);
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class RequestError extends Error {
  constructor(
    public status: number,
    public error: ApiError,
  ) {
    super(error.message);
  }
}

/**
 * Every request in the app goes through this module, so this is the one place
 * that sees all API failures. The toast layer subscribes here and therefore
 * surfaces them app-wide without a single page having to opt in.
 */
const apiErrorListeners = new Set<(err: RequestError) => void>();

export function onApiError(fn: (err: RequestError) => void): () => void {
  apiErrorListeners.add(fn);
  return () => apiErrorListeners.delete(fn);
}

/** Announce, then hand the error back so callers still `throw reported(...)`. */
function reported(err: RequestError): RequestError {
  for (const fn of apiErrorListeners) fn(err);
  return err;
}

/**
 * `fetch` rejects (rather than resolving non-ok) when the server is simply not
 * there. Left raw that surfaces as "Failed to fetch", which tells a user
 * nothing; this says what actually happened and what to check.
 */
function unreachable(cause: unknown): RequestError {
  return new RequestError(0, {
    code: 'NETWORK_UNREACHABLE',
    message:
      'Cannot reach the FinPilot API. Check that the server on port 4000 is running, then retry.',
    details: cause instanceof Error ? cause.message : undefined,
  });
}

function headers(idem: boolean): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(companyId ? { 'X-Company-Id': companyId } : {}),
    ...(idem ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
  };
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: { idem?: boolean; silent?: boolean | number[] } = {},
): Promise<T> {
  // `silent` is for calls whose failure is a normal outcome rather than a
  // problem — probing whether the user is an admin, refreshing a session that
  // may not exist, a background poll. They still throw; they just don't shout.
  //
  // Prefer the status-list form: `silent: [401]` keeps the EXPECTED failure
  // quiet while a real outage (status 0, or a 500) still gets announced.
  // Blanket `true` is for calls that repeat, where any nagging is wrong.
  const isSilent = (status: number): boolean =>
    opts.silent === true || (Array.isArray(opts.silent) && opts.silent.includes(status));
  const announce = (err: RequestError): RequestError =>
    isSilent(err.status) ? err : reported(err);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: headers(opts.idem ?? method !== 'GET'),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw announce(unreachable(cause));
  }
  captureImpersonation(res);
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: ApiError };
  if (!res.ok) {
    const defaultMsg =
      res.status === 500
        ? 'Internal Server Error — backend server (port 4000) may be unreachable or down'
        : res.statusText || 'Request failed';
    throw announce(
      new RequestError(
        res.status,
        json.error ?? { code: 'HTTP_' + res.status, message: defaultMsg },
      ),
    );
  }
  return json.data as T;
}

/** GET a binary artefact (CSV download) with the auth headers attached. */
export async function apiBlob(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'include', headers: headers(false) });
  } catch (cause) {
    throw reported(unreachable(cause));
  }
  captureImpersonation(res);
  if (!res.ok)
    throw reported(
      new RequestError(res.status, {
        code: 'DOWNLOAD_FAILED',
        message: res.statusText || 'The download failed',
      }),
    );
  return res.blob();
}

export function qs(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (pairs.length === 0) return '';
  return '?' + pairs.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export interface SseEvent {
  type: string;
  data: unknown;
}

/** POST an SSE endpoint (Copilot turn) and stream `event:`/`data:` frames. */
export async function sse(
  path: string,
  body: unknown,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: headers(true),
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw reported(unreachable(cause));
  }
  captureImpersonation(res);
  if (!res.ok && !res.body) {
    const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
    throw reported(
      new RequestError(
        res.status,
        json.error ?? { code: 'UNKNOWN', message: res.statusText || 'The request failed' },
      ),
    );
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        const type = /^event:\s*(.+)$/m.exec(buffer)?.[1]?.trim();
        const dataStr = /^data:\s*(.+)$/m.exec(buffer)?.[1]?.trim();
        if (type) {
          let data: unknown = null;
          if (dataStr) {
            try {
              data = JSON.parse(dataStr);
            } catch {
              data = dataStr;
            }
          }
          onEvent({ type, data });
        }
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer)) !== null) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const type = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
      const dataStr = /^data:\s*(.+)$/m.exec(frame)?.[1]?.trim();
      if (type) {
        let data: unknown = null;
        if (dataStr) {
          try {
            data = JSON.parse(dataStr);
          } catch {
            data = dataStr;
          }
        }
        onEvent({ type, data });
      }
    }
  }
}

/** Read a File (photo / PDF) into the base64 upload contract (§18.5). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}
