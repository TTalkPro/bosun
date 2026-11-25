import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowDownUp, BookOpen, CircleAlert, Code2, Download, History, ListFilter, Loader2, Pencil, Play, Save, SearchCheck, Trash2 } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { fetcher, isApiError } from '@/api/client';
import { useActors } from '@/api/identity';
import { useProjects } from '@/api/projects';
import { useStats } from '@/api/stats';
import { deleteFilter, updateFilter, useFilters, useQuery, type QueryResult } from '@/api/query';
import BqlEditor from '@/features/query/BqlEditor';
import ResultSummary from '@/features/query/ResultSummary';
import { pushRecent, readRecent, refineQuery, toCsv } from '@/features/query/bql';
import { ALL_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from '@/features/tasks/status';
import ConfirmDialog from '@/components/ConfirmDialog';
import FilterFormPanel from '@/features/filters/FilterFormPanel';
import TaskTable from '@/features/tasks/TaskTable';
import ColumnsMenu from '@/features/tasks/ColumnsMenu';
import { normalizePageSize, rememberPageSize, storedPageSize, tableColumns, useHiddenColumns } from '@/features/tasks/columns';
import { useApiError } from '@/components/useApiError';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';


// 示例：标题说清楚查的是什么，点一下填入并运行
const EXAMPLES: { title: string; query: string }[] = [
  { title: '未结任务按优先级', query: 'status IN (NEW, IN_PROGRESS) ORDER BY priority DESC' },
  { title: 'Agent 有提问待回答', query: 'question = true' },
  { title: '近 7 天动过的后端任务', query: 'labels = backend AND updated >= -7d' },
  { title: '全文含 mcp、未验收', query: 'text ~ "mcp" AND status != VERIFIED' },
  { title: '某人提的、被拒绝的', query: 'reporter = coxswain AND status = REJECTED' },
  { title: '反馈里提到超时', query: 'feedback ~ "超时" ORDER BY updated DESC' },
];

const Codes = ({ items }: { items: string[] }) => (
  <span className="inline-flex flex-wrap gap-1">{items.map((x) => <code key={x}>{x}</code>)}</span>
);

// 速查：按「字段 / 运算 / 日期 / 取值 / 排序」分格，每格一个小标题
const CheatSheet = () => (
  <div className="grid gap-x-6 gap-y-4 text-[13px] sm:grid-cols-2 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">字段</h4>
      <Codes items={['project', 'id', 'status', 'priority', 'labels', 'reporter', 'title', 'description', 'text', 'feedback', 'created', 'updated', 'question', 'feedback_count']} />
      <p className="text-xs text-muted-foreground"><code>reporter</code> = 提出人；<code>text</code> 全文；<code>feedback</code> 只搜反馈</p>
    </div>
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">运算</h4>
      <Codes items={['=', '!=', '~', '!~', '>', '>=', '<', '<=', 'IN (a, b)', 'NOT IN', 'IS EMPTY', 'IS NOT EMPTY', 'AND', 'OR', 'NOT', '( )']} />
      <p className="text-xs text-muted-foreground"><code>~</code> 包含 / 全文匹配</p>
    </div>
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">日期</h4>
      <Codes items={['2026-09-01', '2026-09-01T10:00', 'now', '-7d', '-2w', '-12h']} />
    </div>
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium text-muted-foreground">取值</h4>
      <p>状态：<Codes items={['NEW', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'REJECTED', 'CANCELLED']} /></p>
      <p>优先级：<Codes items={['low', 'medium', 'high']} /> <span className="text-xs text-muted-foreground">（可比较大小）</span></p>
    </div>
    <div className="space-y-1.5 sm:col-span-2">
      <h4 className="text-xs font-medium text-muted-foreground">排序与写法</h4>
      <p><code>ORDER BY 字段 [ASC|DESC], …</code> <span className="text-xs text-muted-foreground">有 <code>text ~</code> 且没写 ORDER BY 时按相关度，否则按更新时间倒序。值可裸写或加双引号；关键字与字段名不分大小写。</span></p>
    </div>
  </div>
);

const Kbd = ({ children }: { children: string }) => (
  <kbd className="rounded border bg-muted px-1 font-mono text-[10px] font-medium">{children}</kbd>
);

const ORDER_LABEL: Record<string, string> = { updated: '更新时间', created: '创建时间', priority: '优先级', status: '状态', id: 'ID', project: '项目', title: '标题', feedback_count: '反馈数', relevance: '相关度', score: '相关度' };

const QueryPage = () => {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const { data: filtersData } = useFilters();
  const filters = filtersData?.filters ?? [];

  const filterId = sp.get('filter');
  const current = filters.find((f) => f.id === filterId);
  const qParam = sp.get('q');
  // 输入框内容（未执行）与已执行的查询分开：改了但没点运行不刷新结果
  const executed = qParam ?? current?.query ?? '';
  const [draft, setDraft] = useState(executed);
  // 从侧栏切换筛选器 / URL 变化：同步输入框（"state 跟随 prop" 的标准写法，避免 effect 里 setState）
  const [prevExecuted, setPrevExecuted] = useState(executed);
  if (prevExecuted !== executed) { setPrevExecuted(executed); setDraft(executed); }
  const page = Number(sp.get('page') || 0) || 0;
  const pageSize = sp.get('size') ? normalizePageSize(Number(sp.get('size'))) : storedPageSize();
  const { data, error, isLoading, mutate: mutateQuery } = useQuery(executed, pageSize, page * pageSize);
  const [hidden, setHidden] = useHiddenColumns('bosun.query.columns');
  const [helpOpen, setHelpOpen] = useState(false);
  // 面板：'new' 另存为；'edit' 编辑当前筛选器；null 关闭
  const [panel, setPanel] = useState<'new' | 'edit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 实际执行过的查询都记下来（不论是按运行、点示例 / 侧栏筛选器，还是打开带 q 的链接）。
  // effect 里只写 localStorage；列表在渲染时现读（切到「最近运行」会重渲染，看到的总是新的）
  useEffect(() => { if (executed.trim()) pushRecent(executed); }, [executed]);
  const recent = readRecent();
  const [shelf, setShelf] = useState<'examples' | 'recent'>('examples');
  const [exporting, setExporting] = useState(false);
  const { data: projectsData } = useProjects(true);
  const { data: actorsData } = useActors();
  const { data: orgStats } = useStats(1);

  const run = (q = draft, keepFilter = false) => {
    const next = new URLSearchParams();
    next.set('q', q);
    if (keepFilter && filterId) next.set('filter', filterId);
    setSp(next);
  };

  const dirty = !!current && draft !== current.query;

  // 保存到当前筛选器（更新 query）
  const save = async () => {
    if (!current) return;
    try {
      await updateFilter(current.id, { query: draft });
      enqueueSnackbar(`筛选器「${current.name}」已更新`, { variant: 'success' });
      run(draft, true);
    } catch (e) {
      handleError(e);
    }
  };

  const remove = async () => {
    if (!current) return;
    try {
      await deleteFilter(current.id);
      enqueueSnackbar(`筛选器「${current.name}」已删除`, { variant: 'success' });
      setConfirmDelete(false);
      navigate(paths.query);
    } catch (e) { handleError(e); }
  };

  const queryError = isApiError(error) && error.status === 400 ? error.message : null;

  // 补全候选：状态 / 优先级 / 类型是固定的；项目 key 与人名取自现有数据
  const valuesFor = (field: string): { label: string; detail?: string }[] => {
    switch (field) {
      case 'status': return ALL_STATUSES.map((st) => ({ label: st, detail: STATUS_LABEL[st] }));
      case 'priority': return (['high', 'medium', 'low'] as const).map((p) => ({ label: p, detail: PRIORITY_LABEL[p] }));
      case 'kind': case 'type': return [{ label: 'task', detail: '任务' }, { label: 'epic', detail: 'Epic' }];
      case 'question': case 'open_question': case 'blocked': return [{ label: 'true' }, { label: 'false' }];
      case 'project': case 'key': return (projectsData?.projects ?? []).map((p) => ({ label: p.key, detail: p.name }));
      case 'assignee': case 'reporter': case 'created_by': case 'creator': case 'requester':
        return [...new Set([...Object.keys(orgStats?.totals.by_assignee ?? {}), ...(actorsData?.actors ?? []).map((a) => a.name)])]
          .sort().map((n) => ({ label: n }));
      case 'created': case 'updated': return [{ label: '-1d', detail: '1 天内' }, { label: '-7d', detail: '7 天内' }, { label: '-30d', detail: '30 天内' }, { label: 'now' }];
      default: return [];
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetcher<QueryResult>(`/query?q=${encodeURIComponent(executed)}&limit=500&offset=0`);
      const blob = new Blob([toCsv(all.tasks)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bosun-${current ? current.name : 'query'}-${dayjs().format('YYYYMMDD-HHmm')}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      enqueueSnackbar(all.total > all.tasks.length ? `已导出前 ${all.tasks.length} 条（共 ${all.total} 条，单次上限 500）` : `已导出 ${all.tasks.length} 条`, { variant: 'success' });
    } catch (e) { handleError(e); } finally { setExporting(false); }
  };

  const orderText = data?.order?.length
    ? data.order.map((o) => `${ORDER_LABEL[o.field] ?? o.field}${o.dir === 'asc' ? '升序' : '降序'}`).join('，')
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {current ? <ListFilter className="size-5 text-muted-foreground" /> : <SearchCheck className="size-5 text-muted-foreground" />}
            <h1 className="truncate text-2xl font-bold tracking-tight">{current ? current.name : 'BQL 查询'}</h1>
            {current && <Badge variant="secondary">筛选器</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {current ? '已保存的查询；改了条件可以保存回来，或另存为新的筛选器' : '用 BQL 跨项目查任务，常用的条件可以存成筛选器，出现在左侧栏'}
          </p>
        </div>
        {current && (
          <>
            <Button variant="outline" size="sm" onClick={() => setPanel('edit')}><Pencil />编辑</Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 />删除</Button>
          </>
        )}
      </div>

      <Card className="gap-0 py-0 shadow-xs">
        <div className="flex min-h-13 items-center gap-2 border-b px-5 py-2.5">
          <h2 className="text-sm font-semibold">查询</h2>
          {dirty && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">已修改，未保存</Badge>}
          <div className="flex-1" />
          <span className="hidden text-xs text-muted-foreground sm:inline"><Kbd>Enter</Kbd> 运行 · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> 换行</span>
          <Button variant={helpOpen ? 'secondary' : 'ghost'} size="sm" className="h-7" onClick={() => setHelpOpen((v) => !v)} aria-expanded={helpOpen}><BookOpen />速查</Button>
        </div>
        <div className="space-y-3 p-5">
          <div className="relative">
            <Code2 className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
            <BqlEditor
              value={draft}
              onChange={setDraft}
              onRun={(q) => run(q, true)}
              fields={filtersData?.fields ?? []}
              valuesFor={valuesFor}
              placeholder="例如：project = BOS AND status IN (NEW, IN_PROGRESS) ORDER BY priority DESC"
              invalid={!!queryError}
            />
          </div>
          {queryError && (
            <Alert variant="destructive" className="py-2"><CircleAlert /><AlertDescription className="font-mono text-xs">{queryError}</AlertDescription></Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => run(draft, true)}><Play />运行</Button>
            {current
              ? <Button size="sm" variant="outline" onClick={save} disabled={!dirty}><Save />保存到「{current.name}」</Button>
              : <Button size="sm" variant="outline" onClick={() => setPanel('new')} disabled={!draft.trim()}><Save />另存为筛选器</Button>}
            {current && <Button size="sm" variant="ghost" onClick={() => setPanel('new')} disabled={!draft.trim()}>另存为…</Button>}
          </div>
        </div>
        {helpOpen && <div className="border-t bg-muted/30 px-5 py-4"><CheatSheet /></div>}
        <div className="border-t px-5 py-3">
          <div className="mb-2 flex items-center gap-1">
            {(['examples', 'recent'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={shelf === k} onClick={() => setShelf(k)}
                className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
                  shelf === k ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {k === 'examples' ? '试试这些' : <><History className="size-3.5" />最近运行<span className="tabular-nums">{recent.length}</span></>}
              </button>
            ))}
          </div>
          {shelf === 'recent' ? (
            recent.length === 0
              ? <p className="py-2 text-xs text-muted-foreground">运行过的查询会记在这里（只存在这个浏览器里）</p>
              : (
                <div className="divide-y rounded-md border">
                  {recent.map((q) => (
                    <button key={q} type="button" onClick={() => { setDraft(q); run(q); }}
                      className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent', executed === q && 'bg-primary/5')}>
                      <Code2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={q}>{q}</span>
                    </button>
                  ))}
                </div>
              )
          ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {EXAMPLES.map((ex) => (
              <button key={ex.query} type="button" onClick={() => { setDraft(ex.query); run(ex.query); }}
                className={cn('group rounded-md border px-3 py-2 text-left transition-colors hover:border-foreground/15 hover:bg-accent',
                  executed === ex.query && 'border-primary/40 bg-primary/5')}>
                <div className="text-xs font-medium">{ex.title}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground" title={ex.query}>{ex.query}</div>
              </button>
            ))}
          </div>
          )}
        </div>
      </Card>

      {error && !queryError && <Alert variant="destructive"><CircleAlert /><AlertDescription>{(error as Error).message}</AlertDescription></Alert>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">结果</h2>
          {data && !queryError && <span className="rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">{data.total}</span>}
          {orderText && !queryError && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowDownUp className="size-3.5" />{orderText}</span>}
          <div className="flex-1" />
          {!queryError && data && data.total > 0 && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => void exportCsv()} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}导出 CSV
            </Button>
          )}
          {!queryError && <ColumnsMenu columns={tableColumns({ showProject: true })} hidden={hidden} onChange={setHidden} />}
        </div>
        {!queryError && data?.facets && (
          <ResultSummary facets={data.facets} total={data.total} onRefine={(clause) => { const q = refineQuery(executed, clause); setDraft(q); run(q, true); }} />
        )}
        {queryError ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            <CircleAlert className="size-5" />
            查询有错，改好后按 Enter 或「运行」再试
          </div>
        ) : <TaskTable
          rows={data?.tasks ?? []}
          total={data?.total ?? 0}
          loading={isLoading}
          page={page}
          pageSize={pageSize}
          onPageChange={(p) => { const next = new URLSearchParams(sp); next.set('page', String(p)); setSp(next); }}
          onPageSizeChange={(size) => {
            rememberPageSize(size);
            const next = new URLSearchParams(sp);
            next.set('size', String(size));
            next.set('page', String(Math.floor((page * pageSize) / size)));
            setSp(next);
          }}
          showProject
          hidden={hidden}
          onHideColumn={(k) => setHidden([...hidden, k])}
          rowActions
          onRowChanged={() => mutateQuery()}
        />}
      </div>

      {panel && (
        <FilterFormPanel
          query={draft}
          editing={panel === 'edit' ? current : undefined}
          onClose={() => setPanel(null)}
          onSaved={(f) => { setDraft(f.query); navigate(`${paths.query}?filter=${f.id}`); }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="删除筛选器"
        message={<>删除「{current?.name}」？只删筛选器本身，不影响任务。</>}
        confirmText="删除"
        danger
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
};

export default QueryPage;
