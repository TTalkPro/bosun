import { useState } from 'react';
import { Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { createProject, updateProject } from '@/api/projects';
import type { Project } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

interface Props {
  open: boolean;
  onClose: () => void;
  /** 传入则为编辑模式 */
  project?: Project;
  onSaved?: (p: Project) => void;
}

const ProjectFormDialog = ({ open, onClose, project, onSaved }: Props) => {
  const editing = !!project;
  const [key, setKey] = useState(project?.key ?? '');
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [archived, setArchived] = useState(project?.archived ?? false);
  const [errors, setErrors] = useState<{ key?: string; name?: string }>({});
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const keyError = key && !KEY_RE.test(key) ? '2–10 位大写字母/数字，字母开头' : errors.key;

  const submit = async () => {
    const next: typeof errors = {};
    if (!editing && !KEY_RE.test(key)) next.key = '2–10 位大写字母/数字，字母开头';
    if (!name.trim()) next.name = '名称不能为空';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const saved = editing
        ? await updateProject(project.key, { name: name.trim(), description, archived })
        : await createProject({ key, name: name.trim(), description });
      enqueueSnackbar(editing ? '项目已更新' : `项目 ${saved.key} 已创建`, { variant: 'success' });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      const { field, message } = handleError(e);
      if (field === 'key' || field === 'name') setErrors({ [field]: message });
      else if (field) enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <SidePanel
      title={editing ? `编辑项目 ${project.key}` : '新建项目'}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="contained" onClick={submit} disabled={busy}>{editing ? '保存' : '创建'}</Button>
        </>
      }
    >
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <TextField
          label="Key"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          disabled={editing}
          error={!!keyError}
          helperText={keyError ?? '任务 ID 前缀，如 BOS → BOS-1；创建后不可修改'}
          inputProps={{ maxLength: 10, style: { fontFamily: 'monospace', fontWeight: 700 } }}
          autoFocus={!editing}
        />
        <TextField label="名称" value={name} onChange={(e) => setName(e.target.value)} error={!!errors.name} helperText={errors.name} autoFocus={editing} />
        {editing && (
          <FormControlLabel control={<Switch checked={archived} onChange={(e) => setArchived(e.target.checked)} />} label="归档（不再接受新任务，已有任务仍可操作）" />
        )}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>描述（Markdown）</Typography>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <MarkdownEditor value={description} onChange={setDescription} minHeight={200} fill placeholder="这个项目是做什么的…" />
          </Box>
        </Box>
      </Stack>
    </SidePanel>
  );
};

export default ProjectFormDialog;
