import { forwardRef, type HTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router';
import { CircleHelp, Copy, ExternalLink, Flag, GitCommitVertical, Lock, MessageSquare, MoreHorizontal, MoveRight, UserRound } from 'lucide-react';
import type { Status, TaskSummary } from '@/api/types';
import { ActorAvatar } from '@/components/ActorChip';
import RelativeTime from '@/components/RelativeTime';
import { useSnackbar } from '@/components/notify';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PriorityIcon, StatusIcon } from '@/features/tasks/StatusIcon';
import { PRIORITY_LABEL, PRIORITY_TEXT, STATUS_LABEL, transitionLabel } from '@/features/tasks/status';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  task: TaskSummary;
  showProject?: boolean;
  /** 拖动中留在原位的占位 */
  ghost?: boolean;
  /** DragOverlay 里跟手的那张 */
  overlay?: boolean;
  pending?: boolean;
  /** 「移动到」菜单里可选的目标；空 = 不显示菜单项 */
  targets?: Status[];
  onMove?: (to: Status) => void;
}

const MAX_LABELS = 2;

/**
 * 看板卡片（参照 shadcn UI kit 的 Kanban：优先级 / 标签在上，标题，进度，底部元信息）。
 * 拖拽监听挂在整张卡上；标题是真链接（Tab 能聚焦、回车打开），菜单按钮自己吞掉指针事件不触发拖动。
 */
const KanbanCard = forwardRef<HTMLDivElement, CardProps>(({ task, showProject, ghost, overlay, pending, targets = [], onMove, className, ...rest }, ref) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const labels = task.labels.slice(0, MAX_LABELS);
  const more = task.labels.length - labels.length;
  const isEpic = task.kind === 'epic';

  const copyId = async () => {
    try { await navigator.clipboard.writeText(task.id); enqueueSnackbar(`已复制 ${task.id}`, { variant: 'success', autoHideDuration: 1200 }); } catch { /* ignore */ }
  };

  return (
    <div
      ref={ref}
      data-task={task.id}
      className={cn(
        'group/card relative space-y-2.5 rounded-lg border bg-card p-3 text-card-foreground shadow-xs outline-none transition-[box-shadow,border-color,opacity]',
        'hover:border-foreground/15 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
        isEpic && 'border-l-3 border-l-primary',
        pending ? 'cursor-wait opacity-60' : 'cursor-grab active:cursor-grabbing',
        ghost && 'border-dashed bg-muted/40 opacity-50 shadow-none',
        overlay && 'rotate-[1.5deg] cursor-grabbing border-primary/30 shadow-xl ring-1 ring-primary/20',
        className,
      )}
      onClick={(e) => {
        if (e.defaultPrevented || pending) return;
        navigate(paths.task(task.id));
      }}
      {...rest}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('inline-flex h-5 items-center gap-1 rounded-md border bg-background px-1.5 text-[11px] font-semibold', PRIORITY_TEXT[task.priority])}>
          <PriorityIcon priority={task.priority} className="size-3" />{PRIORITY_LABEL[task.priority]}
        </span>
        {isEpic && (
          <span className="inline-flex h-5 items-center gap-1 rounded-md bg-primary/12 px-1.5 text-[11px] font-semibold text-primary">
            <Flag className="size-3" />Epic
          </span>
        )}
        {labels.map((label) => (
          <span key={label} className="inline-flex h-5 max-w-24 items-center truncate rounded-md bg-secondary px-1.5 text-[11px] font-medium text-secondary-foreground">{label}</span>
        ))}
        {more > 0 && (
          <Tooltip><TooltipTrigger asChild><span className="text-[11px] text-muted-foreground">+{more}</span></TooltipTrigger><TooltipContent>{task.labels.slice(MAX_LABELS).join('、')}</TooltipContent></Tooltip>
        )}
        <div className="flex-1" />
        {!overlay && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`${task.id} 操作`}
              className="-my-1 -mr-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100 data-[state=open]:opacity-100"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">{task.id}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => navigate(paths.task(task.id))}><ExternalLink className="size-4" />打开</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { void copyId(); }}><Copy className="size-4" />复制 ID</DropdownMenuItem>
              {targets.length > 0 && onMove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={pending}><MoveRight className="size-4" />移动到</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-40">
                      {targets.map((to) => (
                        <DropdownMenuItem key={to} onSelect={() => onMove(to)}>
                          <StatusIcon status={to} />{STATUS_LABEL[to]}
                          <span className="ml-auto text-xs text-muted-foreground">{transitionLabel(task.status, to)}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Link
        to={paths.task(task.id)}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="line-clamp-2 block text-sm leading-snug font-medium hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {task.title}
      </Link>

      {(task.blocked || task.open_question || (!isEpic && task.epic)) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {task.blocked && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground"><Lock className="size-3" />被阻塞</span>}
          {task.open_question && <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400"><CircleHelp className="size-3" />待回答</span>}
          {!isEpic && task.epic && <span className="inline-flex items-center gap-1 text-muted-foreground"><Flag className="size-3" />{task.epic}</span>}
        </div>
      )}

      {isEpic && task.progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>进度</span>
            <span className="tabular-nums">{task.progress.done}/{task.progress.active_total} · {Math.round(task.progress.percent)}%</span>
          </div>
          <Progress value={task.progress.percent} className="h-1.5" />
        </div>
      )}

      <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        <span className="font-mono text-[11px]">{showProject ? task.id : `#${task.seq}`}</span>
        {task.feedback_count > 0 && (
          <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-0.5 tabular-nums"><MessageSquare className="size-3.5" />{task.feedback_count}</span></TooltipTrigger><TooltipContent>{task.feedback_count} 条反馈</TooltipContent></Tooltip>
        )}
        {task.commits.length > 0 && (
          <Tooltip><TooltipTrigger asChild><span className="inline-flex items-center gap-0.5 tabular-nums"><GitCommitVertical className="size-3.5" />{task.commits.length}</span></TooltipTrigger><TooltipContent>{task.commits.length} 个提交</TooltipContent></Tooltip>
        )}
        <div className="flex-1" />
        <RelativeTime value={task.updated_at} className="text-[11px] text-muted-foreground" />
        {task.assignee
          ? <ActorAvatar name={task.assignee} kind={task.assignee_kind} size={20} />
          : (
            <Tooltip><TooltipTrigger asChild>
              <span className="inline-flex size-5 items-center justify-center rounded-full border border-dashed text-muted-foreground/70"><UserRound className="size-3" /></span>
            </TooltipTrigger><TooltipContent>未领取</TooltipContent></Tooltip>
          )}
      </div>
    </div>
  );
});
KanbanCard.displayName = 'KanbanCard';

export default KanbanCard;
