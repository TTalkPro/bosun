import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDraggable, useDroppable,
  useSensor, useSensors, type Announcements, type KeyboardCoordinateGetter, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowUp, ChevronsLeftRight, ChevronsRightLeft, Eye, LayoutGrid, Loader2, MoreHorizontal, Plus } from 'lucide-react';
import { fetcher } from '@/api/client';
import { transitionTask } from '@/api/tasks';
import type { Status, Task, TaskSummary } from '@/api/types';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CompletePanel from '@/features/status/CompletePanel';
import TransitionPanel from '@/features/status/TransitionPanel';
import { StatusIcon } from '@/features/tasks/StatusIcon';
import { ALL_STATUSES, isForward, nextStatuses, STATUS_BAR, STATUS_LABEL } from '@/features/tasks/status';
import { canMove, compareTasks, type BoardSort } from './rules';
import { cn } from '@/lib/utils';
import KanbanCard from './KanbanCard';

interface Props {
  tasks: TaskSummary[];
  /** 迁移成功后由调用方刷新数据（项目页：列表缓存已由 transitionTask 失效；Epic 页：重拉 Epic 详情）。
   *  返回 Promise 时等它完成再撤掉乐观状态，卡片不会先跳回旧列 */
  onChanged?: () => unknown;
  /** 只显示这些列（状态筛选）；缺省全部 */
  statuses?: Status[];
  showProject?: boolean;
  /** 「新建」列头上的 + */
  onCreate?: () => void;
  /** 列表区固定高度并各自滚动（项目页）；否则随内容撑开（嵌在 Epic 卡片里） */
  fill?: boolean;
  /** 折叠状态存 localStorage 的键；不给就不记 */
  storageKey?: string;
  /** 列内排序；缺省优先级 */
  sort?: BoardSort;
  /** 在「新建」列里直接输入标题创建（回车提交、可连续添加）；失败时抛出，输入框保留内容 */
  onQuickCreate?: (title: string) => Promise<unknown>;
  /** 「更多选项…」：带着已输入的标题打开完整的新建面板 */
  onCreateWithTitle?: (title: string) => void;
  /** 列菜单「只看这一列」/「显示全部列」；不给就没有这两项 */
  onFocusColumn?: (status: Status | null) => void;
}


const DEFAULT_COLLAPSED: Status[] = ['REJECTED', 'CANCELLED'];

const readCollapsed = (key?: string): Status[] => {
  if (!key) return DEFAULT_COLLAPSED;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_COLLAPSED;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((s): s is Status => (ALL_STATUSES as string[]).includes(s)) : DEFAULT_COLLAPSED;
  } catch {
    return DEFAULT_COLLAPSED;
  }
};


/** 键盘拖动：左右方向键直接跳到相邻的可放列（不可放的列是 disabled，自然跳过），上下键小步滚动 */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { droppableRects, droppableContainers, collisionRect } }) => {
  if (!collisionRect) return undefined;
  if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
    event.preventDefault();
    return { x: collisionRect.left, y: collisionRect.top + (event.code === 'ArrowDown' ? 60 : -60) };
  }
  const dir = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0;
  if (!dir) return undefined;
  event.preventDefault();
  const cx = collisionRect.left + collisionRect.width / 2;
  const centers = droppableContainers.getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => r.left + r.width / 2)
    .filter((x) => (dir > 0 ? x > cx + 1 : x < cx - 1))
    .sort((a, b) => dir * (a - b));
  if (centers[0] === undefined) return undefined;
  return { x: centers[0] - collisionRect.width / 2, y: collisionRect.top };
};

type Panel = { kind: 'complete' | 'reason'; task: Task; to: Status };

/**
 * 任务看板：按状态分列，拖动卡片 = 状态迁移（走 transition API，前端不做非法变更）。
 * - 开始（NEW → IN_PROGRESS）直接提交；完成 / 验收弹完成证据面板；打回 / 拒绝 / 撤销 / 恢复弹说明面板——
 *   与详情页的按钮同一套规则，拖拽不是绕过评审说明的捷径。面板关掉没提交，卡片回到原列。
 * - 拖动时只有合法目标列亮起，其余列变暗；被阻塞的任务拖不进「进行中」。
 * - 指针 / 触屏（长按）/ 键盘（空格拿起、方向键移动、空格放下）都能拖；卡片菜单里也有「移动到」。
 */
