import { translateBackendError } from '@/i18n/backendErrors';

export class ApiError extends Error {
  public readonly status: number;
  public readonly rawMessage: string;
  public readonly data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.rawMessage = message;
    this.data = data;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipUnauthorizedRedirect?: boolean;
}

export async function apiRequest<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, skipUnauthorizedRedirect = false, ...rest } = options;

  const isJsonBody = body !== undefined && !(body instanceof FormData);
  const finalHeaders: HeadersInit = {
    ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
    ...(headers ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: finalHeaders,
      body: isJsonBody ? JSON.stringify(body) : (body as BodyInit | undefined),
      ...rest,
    });
  } catch {
    throw new ApiError(0, translateBackendError('Network connection failed.'));
  }

  const contentType = response.headers.get('content-type') ?? '';
  let parsed: unknown = null;
  if (contentType.includes('application/json')) {
    parsed = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => '');
    parsed = text ? { raw: text } : null;
  }

  if (!response.ok) {
    if (response.status === 401 && !skipUnauthorizedRedirect && unauthorizedHandler) {
      unauthorizedHandler();
    }

    const serverMsg =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : response.status >= 500
          ? `Server error (${response.status})`
          : `Request failed (${response.status})`;

    throw new ApiError(response.status, translateBackendError(serverMsg), parsed);
  }

  return parsed as T;
}

export const http = {
  get: <T>(url: string, options?: ApiRequestOptions) => apiRequest<T>(url, { ...options, method: 'GET' }),
  post: <T>(url: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(url, { ...options, method: 'POST', body }),
  put: <T>(url: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(url, { ...options, method: 'PUT', body }),
  delete: <T>(url: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(url, { ...options, method: 'DELETE', body }),
};
