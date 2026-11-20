import { useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { transitionTask } from '@/api/tasks';
import { addFeedback } from '@/api/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Status, Task } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { STATUS_LABEL, transitionLabel } from '@/features/tasks/status';

interface Props {
  task: Task;
  to: Status;
  onClose: () => void;
  onChanged?: (t: Task) => void;
}

// 打回 / 拒绝 / 重新打开 / 重新提交 / 撤销 / 恢复：Feedback 模式的右侧面板。
// 原因先存成一条 review feedback（撤销 / 恢复是 comment：不是评审，只是不需要了），
// 再做状态迁移，历史备注缺省引用该 feedback 的 ID。
const TransitionPanel = ({ task, to, onClose, onChanged }: Props) => {
  const [review, setReview] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const label = transitionLabel(task.status, to);
  const danger = to === 'REJECTED';
  const cancel = to === 'CANCELLED' || task.status === 'CANCELLED';

  const submit = async () => {
    if (!review.trim()) { enqueueSnackbar('请说明原因', { variant: 'warning' }); return; }
    setBusy(true);
    try {
      const fb = await addFeedback(task.id, { content: review, kind: cancel ? 'comment' : 'review' });
      const t = await transitionTask(task.id, to, { comment: comment.trim() || `see ${fb.id}` });
      enqueueSnackbar(`${task.id} → ${STATUS_LABEL[to]}`, { variant: 'success' });
      onChanged?.(t);
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={`${label} ${task.id}`}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button variant={danger ? 'destructive' : cancel ? 'secondary' : 'default'} onClick={submit} disabled={busy}>{label}</Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">
        {to === 'CANCELLED' ? '为什么不做了（存为说明 Feedback；过时 / 被别的工单覆盖 / 不再需要）'
          : task.status === 'CANCELLED' ? '为什么又需要了（存为说明 Feedback）'
          : to === 'NEW' ? '说明改了什么（存为评审 Feedback，对方会看到）' : '原因（存为评审 Feedback，对方会看到）'}
      </p>
      <div className="min-h-0 flex-1">
        <MarkdownEditor value="" onChange={setReview} minHeight={200} fill autoFocus placeholder={cancel ? (to === 'CANCELLED' ? '过时了？被哪个工单覆盖了？…' : '为什么又需要了…') : '哪里不对、期望是什么…'} />
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="transition-comment">历史备注（可选）</Label>
        <Input id="transition-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        <p className="text-xs text-muted-foreground">留空则自动引用上面的 Feedback ID</p>
      </div>
    </SidePanel>
  );
};

export default TransitionPanel;
