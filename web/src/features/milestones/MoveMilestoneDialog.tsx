import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  /** 任务 id 或「3 个任务」 */
  subject: string;
  fromName: string | null;
  toName: string | null;
  /** 里面有 Epic：提示没做完的步骤会跟着走 */
  hasEpic?: boolean;
  busy?: boolean;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}

/**
 * 移出 / 换 milestone 的确认：可以写一句原因，记进任务的 milestone 变更记录（14 D7），
 * 比如「这次来不及，挪到下一个」。从待规划排进来不弹这个（不需要理由）。
 */
const MoveMilestoneDialog = ({ subject, fromName, toName, hasEpic, busy, onConfirm, onClose }: Props) => {
  const [comment, setComment] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{toName ? `把 ${subject} 移到 ${toName}` : `把 ${subject} 移出 ${fromName}`}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-md border bg-muted/50 px-2 py-0.5 font-medium text-foreground">{fromName ?? '待规划'}</span>
                <ArrowRight className="size-4" />
                <span className="rounded-md border bg-muted/50 px-2 py-0.5 font-medium text-foreground">{toName ?? '待规划'}</span>
              </div>
              {hasEpic && <p>包含 Epic：跟它在同一处、还没做完的步骤会一起移过去。</p>}
            </div>
          </DialogDescription>
        </DialogHeader>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="原因（可选），例如：这次来不及，挪到下一个" rows={3} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onConfirm(comment.trim()); } }} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={() => onConfirm(comment.trim())} disabled={busy}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MoveMilestoneDialog;
