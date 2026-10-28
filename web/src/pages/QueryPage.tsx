import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BookOpen, Pencil, Play, Save, Trash2 } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { isApiError } from '@/api/client';
import { deleteFilter, updateFilter, useFilters, useQuery } from '@/api/query';
import ConfirmDialog from '@/components/ConfirmDialog';
import FilterFormPanel from '@/features/filters/FilterFormPanel';
import TaskTable from '@/features/tasks/TaskTable';
import { useApiError } from '@/components/useApiError';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { paths } from '@/routes/paths';

const PAGE_SIZE = 25;

const EXAMPLES = [
  'status IN (NEW, IN_PROGRESS) ORDER BY priority DESC',
  'question = true',
  'labels = backend AND updated >= -7d',
  'text ~ "mcp" AND status != VERIFIED',
  'reporter = coxswain AND status = REJECTED',
  'feedback ~ "超时" ORDER BY updated DESC',
];

const CheatSheet = () => (
  <div className="space-y-2 text-[13px] [&_code]:rounded-sm [&_code]:bg-accent [&_code]:px-1 [&_code]:font-mono">
    <h3 className="text-sm font-semibold">BQL 速查</h3>
      <div><b>字段</b>：<code>project</code> <code>id</code> <code>status</code> <code>priority</code> <code>labels</code> <code>reporter</code>(created_by) <code>title</code> <code>description</code> <code>text</code>(全文) <code>feedback</code>(只搜反馈) <code>created</code> <code>updated</code> <code>question</code> <code>feedback_count</code></div>
      <div><b>运算</b>：<code>=</code> <code>!=</code> <code>~</code>(包含 / 全文) <code>!~</code> <code>&gt; &gt;= &lt; &lt;=</code> <code>IN (a, b)</code> <code>NOT IN</code> <code>IS EMPTY</code> <code>IS NOT EMPTY</code> · <code>AND</code> <code>OR</code> <code>NOT</code> 括号 · <code>ORDER BY 字段 [ASC|DESC], ...</code></div>
      <div><b>日期</b>：<code>2026-09-01</code> <code>2026-09-01T10:00</code> <code>now</code> <code>-7d</code> <code>-2w</code> <code>-12h</code></div>
      <div><b>状态</b>：NEW · IN_PROGRESS · DONE · VERIFIED · REJECTED · CANCELLED；<b>优先级</b>：low · medium · high（可比较大小）</div>
      <div>值可以裸写或加双引号；关键字与字段名不分大小写；有 <code>text ~</code> 且没写 ORDER BY 时按相关度排序，否则按更新时间倒序。</div>
  </div>
);

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
  const { data, error, isLoading } = useQuery(executed, PAGE_SIZE, page * PAGE_SIZE);
  const [helpOpen, setHelpOpen] = useState(false);
  // 面板：'new' 另存为；'edit' 编辑当前筛选器；null 关闭
  const [panel, setPanel] = useState<'new' | 'edit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      const { field, message } = handleError(e);
      if (field === 'query') enqueueSnackbar(message, { variant: 'error' });
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{current ? current.name : '查询'}</h1>
        {current && (
          <div className="flex gap-1">
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8" onClick={() => setPanel('edit')} aria-label="编辑筛选器"><Pencil className="size-4" /></Button></TooltipTrigger><TooltipContent>编辑筛选器（名称 / 查询）</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8" onClick={() => setConfirmDelete(true)} aria-label="删除筛选器"><Trash2 className="size-4" /></Button></TooltipTrigger><TooltipContent>删除筛选器</TooltipContent></Tooltip>
          </div>
        )}
        <div className="flex-1" />
        <p className="text-sm text-muted-foreground">{data ? `${data.total} 个任务` : ''}</p>
      </div>

      <Card className="mb-4 gap-0 border p-3 py-3">
        <Textarea
          className="min-h-11 resize-y font-mono text-sm"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(draft, true); } }}
          placeholder='例如：project = BOS AND status IN (NEW, IN_PROGRESS) ORDER BY priority DESC'
          aria-invalid={!!queryError}
        />
        <div className="mt-1 flex justify-end">
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8" onClick={() => setHelpOpen((v) => !v)} aria-label="BQL 速查"><BookOpen className="size-4" /></Button></TooltipTrigger><TooltipContent>BQL 速查</TooltipContent></Tooltip>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => run(draft, true)}><Play />运行</Button>
          {current
            ? <Button size="sm" variant="outline" onClick={save} disabled={!dirty}><Save />保存到「{current.name}」</Button>
            : <Button size="sm" variant="outline" onClick={() => setPanel('new')} disabled={!draft.trim()}><Save />另存为筛选器</Button>}
          {current && <Button size="sm" variant="ghost" onClick={() => setPanel('new')} disabled={!draft.trim()}>另存为…</Button>}
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">示例：</span>
          {EXAMPLES.map((ex) => <Badge key={ex} variant="outline" className="max-w-90 cursor-pointer truncate font-mono font-normal" onClick={() => { setDraft(ex); run(ex); }}>{ex}</Badge>)}
        </div>
        {queryError && <p className="mt-1 text-xs text-destructive">{queryError}</p>}
        {!queryError && dirty && <p className="mt-1 text-xs text-muted-foreground">已修改，尚未保存到筛选器</p>}
        {helpOpen && <div className="mt-3 border-t pt-3"><CheatSheet /></div>}
      </Card>

      {error && !queryError && <Alert variant="destructive" className="mb-4"><AlertDescription>{(error as Error).message}</AlertDescription></Alert>}

      <TaskTable
        rows={data?.tasks ?? []}
        total={data?.total ?? 0}
        loading={isLoading}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={(p) => { const next = new URLSearchParams(sp); next.set('page', String(p)); setSp(next); }}
        showProject
      />

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
