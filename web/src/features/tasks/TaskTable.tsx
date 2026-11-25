import { useNavigate } from 'react-router';
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown, CircleHelp, Copy, ExternalLink, EyeOff, Flag, MoreHorizontal, X } from 'lucide-react';
import { updateTask } from '@/api/tasks';
import type { Priority } from '@/api/types';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import EpicChip from '@/components/EpicChip';
import EpicProgressBar from '@/components/EpicProgressBar';
import BlockedChip from '@/components/BlockedChip';
import type { TaskSummary } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import TaskIdChip from '@/components/TaskIdChip';
import ActorChip from '@/components/ActorChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';
import { pageWindow, PAGE_SIZES, tableColumns, type ColumnKey } from './columns';
import { PRIORITY_LABEL, STATUS_LABEL } from './status';
import { PriorityIcon, StatusIcon } from './StatusIcon';

interface Props {
  rows: TaskSummary[];
  total: number;
  loading?: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** 给了才显示「每页行数」选择 */
  onPageSizeChange?: (size: number) => void;
  /** 跨项目列表显示项目列 */
  showProject?: boolean;
  /** 紧凑：嵌在卡片里（Epic 的步骤表）；去掉标签 / 提出人 / 反馈 / 更新列和所属 Epic chip */
  compact?: boolean;
  /** 用户隐藏的列（ColumnsMenu 管） */
  hidden?: ColumnKey[];
  /** 服务端排序（`field:dir`）；给了 onSortChange 列头才能点着排序 */
  sort?: string;
  onSortChange?: (sort: string | undefined) => void;
  /** 列头菜单里的「隐藏此列」 */
  onHideColumn?: (key: ColumnKey) => void;
  /** 每行末尾的 ⋯ 菜单（打开 / 复制 ID / 改优先级） */
  rowActions?: boolean;
  /** 行内改了任务之后（项目列表缓存已由 updateTask 刷新；查询页要自己刷） */
  onRowChanged?: () => unknown;
}

type SortField = 'id' | 'title' | 'status' | 'priority' | 'assignee' | 'feedback' | 'updated';
// 与后端 bosun_task 的缺省方向一致：点「排序」第一次就是最常用的方向
const DEFAULT_DIR: Record<SortField, 'asc' | 'desc'> = { id: 'desc', title: 'asc', status: 'asc', priority: 'desc', assignee: 'asc', feedback: 'desc', updated: 'desc' };

const parseSort = (sort?: string): { field: string; dir: 'asc' | 'desc' } | null => {
  if (!sort) return null;
  const [field, dir] = sort.split(':');
  return { field, dir: dir === 'asc' || dir === 'desc' ? dir : (DEFAULT_DIR[field as SortField] ?? 'asc') };
};

interface HeadProps {
  label: ReactNode;
  className?: string;
  field?: SortField;
  colKey?: ColumnKey;
  sort?: string;
  onSortChange?: (sort: string | undefined) => void;
  onHide?: (key: ColumnKey) => void;
}

// 列头（shadcn data-table 的 column header）：可排序的列点开有 升序 / 降序 / 取消排序 / 隐藏此列
const Head = ({ label, className, field, colKey, sort, onSortChange, onHide }: HeadProps) => {
  const canSort = !!field && !!onSortChange;
  const canHide = !!colKey && !!onHide;
  if (!canSort && !canHide) return <TableHead className={className}>{label}</TableHead>;
  const cur = parseSort(sort);
  const active = !!field && cur?.field === field ? cur.dir : null;
  const SortIcon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead className={className} aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={cn('-ml-2 h-7 gap-1 px-2 font-medium data-[state=open]:bg-accent', active && 'text-foreground')}>
            {label}{canSort && <SortIcon className={cn('size-3.5', !active && 'opacity-40')} />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-32">
          {canSort && (
            <>
              <DropdownMenuItem onSelect={() => onSortChange!(`${field}:asc`)}><ArrowUp className="size-4" />升序</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSortChange!(`${field}:desc`)}><ArrowDown className="size-4" />降序</DropdownMenuItem>
              {active && <DropdownMenuItem onSelect={() => onSortChange!(undefined)}><X className="size-4" />取消排序</DropdownMenuItem>}
            </>
          )}
          {canSort && canHide && <DropdownMenuSeparator />}
          {canHide && <DropdownMenuItem onSelect={() => onHide!(colKey!)}><EyeOff className="size-4" />隐藏此列</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableHead>
  );
};

