import { useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { createProject } from '@/api/projects';
import type { Project } from '@/api/types';
import FormField from '@/components/FormField';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (p: Project) => void;
}

/** 新建项目。编辑已有项目走 ProjectSettingsPanel */
const ProjectFormDialog = ({ open, onClose, onSaved }: Props) => {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ key?: string; name?: string }>({});
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  // 输入中只提示真错（以数字开头）；太短等提交时再说，免得敲第一个字母就飘红
  const keyError = /^[0-9]/.test(key) ? 'Key 要以字母开头' : errors.key;

  const submit = async () => {
    const next: typeof errors = {};
    if (!KEY_RE.test(key)) next.key = key ? '2–10 位大写字母或数字，字母开头' : '请填写 Key';
    if (!name.trim()) next.name = '名称不能为空';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const saved = await createProject({ key, name: name.trim(), description });
      enqueueSnackbar(`项目 ${saved.key} 已创建`, { variant: 'success' });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      const { field, message } = handleError(e, ['key', 'name']);
      if (field) setErrors({ [field]: message });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <SidePanel
      size="md"
      title="新建项目"
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={submit} disabled={busy}>创建</Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <FormField label="名称" htmlFor="project-name" error={errors.name} hint="例如：官网改版、Bosun 平台">
          <Input
            id="project-name"
            value={name}
            onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); }}
            aria-invalid={!!errors.name}
            autoFocus
          />
        </FormField>
        <FormField
          label="Key"
          htmlFor="project-key"
          error={keyError}
          hint="2–10 位大写字母或数字，字母开头；创建后不可修改"
          aside={<>任务编号：<span className="font-mono font-semibold text-foreground">{(key || 'KEY')}-1</span>、<span className="font-mono">{(key || 'KEY')}-2</span>…</>}
        >
          <Input
            id="project-key"
            value={key}
            onChange={(e) => { setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); if (errors.key) setErrors((x) => ({ ...x, key: undefined })); }}
            aria-invalid={!!keyError}
            maxLength={10}
            placeholder="BOS"
            className="font-mono font-semibold tracking-wider uppercase"
          />
        </FormField>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <Label>描述 <span className="font-normal text-muted-foreground">（可选，Markdown）</span></Label>
          <div className="min-h-0 flex-1">
            <MarkdownEditor value={description} onChange={setDescription} minHeight={200} fill placeholder="这个项目是做什么的…" />
          </div>
        </div>
      </div>
    </SidePanel>
  );
};

export default ProjectFormDialog;
