import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Autocomplete, Box, Chip, InputBase, Stack, Typography, alpha, useTheme } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { searchTasks, type SearchHit } from '@/api/search';
import StatusChip from '@/components/StatusChip';
import { isTaskId, normalizeId } from '@/features/tasks/status';
import { paths } from '@/routes/paths';

// 顶栏全局搜索：输入任务 ID 回车直达；输入文字 300ms 防抖后跨项目 BM25 检索，下拉里选中跳转
const GlobalSearch = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = input.trim();
    if (!q || isTaskId(q)) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchTasks(q, { limit: 8 });
        if (mine === seq.current) setHits(res);
      } catch {
        if (mine === seq.current) setHits([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const go = (hit: SearchHit) => {
    navigate(paths.task(hit.task.id));
    setInput('');
    setHits([]);
  };

  const options = useMemo(() => hits, [hits]);

  return (
    <Autocomplete<SearchHit, false, true, true>
      freeSolo
      disableClearable
      options={options}
      loading={loading}
      inputValue={input}
      onInputChange={(_, v, reason) => {
        if (reason === 'reset') return;
        setInput(v);
        // 清空 / 输入的是完整 ID：不搜，直接清掉旧结果
        if (!v.trim() || isTaskId(v.trim())) { seq.current++; setHits([]); }
      }}
      filterOptions={(x) => x}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.task.title)}
      isOptionEqualToValue={(a, b) => a.task.id === b.task.id}
      onChange={(_, v) => { if (v && typeof v !== 'string') go(v); }}
      noOptionsText={input.trim() ? '没有匹配的任务' : '输入关键字或任务 ID'}
      loadingText="搜索中…"
      slotProps={{ popper: { sx: { minWidth: 420 } }, paper: { sx: { mt: 0.5 } } }}
      renderOption={(props, hit) => (
        <li {...props} key={hit.task.id}>
          <Stack spacing={0.25} sx={{ minWidth: 0, width: '100%' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip size="small" label={hit.task.id} variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 700, height: 22 }} />
              <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 500 }}>{hit.task.title}</Typography>
              <StatusChip status={hit.task.status} sx={{ height: 22 }} />
            </Stack>
            {hit.feedback && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ pl: 0.5 }}>
                {hit.feedback.author} 的反馈：{hit.feedback.snippet}
              </Typography>
            )}
          </Stack>
        </li>
      )}
      renderInput={(params) => (
        <Box
          ref={params.InputProps.ref}
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            const id = normalizeId(input);
            if (isTaskId(id)) { navigate(paths.task(id)); setInput(''); }
            else if (hits[0]) go(hits[0]);
          }}
          sx={{
            display: 'flex', alignItems: 'center', px: 1.5, borderRadius: 2,
            bgcolor: alpha(theme.palette.common.white, 0.12),
            '&:hover, &:focus-within': { bgcolor: alpha(theme.palette.common.white, 0.2) },
            width: { xs: 200, sm: 320 },
          }}
        >
          <SearchIcon fontSize="small" sx={{ mr: 1, opacity: 0.8 }} />
          <InputBase
            inputProps={{ ...params.inputProps, 'aria-label': '搜索任务' }}
            placeholder="搜索任务，或输入 ID 如 BOS-12"
            sx={{ color: 'inherit', fontSize: 14, flex: 1 }}
          />
        </Box>
      )}
    />
  );
};

export default GlobalSearch;
