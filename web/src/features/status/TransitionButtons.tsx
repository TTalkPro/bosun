import { useState } from 'react';
import { Button, Stack, Tooltip } from '@mui/material';
import { useSnackbar } from 'notistack';
import { transitionTask } from '@/api/tasks';
import type { Status, Task } from '@/api/types';
import { useApiError } from '@/components/useApiError';
import { STATUS_LABEL, isForward, nextStatuses, transitionLabel } from '@/features/tasks/status';
import TransitionPanel from './TransitionPanel';
import CompletePanel from './CompletePanel';

interface Props {
  task: Task;
  onChanged?: (t: Task) => void;
}

// 开始：直接提交；完成 / 验收：完成证据面板；其余（打回 / 重开 / 拒绝 / 重新提交）：说明面板
const TransitionButtons = ({ task, onChanged }: Props) => {
  const [target, setTarget] = useState<Status | null>(null);
  const [complete, setComplete] = useState<'DONE' | 'VERIFIED' | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const run = async (to: Status) => {
    setBusy(true);
    try {
      const t = await transitionTask(task.id, to);
      enqueueSnackbar(`${task.id} → ${STATUS_LABEL[to]}`, { variant: 'success' });
      onChanged?.(t);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const from = task.status;
  return (
    <>
      <Stack direction="row" spacing={1}>
        {nextStatuses(from).map((to) => {
          const forward = isForward(from, to);
          const blockedStart = to === 'IN_PROGRESS' && from === 'NEW' && task.blocked;
          const blockers = task.links.filter((l) => l.type === 'depends_on' && l.direction === 'out' && l.status !== 'DONE' && l.status !== 'VERIFIED').map((l) => l.task);
          const button = (
            <Button key={to} size="small" disabled={busy || blockedStart} variant={forward ? 'contained' : 'outlined'}
              color={forward ? 'primary' : to === 'REJECTED' ? 'error' : 'inherit'}
              onClick={() => (!forward ? setTarget(to) : to === 'IN_PROGRESS' ? run(to) : setComplete(to as 'DONE' | 'VERIFIED'))}>
              {transitionLabel(from, to)}
            </Button>
          );
          return blockedStart ? <Tooltip key={to} title={`被阻塞：先完成 ${blockers.join('、')}`}><span>{button}</span></Tooltip> : button;
        })}
      </Stack>
      {target && <TransitionPanel task={task} to={target} onClose={() => setTarget(null)} onChanged={onChanged} />}
      {complete && <CompletePanel task={task} to={complete} onClose={() => setComplete(null)} onChanged={onChanged} />}
    </>
  );
};

export default TransitionButtons;
