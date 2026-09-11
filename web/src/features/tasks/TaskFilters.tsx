import { useEffect, useState } from 'react';
import { Chip, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import type { Status, TaskFilter, TaskKind } from '@/api/types';
import { ALL_STATUSES, STATUS_COLOR, STATUS_LABEL } from './status';

interface Props {
  value: TaskFilter;
  onChange: (next: TaskFilter) => void;
}

// 筛选条：状态多选 chip + 一个搜索框（300ms 防抖）。
// 搜索走后端 BM25：标题 ×3、标签 ×8 加权，正文与 Feedback 也在内，所以不再单独有标签过滤。
const TaskFilters = ({ value, onChange }: Props) => {
  const [q, setQ] = useState(value.q ?? '');

  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? '') !== q) onChange({ ...value, q: q || undefined, offset: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const selected = value.status ?? [];
  const toggle = (s: Status) => {
    const next = selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s];
    onChange({ ...value, status: next.length ? next : undefined, offset: 0 });
  };

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} useFlexGap flexWrap="wrap">
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {ALL_STATUSES.map((s) => {
          const on = selected.includes(s);
          return (
            <Chip key={s} label={STATUS_LABEL[s]} size="small" clickable
              icon={on ? <CheckIcon /> : undefined}
              color={on ? STATUS_COLOR[s] : 'default'} variant={on ? 'filled' : 'outlined'}
              sx={{ height: 26, borderRadius: 13, px: 0.25, fontWeight: on ? 700 : 500 }}
              onClick={() => toggle(s)} />
          );
        })}
      </Stack>
      <ToggleButtonGroup size="small" exclusive value={value.kind ?? 'all'}
        onChange={(_, v: TaskKind | 'all' | null) => { if (v) onChange({ ...value, kind: v === 'all' ? undefined : v, offset: 0 }); }}
        sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1.25, textTransform: 'none' } }}>
        <ToggleButton value="all">全部</ToggleButton>
        <ToggleButton value="task">任务</ToggleButton>
        <ToggleButton value="epic"><FlagOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />Epic</ToggleButton>
      </ToggleButtonGroup>
      <TextField size="small" placeholder="搜索：标题 / 标签 / 正文 / 反馈 / ID" value={q} onChange={(e) => setQ(e.target.value)}
        sx={{ width: { xs: '100%', md: 360 }, ml: { md: 'auto' } }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
    </Stack>
  );
};

export default TaskFilters;
