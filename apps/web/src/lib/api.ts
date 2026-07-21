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
  opts: { idem?: boolean } = {},
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: headers(opts.idem ?? method !== 'GET'),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  captureImpersonation(res);
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: ApiError };
  if (!res.ok) {
    throw new RequestError(res.status, json.error ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return json.data as T;
}

/** GET a binary artefact (CSV download) with the auth headers attached. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(path, { credentials: 'include', headers: headers(false) });
  captureImpersonation(res);
  if (!res.ok)
    throw new RequestError(res.status, { code: 'DOWNLOAD_FAILED', message: res.statusText });
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
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: headers(true),
    body: JSON.stringify(body),
  });
  captureImpersonation(res);
  if (!res.ok && !res.body) {
    const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
    throw new RequestError(res.status, json.error ?? { code: 'UNKNOWN', message: res.statusText });
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const type = /^event: (.+)$/m.exec(frame)?.[1];
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      if (type) onEvent({ type, data: data ? (JSON.parse(data) as unknown) : null });
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