const KanbanBoard = ({ tasks, onChanged, statuses, showProject, onCreate, fill, storageKey, sort = 'priority', onQuickCreate, onCreateWithTitle, onFocusColumn }: Props) => {
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<Status | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  // 乐观移动：接口回来、调用方刷新完再撤
  const [moves, setMoves] = useState<Record<string, Status>>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [collapsed, setCollapsed] = useState<Status[]>(() => readCollapsed(storageKey));
  // 「新建」列里的快速添加框是否打开
  const [composing, setComposing] = useState(false);
  const lastDragEnd = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const rows = useMemo(() => tasks.map((t) => (moves[t.id] ? { ...t, status: moves[t.id] } : t)), [tasks, moves]);
  const visible = statuses?.length ? ALL_STATUSES.filter((s) => statuses.includes(s)) : ALL_STATUSES;
  const columns = useMemo(() => visible.map((status) => ({
    status,
    items: rows.filter((t) => t.status === status).sort(compareTasks(sort)),
  })), [rows, visible, sort]);
  const focused = visible.length === 1;
  // 打开快速添加时：「新建」列折叠着就先展开
  const startComposing = () => {
    if (collapsed.includes('NEW')) toggleCollapsed('NEW');
    setComposing(true);
  };
  const active = activeId ? rows.find((t) => t.id === activeId) ?? null : null;

  const toggleCollapsed = (s: Status) => setCollapsed((prev) => {
    const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ } }
    return next;
  });

  const clearMove = useCallback((id: string) => {
    setMoves((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setPending((prev) => prev.filter((x) => x !== id));
  }, []);

  const move = async (task: TaskSummary, to: Status) => {
    if (!canMove(task, to) || pending.includes(task.id)) return;
    setMoves((prev) => ({ ...prev, [task.id]: to }));
    setPending((prev) => [...prev, task.id]);
    try {
      if (isForward(task.status, to) && to === 'IN_PROGRESS') {
        await transitionTask(task.id, to);
        await onChanged?.();
        enqueueSnackbar(`${task.id} → ${STATUS_LABEL[to]}`, { variant: 'success' });
        clearMove(task.id);
        return;
      }
      // 面板要完整任务（历史里最近一次 DONE 的测试证据决定自验收要不要再填测试）
      const full = await fetcher<Task>(`/tasks/${task.id}`);
      setPanel({ kind: to === 'DONE' || to === 'VERIFIED' ? 'complete' : 'reason', task: full, to });
    } catch (e) {
      handleError(e);
      clearMove(task.id);
    }
  };

  const changedRef = useRef(false);
  const closePanel = async () => {
    const p = panel;
    setPanel(null);
    if (!p) return;
    if (changedRef.current) {
      changedRef.current = false;
      try { await onChanged?.(); } catch { /* 刷新失败不影响已完成的迁移 */ }
    }
    clearMove(p.task.id);
  };

  const onDragStart = ({ active: a }: DragStartEvent) => setActiveId(String(a.id));
  const onDragOver = ({ over }: DragOverEvent) => setOverId((over?.id as Status | undefined) ?? null);
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    setActiveId(null);
    setOverId(null);
    const task = rows.find((t) => t.id === a.id);
    const to = over?.id as Status | undefined;
    if (!task || !to || to === task.status) return;
    if (!canMove(task, to)) {
      enqueueSnackbar(task.blocked && to === 'IN_PROGRESS'
        ? `${task.id} 被阻塞：先完成它依赖的任务`
        : `不能从「${STATUS_LABEL[task.status]}」直接到「${STATUS_LABEL[to]}」`, { variant: 'warning' });
      return;
    }
    void move(task, to);
  };

  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `拿起 ${a.id}`,
    onDragOver: ({ active: a, over }) => over ? `${a.id} 在「${STATUS_LABEL[over.id as Status]}」上方${active && !canMove(active, over.id as Status) ? '（不可放）' : ''}` : `${a.id} 不在任何列上`,
    onDragEnd: ({ active: a, over }) => over ? `${a.id} 放到「${STATUS_LABEL[over.id as Status]}」` : `${a.id} 放回原处`,
    onDragCancel: ({ active: a }) => `取消移动 ${a.id}`,
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => { setActiveId(null); setOverId(null); }}
        accessibility={{ announcements, screenReaderInstructions: { draggable: '按空格拿起卡片，方向键移到别的列，再按空格放下；Esc 取消。' } }}
      >
        <div
          className="flex items-start gap-3 overflow-x-auto pb-2"
          // 拖完松手时浏览器可能补一个 click，别把它当成「打开任务」
          onClickCapture={(e) => { if (Date.now() - lastDragEnd.current < 250) { e.preventDefault(); e.stopPropagation(); } }}
        >
          {columns.map(({ status, items }) => (
            <Column
              key={status}
              status={status}
              count={items.length}
              collapsed={collapsed.includes(status)}
              onToggle={() => toggleCollapsed(status)}
              dragging={active}
              isOver={overId === status}
              onCreate={status === 'NEW' ? (onQuickCreate ? startComposing : onCreate) : undefined}
              fill={fill}
              highCount={status === 'NEW' || status === 'IN_PROGRESS' || status === 'DONE' ? items.filter((t) => t.priority === 'high').length : 0}
              focused={focused}
              onFocus={onFocusColumn ? () => onFocusColumn(focused ? null : status) : undefined}
            >
              {status === 'NEW' && composing && onQuickCreate && (
                <QuickAdd
                  onSubmit={onQuickCreate}
                  onClose={() => setComposing(false)}
                  onMore={onCreateWithTitle ? (title) => { setComposing(false); onCreateWithTitle(title); } : undefined}
                />
              )}
              {items.map((task) => (
                <DraggableCard
                  key={task.id}
                  task={task}
                  showProject={showProject}
                  pending={pending.includes(task.id)}
                  onMove={(to) => void move(task, to)}
                />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
          {active ? <KanbanCard task={active} showProject={showProject} overlay className="w-[272px]" /> : null}
        </DragOverlay>
      </DndContext>

      {panel?.kind === 'complete' && (
        <CompletePanel task={panel.task} to={panel.to as 'DONE' | 'VERIFIED'} onClose={() => void closePanel()} onChanged={() => { changedRef.current = true; }} />
      )}
      {panel?.kind === 'reason' && (
        <TransitionPanel task={panel.task} to={panel.to} onClose={() => void closePanel()} onChanged={() => { changedRef.current = true; }} />
      )}
    </>
  );
};

interface ColumnProps {
  status: Status;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  dragging: TaskSummary | null;
  isOver: boolean;
  onCreate?: () => void;
  fill?: boolean;
  /** 列头的高优先级计数（0 不显示） */
  highCount?: number;
  /** 现在是不是只显示这一列 */
  focused?: boolean;
  onFocus?: () => void;
  children: React.ReactNode;
}

const Column = ({ status, count, collapsed, onToggle, dragging, isOver, onCreate, fill, highCount = 0, focused, onFocus, children }: ColumnProps) => {
  const allowed = !!dragging && canMove(dragging, status);
  const { setNodeRef } = useDroppable({ id: status, disabled: !!dragging && !allowed && dragging.status !== status });
  const source = dragging?.status === status;

  const frame = cn(
    'relative shrink-0 overflow-hidden rounded-xl border bg-muted/40 transition-[background-color,border-color,opacity,box-shadow] duration-150 dark:bg-muted/20',
    dragging && !allowed && !source && 'opacity-45',
    allowed && 'border-dashed border-primary/50',
    allowed && isOver && 'border-solid border-primary bg-primary/6 shadow-[0_0_0_3px] shadow-primary/15',
  );

  if (collapsed) {
    return (
      <div ref={setNodeRef} className={cn(frame, 'flex w-11 flex-col items-center gap-2 py-3', fill && 'self-stretch')} data-status={status}>
        <span className={cn('absolute inset-x-0 top-0 h-0.5', STATUS_BAR[status])} />
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" onClick={onToggle} aria-label={`展开${STATUS_LABEL[status]}`}><ChevronsLeftRight className="size-4" /></Button>
        </TooltipTrigger><TooltipContent side="right">展开</TooltipContent></Tooltip>
        <StatusIcon status={status} />
        <span className="rounded-full bg-background px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{count}</span>
        <span className="text-sm font-semibold [writing-mode:vertical-rl]">{STATUS_LABEL[status]}</span>
      </div>
    );
  }

  return (
    <section ref={setNodeRef} aria-label={STATUS_LABEL[status]} data-status={status} className={cn(frame, 'flex w-[288px] flex-col')}>
      <span className={cn('absolute inset-x-0 top-0 h-0.5', STATUS_BAR[status])} />
      <header className="flex h-11 items-center gap-2 px-3 pt-0.5">
        <StatusIcon status={status} />
        <h3 className="text-sm font-semibold">{STATUS_LABEL[status]}</h3>
        <span className="rounded-full bg-background px-2 py-px text-[11px] font-semibold tabular-nums text-muted-foreground shadow-xs">{count}</span>
        {highCount > 0 && (
          <Tooltip><TooltipTrigger asChild>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums text-destructive"><ArrowUp className="size-3" />{highCount}</span>
          </TooltipTrigger><TooltipContent>{highCount} 个高优先级</TooltipContent></Tooltip>
        )}
        <div className="flex-1" />
        {onCreate && (
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={onCreate} aria-label="新建任务"><Plus className="size-4" /></Button>
          </TooltipTrigger><TooltipContent>新建任务</TooltipContent></Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`${STATUS_LABEL[status]} 列操作`}><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {onCreate && <DropdownMenuItem onSelect={onCreate}><Plus className="size-4" />新建任务</DropdownMenuItem>}
            {onFocus && (
              <DropdownMenuItem onSelect={onFocus}>
                {focused ? <><LayoutGrid className="size-4" />显示全部列</> : <><Eye className="size-4" />只看这一列</>}
              </DropdownMenuItem>
            )}
            {(onCreate || onFocus) && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={onToggle}><ChevronsRightLeft className="size-4" />折叠</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className={cn('flex flex-col gap-2 px-2 pb-2', fill && 'h-[calc(100svh-18.5rem)] min-h-64 overflow-y-auto')}>
        {children}
        {count === 0 && (
          <div className={cn(
            'flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground/70',
            allowed && 'border-primary/40 text-primary',
          )}>
            {allowed ? '拖到这里' : '没有任务'}
          </div>
        )}
        {onCreate && count > 0 && (
          <button type="button" onClick={onCreate} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
            <Plus className="size-3.5" />新建任务
          </button>
        )}
      </div>
    </section>
  );
};

// 快速添加：只要标题。回车提交后清空、留着继续加；Esc 关；「更多选项…」带着标题去完整面板
const QuickAdd = ({ onSubmit, onClose, onMore }: { onSubmit: (title: string) => Promise<unknown>; onClose: () => void; onMore?: (title: string) => void }) => {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onSubmit(t); setTitle(''); } catch { /* 调用方已提示；保留输入 */ } finally { setBusy(false); }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  return (
    <div className="rounded-lg border border-primary/40 bg-card p-2 shadow-sm">
      <Textarea autoFocus rows={2} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKeyDown} disabled={busy}
        aria-label="新任务标题" placeholder="输入标题，回车创建" className="min-h-14 resize-none border-0 p-1 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent" />
      <div className="mt-1 flex items-center gap-1.5">
        <Button size="sm" className="h-7" onClick={() => void submit()} disabled={busy || !title.trim()}>{busy && <Loader2 className="animate-spin" />}添加</Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={onClose}>取消</Button>
        <div className="flex-1" />
        {onMore && <button type="button" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => onMore(title.trim())}>更多选项…</button>}
      </div>
    </div>
  );
};

const DraggableCard = ({ task, showProject, pending, onMove }: { task: TaskSummary; showProject?: boolean; pending: boolean; onMove: (to: Status) => void }) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.id, disabled: pending });
  return (
    <KanbanCard
      ref={setNodeRef}
      task={task}
      showProject={showProject}
      pending={pending}
      ghost={isDragging}
      targets={nextStatuses(task.status).filter((to) => canMove(task, to))}
      onMove={onMove}
      {...attributes}
      {...listeners}
      aria-roledescription="可拖动的任务卡片"
    />
  );
};

export default KanbanBoard;