// 行末菜单：点它不打开任务（行本身的 onClick）
const RowMenu = ({ row, onChanged }: { row: TaskSummary; onChanged?: () => unknown }) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const [busy, setBusy] = useState(false);
  const setPriority = async (p: Priority) => {
    if (p === row.priority) return;
    setBusy(true);
    try {
      await updateTask(row.id, { priority: p });
      await onChanged?.();
      enqueueSnackbar(`${row.id} 优先级 → ${PRIORITY_LABEL[p]}`, { variant: 'success', autoHideDuration: 1500 });
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground data-[state=open]:bg-accent" aria-label={`${row.id} 操作`} disabled={busy}
          onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">{row.id}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate(paths.task(row.id))}><ExternalLink className="size-4" />打开</DropdownMenuItem>
        <DropdownMenuItem onSelect={async () => { try { await navigator.clipboard.writeText(row.id); enqueueSnackbar(`已复制 ${row.id}`, { variant: 'success', autoHideDuration: 1200 }); } catch { /* ignore */ } }}>
          <Copy className="size-4" />复制 ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2"><PriorityIcon priority={row.priority} />优先级</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-32">
            <DropdownMenuRadioGroup value={row.priority} onValueChange={(v) => void setPriority(v as Priority)}>
              {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                <DropdownMenuRadioItem key={p} value={p}><PriorityIcon priority={p} />{PRIORITY_LABEL[p]}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// 任务表格：项目页与查询页共用；分页由调用方维护，这里只发出页码 / 每页行数变化
const TaskTable = ({ rows, total, loading, page, pageSize, onPageChange, onPageSizeChange, showProject = false, compact = false, hidden = [], sort, onSortChange, onHideColumn, rowActions, onRowChanged }: Props) => {
  const navigate = useNavigate();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFooter = !(compact && total <= pageSize);
  const cols = tableColumns({ showProject, compact });
  const on = (k: ColumnKey) => cols.includes(k) && !hidden.includes(k);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const go = (p: number) => { if (p !== page && p >= 0 && p < totalPages) onPageChange(p); };
  const h = { sort, onSortChange, onHide: onHideColumn };

  return (
    <Card className={cn('gap-0 overflow-hidden p-0 py-0', compact ? 'border-0 shadow-none' : 'border shadow-xs')}>
      <div className={cn(loading && 'pointer-events-none opacity-60')}>
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <Head label="ID" className="w-30" field="id" {...h} />
              {on('project') && <Head label="项目" className="w-22" colKey="project" {...h} />}
              <Head label="标题" className="min-w-60" field="title" {...h} />
              {on('status') && <Head label="状态" className="w-28" field="status" colKey="status" {...h} />}
              {on('priority') && <Head label="优先级" className="w-24" field="priority" colKey="priority" {...h} />}
              {on('labels') && <Head label="标签" className="w-45" colKey="labels" {...h} />}
              {on('created_by') && <Head label="提出人" className="w-35" colKey="created_by" {...h} />}
              {on('assignee') && <Head label="执行人" className="w-35" field="assignee" colKey="assignee" {...h} />}
              {on('feedback') && <Head label="反馈" className="w-20" field="feedback" colKey="feedback" {...h} />}
              {on('updated') && <Head label="更新" className="w-30" field="updated" colKey="updated" {...h} />}
              {rowActions && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(paths.task(row.id))}>
                <TableCell><TaskIdChip id={row.id} /></TableCell>
                {on('project') && <TableCell className="font-mono text-xs">{row.project_key}</TableCell>}
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    {row.kind === 'epic' && (
                      <Tooltip><TooltipTrigger asChild><Flag className="size-4 shrink-0 text-primary" /></TooltipTrigger><TooltipContent>Epic</TooltipContent></Tooltip>
                    )}
                    {row.open_question && (
                      <Tooltip><TooltipTrigger asChild><CircleHelp className="size-4 shrink-0 text-amber-600" /></TooltipTrigger><TooltipContent>Agent 有提问待回答</TooltipContent></Tooltip>
                    )}
                    {row.blocked && <BlockedChip />}
                    <span className={cn('min-w-0 truncate', row.kind === 'epic' ? 'font-bold' : 'font-medium')}>{row.title}</span>
                    {row.kind === 'epic' && row.progress && <EpicProgressBar progress={row.progress} width={140} />}
                    {!compact && row.epic && <EpicChip id={row.epic} />}
                  </div>
                </TableCell>
                {on('status') && <TableCell><span className="inline-flex items-center gap-1.5 text-sm font-medium"><StatusIcon status={row.status} />{STATUS_LABEL[row.status]}</span></TableCell>}
                {on('priority') && <TableCell><span className="inline-flex items-center gap-1.5 text-sm"><PriorityIcon priority={row.priority} />{PRIORITY_LABEL[row.priority]}</span></TableCell>}
                {on('labels') && (
                  <TableCell>
                    <div className="flex max-w-44 gap-1 overflow-hidden">
                      {row.labels.map((label) => <Badge key={label} variant="secondary" className="shrink-0">{label}</Badge>)}
                    </div>
                  </TableCell>
                )}
                {on('created_by') && <TableCell><ActorChip name={row.created_by} kind={row.created_by_kind} /></TableCell>}
                {on('assignee') && <TableCell>{row.assignee ? <ActorChip name={row.assignee} kind={row.assignee_kind} /> : <span className="text-xs text-muted-foreground/70">—</span>}</TableCell>}
                {on('feedback') && <TableCell className="tabular-nums">{row.feedback_count}</TableCell>}
                {on('updated') && <TableCell><RelativeTime value={row.updated_at} /></TableCell>}
                {rowActions && <TableCell className="pr-2 text-right" onClick={(e) => e.stopPropagation()}><RowMenu row={row} onChanged={onRowChanged} /></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">没有任务</div>}
        {loading && rows.length === 0 && (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}
      </div>
      {showFooter && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-3 py-2 text-sm text-muted-foreground">
          <span className="tabular-nums">{total === 0 ? '共 0 个任务' : `${from}–${to}，共 ${total} 个任务`}</span>
          <div className="flex-1" />
          {onPageSizeChange && (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">每页</span>
              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger size="sm" className="h-8 w-18" aria-label="每页行数"><SelectValue /></SelectTrigger>
                <SelectContent side="top">
                  {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <span className="whitespace-nowrap tabular-nums">第 {page + 1} / {totalPages} 页</span>
          <nav className="flex items-center gap-1" aria-label="分页">
            <Button variant="outline" size="icon" className="hidden size-8 lg:inline-flex" disabled={page <= 0 || loading} onClick={() => go(0)} aria-label="第一页"><ChevronsLeft /></Button>
            <Button variant="outline" size="icon" className="size-8" disabled={page <= 0 || loading} onClick={() => go(page - 1)} aria-label="上一页"><ChevronLeft /></Button>
            <div className="hidden items-center gap-1 sm:flex">
              {pageWindow(page, totalPages).map((p, i) => p === null
                ? <span key={`gap-${i}`} className="w-6 text-center">…</span>
                : (
                  <Button key={p} variant={p === page ? 'secondary' : 'ghost'} size="sm" className={cn('h-8 min-w-8 px-2 tabular-nums', p === page && 'pointer-events-none font-semibold text-foreground')}
                    aria-current={p === page ? 'page' : undefined} disabled={loading} onClick={() => go(p)}>
                    {p + 1}
                  </Button>
                ))}
            </div>
            <Button variant="outline" size="icon" className="size-8" disabled={page + 1 >= totalPages || loading} onClick={() => go(page + 1)} aria-label="下一页"><ChevronRight /></Button>
            <Button variant="outline" size="icon" className="hidden size-8 lg:inline-flex" disabled={page + 1 >= totalPages || loading} onClick={() => go(totalPages - 1)} aria-label="最后一页"><ChevronsRight /></Button>
          </nav>
        </div>
      )}
    </Card>
  );
};

export default TaskTable;
