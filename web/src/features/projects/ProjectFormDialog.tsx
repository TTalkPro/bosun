import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { createProject, updateProject } from '@/api/projects';
import type { Project } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={submit} disabled={busy}>{editing ? '保存' : '创建'}</Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div>
          <Label htmlFor="project-key">Key</Label>
          <Input
            id="project-key"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            disabled={editing}
            aria-invalid={!!keyError}
            maxLength={10}
            className="font-mono font-bold"
            autoFocus={!editing}
          />
          <p className={keyError ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>
            {keyError ?? '任务 ID 前缀，如 BOS → BOS-1；创建后不可修改'}
          </p>
        </div>
        <div>
          <Label htmlFor="project-name">名称</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
            autoFocus={editing}
          />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>
        {editing && (
          <div className="flex items-center gap-2">
            <Switch id="project-archived" checked={archived} onCheckedChange={setArchived} />
            <Label htmlFor="project-archived">归档（不再接受新任务，已有任务仍可操作）</Label>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-1 text-xs text-muted-foreground">描述（Markdown）</p>
          <div className="min-h-0 flex-1">
            <MarkdownEditor value={description} onChange={setDescription} minHeight={200} fill placeholder="这个项目是做什么的…" />
          </div>
        </div>
      </div>
    </SidePanel>
  );
};

export default ProjectFormDialog;
