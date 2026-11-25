import { useState, type ReactNode } from 'react';
import { assignMilestone } from '@/api/milestones';
import { updateTask } from '@/api/tasks';
import type { Milestone, TaskSummary } from '@/api/types';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import { MilestoneContext } from './context';
import MoveMilestoneDialog from './MoveMilestoneDialog';

interface Props {
  projectKey: string;
  milestones: Milestone[];
  /** 移动成功后（比如清掉列表勾选） */
  onMoved?: () => void;
  children: ReactNode;
}

/**
 * 给看板卡片 / 列表行菜单 / 批量条提供「移到某个 milestone」。
 * 全是从待规划排进来的直接改；有任务要从别的 milestone 移出时先弹原因框（记进 milestone_log）。
 */
const MilestoneMoveProvider = ({ projectKey, milestones, onMoved, children }: Props) => {
  const [pending, setPending] = useState<{ tasks: TaskSummary[]; toId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const nameOf = (id: string | null) => (id ? milestones.find((m) => m.id === id)?.name ?? id : null);

  const run = async (tasks: TaskSummary[], toId: string, comment?: string) => {
    setBusy(true);
    try {
      const target = nameOf(toId) ?? '待规划';
      if (tasks.length === 1) {
        await updateTask(tasks[0].id, { milestone: toId, milestone_comment: comment || undefined });
        enqueueSnackbar(`${tasks[0].id} → ${target}`, { variant: 'success', autoHideDuration: 1500 });
      } else {
        const r = await assignMilestone(projectKey, tasks.map((t) => t.id), toId, comment);
        enqueueSnackbar(r.failed.length ? `${r.updated.length} 个移到 ${target}，${r.failed.length} 个失败：${r.failed[0].reason}` : `${r.updated.length} 个任务 → ${target}`,
          { variant: r.failed.length ? 'warning' : 'success' });
      }
      setPending(null);
      onMoved?.();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const value = {
    milestones,
    requestMove: (tasks: TaskSummary[], toId: string) => {
      const moving = tasks.filter((t) => (t.milestone ?? '') !== toId);
      if (!moving.length) return;
      if (moving.every((t) => !t.milestone)) void run(moving, toId);
      else setPending({ tasks: moving, toId });
    },
  };

  const froms = pending ? [...new Set(pending.tasks.map((t) => t.milestone))] : [];
  return (
    <MilestoneContext.Provider value={value}>
      {children}
      {pending && (
        <MoveMilestoneDialog
          subject={pending.tasks.length === 1 ? pending.tasks[0].id : `${pending.tasks.length} 个任务`}
          fromName={froms.length === 1 ? nameOf(froms[0]) : '多个 milestone'}
          toName={nameOf(pending.toId)}
          hasEpic={pending.tasks.some((t) => t.kind === 'epic')}
          busy={busy}
          onClose={() => setPending(null)}
          onConfirm={(comment) => void run(pending.tasks, pending.toId, comment)}
        />
      )}
    </MilestoneContext.Provider>
  );
};

export default MilestoneMoveProvider;
