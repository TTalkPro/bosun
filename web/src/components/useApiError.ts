import { useSnackbar } from '@/components/notify';
import { useCallback } from 'react';
import { isApiError, tooManyText } from '@/api/client';

// 组件层统一的错误提示。
// 400 且 field 在调用方声明的 handledFields 里：不弹提示，返回 field 让表单在输入框下显示；
// 其余一律弹提示（包括调用方没声明的 400——以前 400 一律静默，多数调用点又不看返回值，
// 「关联的任务不存在」「过期时间在过去」「导入文件不合法」这类错误点了按钮毫无反应）。
export const useApiError = () => {
  const { enqueueSnackbar } = useSnackbar();
  return useCallback(
    (e: unknown, handledFields: readonly string[] = []): { field?: string; message: string } => {
      if (isApiError(e)) {
        if (e.status === 400) {
          if (e.field && handledFields.includes(e.field)) return { field: e.field, message: e.message };
          enqueueSnackbar(e.message, { variant: 'error' });
          return { message: e.message };
        }
        if (e.status === 429) {
          const message = tooManyText(e);
          enqueueSnackbar(message, { variant: 'warning' });
          return { message };
        }
        if (e.status === 413) {
          enqueueSnackbar('内容太大，服务端拒收', { variant: 'error' });
          return { message: e.message };
        }
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
