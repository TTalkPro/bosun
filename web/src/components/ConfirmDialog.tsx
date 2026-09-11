import type { ReactNode } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  /** 危险操作：确认按钮红色 */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// 纯确认（无输入）用它，替代原生 window.confirm；带输入的一律走 SidePanel
const ConfirmDialog = ({ open, title, message, confirmText = '确定', danger = false, busy = false, onConfirm, onClose }: Props) => (
  <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs">
    <DialogTitle>{title}</DialogTitle>
    <DialogContent><DialogContentText component="div">{message}</DialogContentText></DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>取消</Button>
      <Button variant="contained" color={danger ? 'error' : 'primary'} onClick={onConfirm} disabled={busy} autoFocus>{confirmText}</Button>
    </DialogActions>
  </Dialog>
);

export default ConfirmDialog;
