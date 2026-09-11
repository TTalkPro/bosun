import { useState } from 'react';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { addFeedback, reviseFeedback } from '@/api/feedback';
import type { Feedback, FeedbackKind } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { ALL_KINDS, KIND_LABEL, defaultKind } from './kinds';

interface Props {
  taskId: string;
  feedback: Feedback[];
  /** 传入则为修订模式（只允许 author=user 的条目） */
  editing?: Feedback;
  onClose: () => void;
  onSaved?: (f: Feedback) => void;
}

// 新增 / 修订 Feedback：右侧 2/3 面板，编辑器撑满
const FeedbackDialog = ({ taskId, feedback, editing, onClose, onSaved }: Props) => {
  const [kind, setKind] = useState<FeedbackKind>(editing?.kind ?? defaultKind(feedback));
  const [content, setContent] = useState(editing?.content ?? '');
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
        <TextField select size="small" label="类型" value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)} sx={{ minWidth: 120 }} inputProps={{ 'aria-label': 'feedback kind' }}>
          {ALL_KINDS.map((k) => <MenuItem key={k} value={k}>{KIND_LABEL[k]}</MenuItem>)}
        </TextField>
      }
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="contained" onClick={submit} disabled={busy}>{editing ? '保存' : '提交'}</Button>
        </>
      }
    >
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <MarkdownEditor value={editing?.content ?? ''} onChange={setContent} minHeight={200} fill autoFocus placeholder="写下说明、评审意见、问题或回答…支持 Markdown 与 mermaid" />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
        {editing ? '修订会追加一条新的 Feedback，原条目标记为作废并保留在线索里；没有删除。' : 'Feedback 只追加不删除；自己写的条目可以修订（生成新版本，旧版本作废）。'}
      </Typography>
    </SidePanel>
  );
};

export default FeedbackDialog;
