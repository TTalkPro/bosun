import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Props { open: boolean; title: string; message: ReactNode; confirmText?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void; }

const ConfirmDialog = ({ open, title, message, confirmText = '确定', danger, busy, onConfirm, onClose }: Props) => (
  <Dialog open={open} onOpenChange={(next) => !busy && !next && onClose()}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription asChild><div>{message}</div></DialogDescription></DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
        <Button onClick={onConfirm} disabled={busy} autoFocus className={cn(danger && 'bg-destructive text-white hover:bg-destructive/90')}>{confirmText}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
export default ConfirmDialog;
