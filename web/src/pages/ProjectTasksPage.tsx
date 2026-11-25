import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ChevronDown, Columns3, List, Plus, Settings } from 'lucide-react';
import { useProject } from '@/api/projects';
import { createTask, useTasks } from '@/api/tasks';
import type { Status, TaskFilter, TaskKind } from '@/api/types';
import { isApiError } from '@/api/client';
import MarkdownView from '@/components/markdown/MarkdownView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStats } from '@/api/stats';
import BoardToolbar from '@/features/board/BoardToolbar';
import KanbanBoard from '@/features/board/KanbanBoard';
import { EMPTY_BOARD_FILTER, isBoardFilterActive, matchesBoardFilter, readBoardFilter, writeBoardFilter, type BoardFilter, type BoardSort } from '@/features/board/rules';
import ListFacets from '@/features/tasks/ListFacets';
import { rememberSort, rememberView, storedSort, storedView, type TasksView as View } from '@/features/tasks/prefs';
import TaskStatCards from '@/features/dashboard/TaskStatCards';
import ProjectFormDialog from '@/features/projects/ProjectFormDialog';
import TaskFilters from '@/features/tasks/TaskFilters';
import TaskFormDialog from '@/features/tasks/TaskFormDialog';
import TaskTable from '@/features/tasks/TaskTable';
import ColumnsMenu from '@/features/tasks/ColumnsMenu';
import { DEFAULT_PAGE_SIZE, normalizePageSize, rememberPageSize, storedPageSize, tableColumns, useHiddenColumns } from '@/features/tasks/columns';
import { ALL_STATUSES } from '@/features/tasks/status';
import { paths } from '@/routes/paths';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import { cn } from '@/lib/utils';
import NotFoundPage from './NotFoundPage';

/** 看板一次拉全（后端单页上限 500） */
const BOARD_LIMIT = 500;

// 筛选 ↔ URL query（刷新不丢）
const readFilter = (sp: URLSearchParams): TaskFilter => {
  const status = sp.get('status')?.split(',').filter((s): s is Status => (ALL_STATUSES as string[]).includes(s));
  return {
    status: status?.length ? status : undefined,
    q: sp.get('q') || undefined,
    kind: (['task', 'epic'] as const).find((k) => k === sp.get('kind')) as TaskKind | undefined,
    sort: sp.get('sort') || undefined,
    offset: Number(sp.get('offset') || 0) || 0,
    limit: sp.get('size') ? normalizePageSize(Number(sp.get('size'))) : storedPageSize(),
  };
};
const writeFilter = (f: TaskFilter): URLSearchParams => {
  const sp = new URLSearchParams();
  if (f.status?.length) sp.set('status', f.status.join(','));
  if (f.q) sp.set('q', f.q);
  if (f.kind) sp.set('kind', f.kind);
  if (f.sort) sp.set('sort', f.sort);
  if (f.offset) sp.set('offset', String(f.offset));
  if (f.limit && f.limit !== DEFAULT_PAGE_SIZE) sp.set('size', String(f.limit));
  return sp;
};
// 执行人 / 优先级 / 需要关注：看板（前端过滤）与列表（服务端过滤）共用这几个 URL 参数，改别的筛选、切视图时原样带上
const BOARD_PARAMS = ['who', 'pri', 'attn'];
const carryBoard = (from: URLSearchParams, to: URLSearchParams): URLSearchParams => {
  BOARD_PARAMS.forEach((k) => { const v = from.get(k); if (v) to.set(k, v); });
  return to;
};

const readView = (sp: URLSearchParams): View => {
  const v = sp.get('view');
  return v === 'list' || v === 'board' ? v : storedView();
};

