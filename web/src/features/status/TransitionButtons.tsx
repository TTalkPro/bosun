import { useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { transitionTask } from '@/api/tasks';
import type { Status, Task } from '@/api/types';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STATUS_LABEL, isForward, nextStatuses, transitionLabel } from '@/features/tasks/status';
import TransitionPanel from './TransitionPanel';
import CompletePanel from './CompletePanel';
import { cn } from '@/lib/utils';

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
      <div className="flex flex-wrap gap-2">
        {nextStatuses(from).map((to) => {
          const forward = isForward(from, to);
          const destructive = to === 'REJECTED';
          const blockedStart = to === 'IN_PROGRESS' && from === 'NEW' && task.blocked;
          const blockers = task.links.filter((l) => l.type === 'depends_on' && l.direction === 'out' && l.status !== 'DONE' && l.status !== 'VERIFIED').map((l) => l.task);
          const button = (
            <Button
              key={to}
              size="sm"
              disabled={busy || blockedStart}
              className={cn(forward ? '' : 'bg-transparent text-foreground shadow-none hover:bg-accent', destructive && 'border border-destructive/30 bg-transparent text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive')}
              variant={forward ? 'default' : 'outline'}
              onClick={() => (!forward ? setTarget(to) : to === 'IN_PROGRESS' ? run(to) : setComplete(to as 'DONE' | 'VERIFIED'))}
            >
              {transitionLabel(from, to)}
            </Button>
          );
          return blockedStart ? (
            <Tooltip key={to}>
              <TooltipTrigger asChild><span>{button}</span></TooltipTrigger>
              <TooltipContent>被阻塞：先完成 {blockers.join('、')}</TooltipContent>
            </Tooltip>
          ) : button;
        })}
      </div>
      {target && <TransitionPanel task={task} to={target} onClose={() => setTarget(null)} onChanged={onChanged} />}
      {complete && <CompletePanel task={task} to={complete} onClose={() => setComplete(null)} onChanged={onChanged} />}
    </>
  );
};

export default TransitionButtons;
