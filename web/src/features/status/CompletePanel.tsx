import { useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { transitionTask } from '@/api/tasks';
import { useActor } from '@/api/identity';
import type { Status, Task } from '@/api/types';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { STATUS_LABEL, transitionLabel } from '@/features/tasks/status';

interface Props {
  task: Task;
  to: 'DONE' | 'VERIFIED';
  onClose: () => void;
  onChanged?: (t: Task) => void;
}

// 完成 / 验收：新建工单式面板，记录完成证据（提交 hash、测试结果）。
// 执行方验收自己的任务时必须有通过的测试（本次或最近一次 DONE）。
const CompletePanel = ({ task, to, onClose, onChanged }: Props) => {
  const me = useActor();
  const selfVerify = to === 'VERIFIED' && task.assignee === me;
  const lastDone = task.history.find((h) => h.to === 'DONE');
  const lastDonePassed = !!lastDone?.tests?.passed;
  const [commits, setCommits] = useState('');
  const [comment, setComment] = useState('');
  const [withTests, setWithTests] = useState(to === 'DONE' || (selfVerify && !lastDonePassed));
  const [command, setCommand] = useState('');
  const [passed, setPassed] = useState(true);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const label = transitionLabel(task.status, to as Status);

  const submit = async () => {
    setBusy(true);
    try {
      const list = commits.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean);
      const t = await transitionTask(task.id, to, {
        comment: comment.trim() || undefined,
        commits: list,
        tests: withTests ? { command: command.trim(), passed, summary: summary.trim() } : undefined,
      });
      enqueueSnackbar(`${task.id} → ${STATUS_LABEL[to]}`, { variant: 'success' });
      onChanged?.(t);
      onClose();
    } catch (e) {
      const { field, message } = handleError(e);
      if (field) enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={`${label} ${task.id}`}
      onClose={onClose}
      busy={busy}
      actions={<><Button onClick={onClose} disabled={busy}>取消</Button><Button variant="contained" onClick={submit} disabled={busy}>{label}</Button></>}
    >
      <Stack spacing={2}>
        {selfVerify && (
          <Alert severity={lastDonePassed ? 'success' : 'warning'}>
            {lastDonePassed
              ? `你是执行方；最近一次「完成」已记录通过的测试（${lastDone?.tests?.command || '未写命令'}），可以自验收。`
              : '你是执行方：自己验收必须记录通过的测试结果，否则后端会拒绝。'}
          </Alert>
        )}
        <TextField label="提交 hash" value={commits} onChange={(e) => setCommits(e.target.value)} autoFocus
          helperText={to === 'DONE' ? '空格或逗号分隔；没有提交就留空，并在 Feedback 里说明' : '可选'}
          InputProps={{ sx: { fontFamily: '"JetBrains Mono", Menlo, monospace' } }} />
        <FormControlLabel control={<Checkbox checked={withTests} onChange={(e) => setWithTests(e.target.checked)} />} label="记录测试结果" />
        {withTests && (
          <Stack spacing={1.5} sx={{ pl: 1, borderLeft: 2, borderColor: 'divider' }}>
            <TextField label="命令" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="rebar3 eunit && rebar3 ct" InputProps={{ sx: { fontFamily: '"JetBrains Mono", Menlo, monospace' } }} />
            <FormControlLabel control={<Checkbox checked={passed} onChange={(e) => setPassed(e.target.checked)} />} label="全部通过" />
            <TextField label="结果摘要" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="28 eunit + 4 ct passed" />
          </Stack>
        )}
        <TextField label="历史备注（可选）" value={comment} onChange={(e) => setComment(e.target.value)} />
        <Typography variant="caption" color="text.secondary">提交 hash 与测试结果会进入状态历史，作为完成证据；提出方或第三方验收不需要测试记录。</Typography>
      </Stack>
    </SidePanel>
  );
};

export default CompletePanel;
