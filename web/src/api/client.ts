import axios, { AxiosError } from 'axios';
import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  status: number;
  error: string;
  field?: string;
  detail?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody | undefined, fallback: string) {
    super(body?.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.error = body?.error ?? 'unknown';
    this.field = body?.field;
    this.detail = body?.detail;
  }
}

export const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// 这些请求的 401 由调用方自己处理（登录页显示错误、AuthGate 客户端跳转），其余 401 = 会话失效 → 回登录页
const AUTH_URLS = ['/auth/me', '/auth/login', '/auth/register', '/auth/register/code'];
const PUBLIC_PATHS = ['/login', '/register'];

// 所有响应错误统一成 ApiError，组件层只 catch 这一种类型
client.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiErrorBody>) => {
    if (err.response) {
      const url = err.config?.url ?? '';
      if (err.response.status === 401 && !AUTH_URLS.includes(url) && !PUBLIC_PATHS.includes(window.location.pathname)) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
      throw new ApiError(err.response.status, err.response.data, err.message);
    }
    throw new ApiError(0, undefined, '服务不可用');
  },
);

export const fetcher = <T>(url: string) => client.get<T>(url).then((r) => r.data);

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
