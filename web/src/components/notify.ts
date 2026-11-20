import { toast } from 'sonner';

type Variant = 'default' | 'success' | 'error' | 'warning' | 'info';
interface NotifyOptions {
  variant?: Variant;
  /** 毫秒；缺省用 sonner 的默认时长 */
  autoHideDuration?: number;
}

// 全站统一的轻提示，落到 main.tsx 挂的 sonner <Toaster>。
// 迁移 shadcn 时 notistack 的 SnackbarProvider 被拿掉了，但各处仍在调它的 useSnackbar——
// 没有 Provider 时那是个空操作，所有成功 / 失败提示都不显示。这里保留同样的调用形状，改走 sonner。
export const notify = (message: string, { variant = 'default', autoHideDuration }: NotifyOptions = {}) => {
  const opts = autoHideDuration ? { duration: autoHideDuration } : undefined;
  switch (variant) {
    case 'success': return toast.success(message, opts);
    case 'error': return toast.error(message, opts);
    case 'warning': return toast.warning(message, opts);
    case 'info': return toast.info(message, opts);
    default: return toast(message, opts);
  }
};

// 引用稳定，放进 useCallback / useEffect 依赖不会引起重跑
const api = { enqueueSnackbar: notify };
export const useSnackbar = () => api;
