import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Alert, Box, Button, Chip, Collapse, IconButton,
  InputAdornment, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useSnackbar } from 'notistack';
import { isApiError } from '@/api/client';
import { deleteFilter, updateFilter, useFilters, useQuery } from '@/api/query';
import ConfirmDialog from '@/components/ConfirmDialog';
import FilterFormPanel from '@/features/filters/FilterFormPanel';
import TaskTable from '@/features/tasks/TaskTable';
import { useApiError } from '@/components/useApiError';
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
  <Box sx={{ fontSize: 13, '& code': { fontFamily: '"JetBrains Mono", Menlo, monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 } }}>
    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>BQL 速查</Typography>
    <Stack spacing={0.5}>
      <div><b>字段</b>：<code>project</code> <code>id</code> <code>status</code> <code>priority</code> <code>labels</code> <code>reporter</code>(created_by) <code>title</code> <code>description</code> <code>text</code>(全文) <code>feedback</code>(只搜反馈) <code>created</code> <code>updated</code> <code>question</code> <code>feedback_count</code></div>
      <div><b>运算</b>：<code>=</code> <code>!=</code> <code>~</code>(包含 / 全文) <code>!~</code> <code>&gt; &gt;= &lt; &lt;=</code> <code>IN (a, b)</code> <code>NOT IN</code> <code>IS EMPTY</code> <code>IS NOT EMPTY</code> · <code>AND</code> <code>OR</code> <code>NOT</code> 括号 · <code>ORDER BY 字段 [ASC|DESC], ...</code></div>
      <div><b>日期</b>：<code>2026-09-01</code> <code>2026-09-01T10:00</code> <code>now</code> <code>-7d</code> <code>-2w</code> <code>-12h</code></div>
      <div><b>状态</b>：NEW · IN_PROGRESS · DONE · VERIFIED · REJECTED · CANCELLED；<b>优先级</b>：low · medium · high（可比较大小）</div>
      <div>值可以裸写或加双引号；关键字与字段名不分大小写；有 <code>text ~</code> 且没写 ORDER BY 时按相关度排序，否则按更新时间倒序。</div>
    </Stack>
  </Box>
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
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
        <Typography variant="h4">{current ? current.name : '查询'}</Typography>
        {current && (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="编辑筛选器（名称 / 查询）"><IconButton size="small" onClick={() => setPanel('edit')}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="删除筛选器"><IconButton size="small" onClick={() => setConfirmDelete(true)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary">{data ? `${data.total} 个任务` : ''}</Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth multiline minRows={1} maxRows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(draft, true); } }}
          placeholder='例如：project = BOS AND status IN (NEW, IN_PROGRESS) ORDER BY priority DESC'
          error={!!queryError}
          helperText={queryError ?? (dirty ? '已修改，尚未保存到筛选器' : ' ')}
          InputProps={{
            sx: { fontFamily: '"JetBrains Mono", Menlo, monospace', fontSize: 14 },
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="BQL 速查"><IconButton size="small" onClick={() => setHelpOpen((v) => !v)}><HelpOutlineIcon fontSize="small" /></IconButton></Tooltip>
              </InputAdornment>
            ),
          }}
        />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
          <Button variant="contained" size="small" startIcon={<PlayArrowIcon />} onClick={() => run(draft, true)}>运行</Button>
          {current
            ? <Button size="small" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={!dirty}>保存到「{current.name}」</Button>
            : <Button size="small" startIcon={<SaveOutlinedIcon />} onClick={() => setPanel('new')} disabled={!draft.trim()}>另存为筛选器</Button>}
          {current && <Button size="small" onClick={() => setPanel('new')} disabled={!draft.trim()}>另存为…</Button>}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">示例：</Typography>
          {EXAMPLES.map((ex) => <Chip key={ex} size="small" variant="outlined" label={ex} onClick={() => { setDraft(ex); run(ex); }} sx={{ fontFamily: 'monospace', maxWidth: 360 }} />)}
        </Stack>
        <Collapse in={helpOpen}><Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}><CheatSheet /></Box></Collapse>
      </Paper>

      {error && !queryError && <Alert severity="error" sx={{ mb: 2 }}>{(error as Error).message}</Alert>}

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
    </Box>
  );
};

export default QueryPage;