const ProjectTasksPage = () => {
  const { key = '' } = useParams();
  const projectKey = key.toUpperCase();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const filter = useMemo(() => readFilter(sp), [sp]);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const view = readView(sp);
  const withView = (next: URLSearchParams, v: View) => { next.set('view', v); return next; };
  const setFilter = (f: TaskFilter) => setSp(carryBoard(sp, withView(writeFilter(f), view)), { replace: true });
  const setView = (v: View) => {
    rememberView(v);
    setSp(carryBoard(sp, withView(writeFilter({ ...filter, offset: 0 }), v)), { replace: true });
  };
  const boardFilter = useMemo(() => readBoardFilter(sp), [sp]);
  // 分面变了从第一页看起（列表视图）
  const setBoardFilter = (f: BoardFilter) => { const next = writeBoardFilter(sp, f); next.delete('offset'); setSp(next, { replace: true }); };
  const [sort, setSortState] = useState<BoardSort>(storedSort);
  const setSort = (s: BoardSort) => { setSortState(s); rememberSort(s); };

  const { data: project, error: projectError, isLoading: loadingProject } = useProject(projectKey);
  // 看板：状态筛选只决定显示哪几列，请求里不带分页
  // 看板：一次拉全、在前端筛与排（列内排序看工具条）；列表：分面与排序交给服务端，翻页才对
  const boardQuery = useMemo(() => ({ ...filter, sort: undefined, offset: 0, limit: BOARD_LIMIT }), [filter]);
  const listQuery = useMemo(() => ({
    ...filter,
    priority: boardFilter.priority.length ? boardFilter.priority : undefined,
    assignee: boardFilter.who.length ? boardFilter.who : undefined,
    attention: boardFilter.attention || undefined,
  }), [filter, boardFilter]);
  const { data, isLoading } = useTasks(project ? projectKey : undefined, view === 'board' ? boardQuery : listQuery);
  const boardTasks = useMemo(() => (data?.tasks ?? []).filter((t) => matchesBoardFilter(t, boardFilter)), [data, boardFilter]);
  const [createTitle, setCreateTitle] = useState<string | undefined>(undefined);
  const quickCreate = async (title: string) => {
    try {
      const t = await createTask(projectKey, { title });
      enqueueSnackbar(`已创建 ${t.id}`, { variant: 'success', autoHideDuration: 1500 });
    } catch (e) { handleError(e); throw e; }
  };
  // 统计按整个项目算，不跟筛选走（筛选只影响下面的看板 / 列表）
  const { data: stats } = useStats(14, project ? projectKey : undefined);
  const [hidden, setHidden] = useHiddenColumns('bosun.tasks.columns');
  const pageSize = filter.limit ?? DEFAULT_PAGE_SIZE;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  if (isApiError(projectError) && projectError.status === 404) return <NotFoundPage message={`项目 ${projectKey} 不存在`} />;

  const viewSwitch = (
    <div className="inline-flex h-8 items-center rounded-md border p-0.5" role="tablist" aria-label="视图">
      {([['board', '看板', Columns3], ['list', '列表', List]] as const).map(([v, label, Icon]) => (
        <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
          className={cn('inline-flex h-6.5 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors',
            view === v ? 'bg-secondary text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
          <Icon className="size-3.5" />{label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {loadingProject ? <Skeleton className="h-9 w-60" /> : (
            <>
              <div className="flex items-center gap-2.5">
                <h1 className="truncate text-2xl font-bold tracking-tight">{project?.name}</h1>
                <Badge variant="outline" className="font-mono font-semibold">{projectKey}</Badge>
                {project?.archived && <Badge variant="secondary">已归档</Badge>}
                {project?.description && (
                  <Button variant="ghost" size="icon" className={cn('size-7 transition-transform', descOpen && 'rotate-180')} onClick={() => setDescOpen((v) => !v)} aria-label="展开描述">
                    <ChevronDown className="size-4" />
                  </Button>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data ? `${data.total} 个任务` : '\u00a0'}{view === 'board' && data && data.total > BOARD_LIMIT ? ` · 看板只显示前 ${BOARD_LIMIT} 个，用筛选缩小范围` : ''}
              </p>
            </>
          )}
        </div>
        <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => setEditing(true)} disabled={!project} aria-label="项目设置"><Settings className="size-4" /></Button></TooltipTrigger><TooltipContent>项目设置</TooltipContent></Tooltip>
        <Button onClick={() => setCreating(true)} disabled={!project || project.archived}><Plus />新建任务</Button>
      </div>

      {project?.description && descOpen && (
        <Card className="gap-0 p-4 py-4"><MarkdownView markdown={project.description} /></Card>
      )}

      <TaskStatCards counts={stats?.projects[projectKey]} daily={stats?.daily} />

      <TaskFilters value={filter} onChange={setFilter}
        facets={view === 'list' ? <ListFacets value={boardFilter} onChange={setBoardFilter} counts={stats?.projects[projectKey]} /> : undefined}
        facetsActive={view === 'list' && isBoardFilterActive(boardFilter)}
        onResetFacets={() => setBoardFilter(EMPTY_BOARD_FILTER)}
        extra={<>
        {view === 'list' && <ColumnsMenu columns={tableColumns({})} hidden={hidden} onChange={setHidden} />}
        {viewSwitch}
      </>} />

      {view === 'board' ? (
        isLoading && !data
          ? <div className="flex gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-xl" />)}</div>
          : (
            <div className="space-y-3">
              <BoardToolbar tasks={data?.tasks ?? []} shown={boardTasks.length} value={boardFilter} onChange={setBoardFilter} sort={sort} onSortChange={setSort} />
              <KanbanBoard
                tasks={boardTasks}
                statuses={filter.status}
                sort={sort}
                onCreate={project && !project.archived ? () => { setCreateTitle(undefined); setCreating(true); } : undefined}
                onQuickCreate={project && !project.archived ? quickCreate : undefined}
                onCreateWithTitle={(title) => { setCreateTitle(title); setCreating(true); }}
                onFocusColumn={(s) => setFilter({ ...filter, status: s ? [s] : undefined, offset: 0 })}
                storageKey="bosun.board.collapsed"
                fill
              />
            </div>
          )
      ) : (
        <TaskTable
          rows={data?.tasks ?? []}
          total={data?.total ?? 0}
          loading={isLoading}
          page={Math.floor((filter.offset ?? 0) / pageSize)}
          pageSize={pageSize}
          onPageChange={(page) => setFilter({ ...filter, offset: page * pageSize })}
          // 换每页行数时停在包含当前第一行的那页
          onPageSizeChange={(size) => { rememberPageSize(size); setFilter({ ...filter, limit: size, offset: Math.floor((filter.offset ?? 0) / size) * size }); }}
          hidden={hidden}
          sort={filter.sort}
          onSortChange={(sort) => setFilter({ ...filter, sort, offset: 0 })}
          onHideColumn={(k) => setHidden([...hidden, k])}
          rowActions
        />
      )}

      {creating && <TaskFormDialog open onClose={() => setCreating(false)} projectKey={projectKey} defaultTitle={createTitle} onCreated={(t) => { if (view === 'list') navigate(paths.task(t.id)); }} />}
      {editing && project && <ProjectFormDialog open onClose={() => setEditing(false)} project={project} />}
    </div>
  );
};

export default ProjectTasksPage;
