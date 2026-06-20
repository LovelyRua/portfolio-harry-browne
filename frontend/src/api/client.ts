import { API_BASE_URL } from '../config/api';

export type ApiErrorResponse = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  public code?: string;
  public status: number;
  public details?: unknown;

  constructor(opts: { message: string; status: number; code?: string; details?: unknown }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

export type TokenGetter = () => string | null | undefined;

export function createApiClient(getToken: TokenGetter) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
      ...(init?.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : (init?.headers as Record<string, string> | undefined) ?? {}),
    };

    if (!headers['Content-Type'] && init?.body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    const text = await res.text();
    const json = text ? safeJsonParse(text) : null;

    if (!res.ok) {
      const err = (json as ApiErrorResponse) ?? undefined;
      throw new ApiError({
        message: err?.error?.message ?? `Request failed: ${res.status}`,
        status: res.status,
        code: err?.error?.code,
        details: err?.error?.details,
      });
    }

    return json as T;
  }

  return {
    request,
    token: () => getToken(),
    auth: {
      async register(params: { email: string; password: string }) {
        return request<{ ok: true; verificationRequired: true }>('/auth/register', { method: 'POST', body: JSON.stringify(params) });
      },
      async verifyEmail(params: { email: string; code: string }) {
        return request<{ ok: true }>('/auth/verify-email', { method: 'POST', body: JSON.stringify(params) });
      },
      async resendVerification(params: { email: string }) {
        return request<{ ok: true }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify(params) });
      },
      async login(params: { email: string; password: string }) {
        return request<{ accessToken: string; tokenType: string }>('/auth/login', { method: 'POST', body: JSON.stringify(params) });
      },
      async changePassword(params: { currentPassword: string; newPassword: string }) {
        return request<{ accessToken: string; tokenType: string }>('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      },
      async forgotPassword(params: { email: string }) {
        return request<{ ok: true }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      },
      async resetPassword(params: { email: string; code: string; newPassword: string }) {
        return request<{ ok: true }>('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      },
    },
    data: {
      async get() {
        return request<{ payload: unknown | null; updatedAt?: string }>('/data', { method: 'GET' });
      },
      async upload(payload: unknown) {
        return request<{ ok: true; updatedAt?: string }>('/data', { method: 'PUT', body: JSON.stringify({ payload }) });
      },
    },
  };
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
