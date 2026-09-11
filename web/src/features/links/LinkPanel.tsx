import { useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Button, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { searchTasks, type SearchHit } from '@/api/search';
import { addLink } from '@/api/tasks';
import type { LinkType, Task } from '@/api/types';
import SidePanel from '@/components/SidePanel';
import StatusChip from '@/components/StatusChip';
import { useApiError } from '@/components/useApiError';
import { isTaskId, normalizeId } from '@/features/tasks/status';
import { LINK_TYPE_LABEL } from './linkTypes';

interface Props {
  task: Task;
  onClose: () => void;
  onChanged?: (t: Task) => void;
}


// 添加关联：类型 + 跨项目任务搜索（也可直接输 ID）
const LinkPanel = ({ task, onClose, onChanged }: Props) => {
  const [type, setType] = useState<LinkType>('depends_on');
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  useEffect(() => {
    const q = input.trim();
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      if (!q) { setHits([]); return; }
      try {
        const res = await searchTasks(q, { limit: 10 });
        if (mine === seq.current) setHits(res.filter((h) => h.task.id !== task.id));
      } catch {
        if (mine === seq.current) setHits([]);
      }
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [input, task.id]);

  const targetId = picked?.task.id ?? (isTaskId(input) ? normalizeId(input) : '');

  const submit = async () => {
    if (!targetId) { enqueueSnackbar('选一个任务，或输入任务 ID', { variant: 'warning' }); return; }
    setBusy(true);
    try {
      const t = await addLink(task.id, targetId, type);
      const other = t.links.find((l) => l.direction === 'out' && l.type === type && l.task === targetId);
      enqueueSnackbar(
        type === 'replaces' && other?.status === 'CANCELLED' ? `已替代 ${targetId}，它已自动撤销` : `${task.id} ${LINK_TYPE_LABEL[type]} ${targetId}`,
        { variant: 'success' },
      );
      onChanged?.(t);
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={`添加关联 · ${task.id}`}
      onClose={onClose}
      busy={busy}
      actions={<><Button onClick={onClose} disabled={busy}>取消</Button><Button variant="contained" onClick={submit} disabled={busy || !targetId}>添加</Button></>}
    >
      <Stack spacing={2}>
        <ToggleButtonGroup exclusive value={type} onChange={(_, v: LinkType | null) => { if (v) setType(v); }}
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2 } }}>
          <ToggleButton value="depends_on">依赖</ToggleButton>
          <ToggleButton value="replaces">替代</ToggleButton>
        </ToggleButtonGroup>
        <Alert severity="info" icon={false}>
          {type === 'depends_on'
            ? <><b>{task.id}</b> 依赖目标任务：目标没到「已完成 / 已验收」之前，本任务不能开始（显示为被阻塞）。不允许成环。</>
            : <><b>{task.id}</b> 替代目标任务：目标若还在「新建 / 进行中」会自动撤销，历史里记「replaced by {task.id}」。</>}
        </Alert>
        <Autocomplete
          options={hits}
          value={picked}
          inputValue={input}
          onInputChange={(_, v) => { setInput(v); if (picked && v !== `${picked.task.id} ${picked.task.title}`) setPicked(null); }}
          onChange={(_, v) => setPicked(v)}
          getOptionLabel={(h) => `${h.task.id} ${h.task.title}`}
          isOptionEqualToValue={(a, b) => a.task.id === b.task.id}
          filterOptions={(x) => x}
          noOptionsText={input.trim() ? (isTaskId(input) ? `直接使用 ${normalizeId(input)}` : '没有匹配') : '输入标题关键字或任务 ID'}
          renderOption={(props, h) => (
            <li {...props} key={h.task.id}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
                <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", Menlo, monospace', fontWeight: 700 }}>{h.task.id}</Typography>
                <Typography variant="body2" noWrap sx={{ flex: 1 }}>{h.task.title}</Typography>
                <StatusChip status={h.task.status} />
              </Stack>
            </li>
          )}
          renderInput={(params) => <TextField {...params} autoFocus label="目标任务" placeholder="搜索标题，或输入 KEEL-7" />}
        />
        {targetId && <Typography variant="caption" color="text.secondary">将建立：{task.id} → {LINK_TYPE_LABEL[type]} → {targetId}</Typography>}
      </Stack>
    </SidePanel>
  );
};

export default LinkPanel;
