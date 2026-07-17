/**
 * Minimal API client for the early phases. Access token lives in MEMORY only
 * (never localStorage — CLAUDE.md); the refresh cookie is handled by the
 * browser. The full axios + interceptor stack arrives with the feature UI.
 */

let accessToken: string | null = null;
let companyId: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setCompanyId(id: string | null): void {
  companyId = id;
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

export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: ApiError;
  };
  if (!res.ok) {
    throw new RequestError(res.status, json.error ?? { code: 'UNKNOWN', message: res.statusText });
  }
  return json.data as T;
}
