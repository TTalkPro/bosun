import { useSnackbar } from 'notistack';
import { useCallback } from 'react';
import { isApiError } from '@/api/client';

// 组件层统一的错误提示：400 交给表单（返回 field），其余 snackbar
export const useApiError = () => {
  const { enqueueSnackbar } = useSnackbar();
  return useCallback(
    (e: unknown): { field?: string; message: string } => {
      if (isApiError(e)) {
        if (e.status === 400) return { field: e.field, message: e.message };
        if (e.status === 409) {
          enqueueSnackbar(e.message, { variant: 'warning' });
          return { message: e.message };
        }
        if (e.status === 404) {
          enqueueSnackbar('对象不存在', { variant: 'error' });
          return { message: e.message };
        }
        enqueueSnackbar(e.status === 0 ? '服务不可用' : e.message, { variant: 'error' });
        return { message: e.message };
      }
      const message = e instanceof Error ? e.message : String(e);
      enqueueSnackbar(message, { variant: 'error' });
      return { message };
    },
    [enqueueSnackbar],
  );
};
