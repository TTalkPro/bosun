import { useMemo, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { cn } from '@/lib/utils';
import { transitionTask } from '@/api/tasks';
import type { Status, TaskSummary } from '@/api/types';
import ActorChip from '@/components/ActorChip';
import BlockedChip from '@/components/BlockedChip';
import StatusChip from '@/components/StatusChip';
import TaskIdChip from '@/components/TaskIdChip';
import { useApiError } from '@/components/useApiError';
import { ALL_STATUSES, nextStatuses, PRIORITY_LABEL, STATUS_LABEL } from '@/features/tasks/status';
import { paths } from '@/routes/paths';

interface Props {
  tasks: TaskSummary[];
  /** 步骤迁移成功后重新拉 Epic 详情（后端会级联 Epic 自己的状态与进度）。
   *  注意迁移接口返回的是**步骤**，不能拿它去覆盖 Epic 的缓存。 */
  onChanged: () => unknown;
}

/**
 * Epic 子任务看板。HTML5 DnD 就够用，不把拖拽库引入关键路径；
 * 拖放仍走 transition API，前端不做非法状态变更。
 */
const EpicKanban = ({ tasks, onChanged }: Props) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Status | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  // 只有乐观移动中的任务；接口返回后从详情缓存覆盖
  const [moves, setMoves] = useState<Record<string, Status>>({});

  const rows = useMemo(
    () => tasks.map((task) => ({ ...task, status: moves[task.id] ?? task.status })),
    [tasks, moves],
  );
  const columns = useMemo(() => ALL_STATUSES.map((status) => ({
    status,
    items: rows.filter((task) => task.status === status),
  })), [rows]);

  const move = async (id: string, from: Status, to: Status) => {
    if (from === to || !isForwardOnly(from, to)) return;
    setMoves((prev) => ({ ...prev, [id]: to }));
    setPending((prev) => prev.includes(id) ? prev : [...prev, id]);
    try {
      await transitionTask(id, to);
      // 等 Epic 详情拉回来再撤掉乐观状态，卡片不会先跳回旧列
      await onChanged();
      enqueueSnackbar(`已移动到${STATUS_LABEL[to]}`, { variant: 'success' });
    } catch (e) {
      handleError(e);
    } finally {
      setMoves((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setPending((prev) => prev.filter((x) => x !== id));
    }
  };

  return (
    <div className="grid items-start gap-3 md:grid-cols-[repeat(3,minmax(220px,1fr))] xl:grid-cols-[repeat(6,minmax(210px,1fr))]">
      {columns.map(({ status, items }) => {
        const active = dragging ? items.some(({ id }) => id === dragging) : false;
        const droppable = !!dragging && rows.some((task) => task.id === dragging && nextStatuses(task.status).includes(status));
        return (
          <div
            key={status}
            className={cn(
              'min-h-44 rounded-[10px] border bg-card p-2 text-card-foreground transition-colors',
              dropTarget === status && droppable && 'bg-accent outline-2 outline-dashed',
              active && items.length === 0 && 'opacity-65',
            )}
            onDragOver={(e: DragEvent) => {
              if (!droppable) return;
              e.preventDefault();
              setDropTarget(status);
            }}
            onDragLeave={() => setDropTarget((v) => v === status ? null : v)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/bosun-task');
              const task = rows.find((row) => row.id === id);
              setDropTarget(null);
              setDragging(null);
              if (task) void move(task.id, task.status, status);
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <StatusChip status={status} />
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((task) => (
                <div
                  key={task.id}
                  draggable={!pending.includes(task.id)}
                  onDragStart={(e: DragEvent) => {
                    e.dataTransfer.setData('text/bosun-task', task.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragging(task.id);
                  }}
                  onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                  onClick={() => navigate(paths.task(task.id))}
                  className={cn(
                    'rounded-[10px] border p-2.5 transition-opacity',
                    pending.includes(task.id) ? 'cursor-wait opacity-55' : 'cursor-grab',
                    dragging === task.id && 'opacity-45',
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TaskIdChip id={task.id} />
                      {task.open_question && <CircleHelp className="size-4 text-amber-500" />}
                      {task.blocked && <BlockedChip />}
                      <div className="flex-1" />
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{task.project_key}</span>
                      <span className="text-muted-foreground/60">·</span>
                      <span>{PRIORITY_LABEL[task.priority]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.assignee
                        ? <ActorChip name={task.assignee} kind={task.assignee_kind} size={18} />
                        : <span className="text-xs text-muted-foreground/60">未领取</span>}
                      <div className="flex-1" />
                      {task.feedback_count > 0 && (
                        <span className="text-xs text-muted-foreground">{task.feedback_count} 反馈</span>
                      )}
                      <select
                        aria-label={`移动 ${task.id}`}
                        value=""
                        disabled={pending.includes(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const to = e.target.value as Status;
                          if (to) void move(task.id, task.status, to);
                        }}
                        className="h-6 rounded border bg-background px-1 text-xs"
                      >
                        <option value="">移动…</option>
                        {nextStatuses(task.status).map((to) => (
                          <option key={to} value={to}>{STATUS_LABEL[to]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <span className="block px-1 py-2 text-xs text-muted-foreground/60">
                  {droppable ? '拖到这里' : '没有任务'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// 只允许状态机的一步迁移；跨多步请走正常任务流
function isForwardOnly(from: Status, to: Status) {
  return nextStatuses(from).includes(to);
}

export default EpicKanban;
