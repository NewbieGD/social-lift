// HTTP client: signed launch params on every call, timeouts and one error shape.
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../config';
import { launchParamsRaw } from '../platform/vk';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfter = 0,
  ) {
    super(code);
  }
  /** Network failure or timeout (no answer from the server). */
  get offline(): boolean {
    return this.status === 0;
  }
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-VK-Launch-Params': launchParamsRaw(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, ctrl.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const code = (data as { error?: { code?: string } } | null)?.error?.code ?? 'http_error';
    const retry = Number(res.headers.get('Retry-After') || 0);
    throw new ApiError(res.status, code, retry);
  }
  return data as T;
}
