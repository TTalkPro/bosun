import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ApiError } from '@/api/client';
import { useApiError } from '@/components/useApiError';

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const err = (status: number, body: { error: string; message: string; field?: string }) => new ApiError(status, body, 'x');

describe('useApiError', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // 迁移 shadcn 后提示曾经全部失效（notistack 没有 Provider），这里钉住「真的弹了」
  it('toasts through sonner', () => {
    const { result } = renderHook(() => useApiError());
    result.current(err(409, { error: 'blocked', message: 'task is blocked' }));
    expect(toast.warning).toHaveBeenCalledWith('task is blocked', undefined);
    result.current(err(500, { error: 'internal', message: 'boom' }));
    expect(toast.error).toHaveBeenCalledWith('boom', undefined);
  });

  it('shows a 400 unless the caller renders that field inline', () => {
    const { result } = renderHook(() => useApiError());
    const e = err(400, { error: 'invalid', field: 'to', message: 'invalid to: KEEL-999 not found' });
    expect(result.current(e)).toEqual({ message: 'invalid to: KEEL-999 not found' });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(result.current(e, ['to'])).toEqual({ field: 'to', message: 'invalid to: KEEL-999 not found' });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
