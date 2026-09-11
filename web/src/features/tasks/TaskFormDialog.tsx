import { useState } from 'react';
import { Autocomplete, Box, Button, Chip, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { useSnackbar } from 'notistack';
import { createTask, useEpics } from '@/api/tasks';
import type { Priority, Task, TaskKind } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { PRIORITY_LABEL } from './status';

interface Props {
  open: boolean;
  onClose: () => void;
  projectKey: string;
  onCreated?: (t: Task) => void;
  /** 从 Epic 页新建步骤：预选所属 Epic */
  defaultEpic?: string;
}

// 新建任务：右侧 2/3 面板，描述编辑器撑满剩余高度
const TaskFormDialog = ({ open, onClose, projectKey, onCreated, defaultEpic }: Props) => {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('task');
  const [epic, setEpic] = useState<string>(defaultEpic ?? '');
  const { data: epics } = useEpics(projectKey);
  const [priority, setPriority] = useState<Priority>('medium');
  const [labels, setLabels] = useState<string[]>([]);
  const [assignee, setAssignee] = useState('');
  const [description, setDescription] = useState('');
  const [titleError, setTitleError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) { setTitleError('标题不能为空'); return; }
    setBusy(true);
    try {
      const t = await createTask(projectKey, { title: title.trim(), priority, labels, description, assignee: assignee.trim() || undefined, kind, epic: kind === 'task' && epic ? epic : undefined });
      enqueueSnackbar(`${kind === 'epic' ? 'Epic' : '任务'} ${t.id} 已创建`, { variant: 'success' });
      onCreated?.(t);
      onClose();
    } catch (e) {
      const { field, message } = handleError(e);
      if (field === 'title') setTitleError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={`新建${kind === 'epic' ? ' Epic' : '任务'} · ${projectKey}`}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="contained" onClick={submit} disabled={busy}>创建</Button>
        </>
      }
    >
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
          <ToggleButtonGroup size="small" exclusive value={kind} onChange={(_, v: TaskKind | null) => { if (v) setKind(v); }}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.5 } }}>
            <ToggleButton value="task">任务</ToggleButton>
            <ToggleButton value="epic"><FlagOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />Epic</ToggleButton>
          </ToggleButtonGroup>
          {kind === 'task' ? (
            <TextField select size="small" label="所属 Epic" value={epic} onChange={(e) => setEpic(e.target.value)} sx={{ minWidth: 260 }}
              helperText={epics && epics.tasks.length === 0 ? '本项目还没有 Epic' : undefined}>
              <MenuItem value="">（无）</MenuItem>
              {(epics?.tasks ?? []).map((e) => <MenuItem key={e.id} value={e.id}>{e.id} · {e.title}</MenuItem>)}
              {defaultEpic && !(epics?.tasks ?? []).some((e) => e.id === defaultEpic) && <MenuItem value={defaultEpic}>{defaultEpic}</MenuItem>}
            </TextField>
          ) : (
            <Typography variant="caption" color="text.secondary">Epic 是一个整体目标；建好后把任务挂上去作为步骤，进度按已验收的步骤数计算。</Typography>
          )}
        </Stack>
        <TextField label="标题" value={title} onChange={(e) => { setTitle(e.target.value); setTitleError(undefined); }} error={!!titleError} helperText={titleError} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select label="优先级" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} sx={{ minWidth: 140 }}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <MenuItem key={p} value={p}>{PRIORITY_LABEL[p]}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple freeSolo options={[]} value={labels} onChange={(_, v) => setLabels(v as string[])}
            renderTags={(value, getTagProps) => value.map((option, index) => <Chip size="small" label={option} {...getTagProps({ index })} key={option} />)}
            renderInput={(params) => <TextField {...params} label="标签" placeholder="回车添加" />}
            sx={{ flex: 1 }}
          />
          <TextField label="预派执行人（可选）" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="keel/feature-x" sx={{ minWidth: 200 }} />
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>描述（Markdown）</Typography>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <MarkdownEditor value="" onChange={setDescription} minHeight={240} fill />
          </Box>
        </Box>
      </Stack>
    </SidePanel>
  );
};

export default TaskFormDialog;
