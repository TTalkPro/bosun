import { useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { addFeedback, reviseFeedback } from '@/api/feedback';
import type { Feedback, FeedbackKind } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_KINDS, KIND_LABEL, defaultKind } from './kinds';

interface Props {
  taskId: string;
  feedback: Feedback[];
  /** 传入则为修订模式（只允许 author=user 的条目） */
  editing?: Feedback;
  onClose: () => void;
  onSaved?: (f: Feedback) => void;
  /** 从内联输入框「Markdown 编辑器…」带过来的草稿 */
  initialContent?: string;
  initialKind?: FeedbackKind;
}

// 新增 / 修订 Feedback：右侧 2/3 面板，编辑器撑满
const FeedbackDialog = ({ taskId, feedback, editing, onClose, onSaved, initialContent, initialKind }: Props) => {
  const [kind, setKind] = useState<FeedbackKind>(editing?.kind ?? initialKind ?? defaultKind(feedback));
  const [content, setContent] = useState(editing?.content ?? initialContent ?? '');
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const submit = async () => {
    if (!content.trim()) { enqueueSnackbar('内容不能为空', { variant: 'warning' }); return; }
    setBusy(true);
    try {
      const f = editing
        ? await reviseFeedback(taskId, editing.seq, { content, kind })
        : await addFeedback(taskId, { content, kind });
      enqueueSnackbar(editing ? `已修订为 ${f.id}，${editing.id} 作废` : `${f.id} 已添加`, { variant: 'success', autoHideDuration: 1500 });
      onSaved?.(f);
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={editing ? `修订 ${editing.id}` : `添加 Feedback · ${taskId}`}
      onClose={onClose}
      busy={busy}
      headerExtra={
        <Select value={kind} onValueChange={(v) => setKind(v as FeedbackKind)}>
          <SelectTrigger size="sm" className="min-w-28" aria-label="feedback kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      }
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={submit} disabled={busy}>{editing ? '保存' : '提交'}</Button>
        </>
      }
    >
      <div className="min-h-0 flex-1">
        <MarkdownEditor value={editing?.content ?? initialContent ?? ''} onChange={setContent} minHeight={200} fill autoFocus placeholder="写下说明、评审意见、问题或回答…支持 Markdown 与 mermaid" />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {editing ? '修订会追加一条新的 Feedback，原条目标记为作废并保留在线索里；没有删除。' : 'Feedback 只追加不删除；自己写的条目可以修订（生成新版本，旧版本作废）。'}
      </p>
    </SidePanel>
  );
};

export default FeedbackDialog;
