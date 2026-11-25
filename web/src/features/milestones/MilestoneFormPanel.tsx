import { useState } from 'react';
import { createMilestone, updateMilestone } from '@/api/milestones';
import type { Milestone } from '@/api/types';
import FormField from '@/components/FormField';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import { useSnackbar } from '@/components/notify';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  projectKey: string;
  /** 传了就是编辑 */
  milestone?: Milestone;
  onClose: () => void;
  onSaved?: (m: Milestone) => void;
}

type Errors = Partial<Record<'name' | 'start_date' | 'target_date', string>>;

/** 新建 / 编辑 milestone：名称、开始 / 目标日期、描述 */
const MilestoneFormPanel = ({ projectKey, milestone, onClose, onSaved }: Props) => {
  const editing = !!milestone;
  const [name, setName] = useState(milestone?.name ?? '');
  const [start, setStart] = useState(milestone?.start_date ?? '');
  const [target, setTarget] = useState(milestone?.target_date ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const submit = async () => {
    const next: Errors = {};
    if (!name.trim()) next.name = '名称不能为空';
    if (start && target && start > target) next.target_date = '目标日期不能早于开始日期';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const input = { name: name.trim(), description, start_date: start, target_date: target };
      const saved = editing ? await updateMilestone(milestone, input) : await createMilestone(projectKey, input);
      enqueueSnackbar(editing ? `${saved.name} 已保存` : `已新建 ${saved.name}`, { variant: 'success' });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      const { field, message } = handleError(e, ['name', 'start_date', 'target_date']);
      if (field === 'name' && message.includes('already exists')) setErrors({ name: '这个项目里已经有同名的 milestone' });
      else if (field) setErrors({ [field]: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      size="md"
      title={editing ? `编辑 ${milestone.name}` : `新建 milestone · ${projectKey}`}
      onClose={onClose}
      busy={busy}
      actions={<>
        <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
        <Button onClick={submit} disabled={busy}>{editing ? '保存' : '创建'}</Button>
      </>}
    >
      <div className="flex flex-col gap-5" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}>
        <FormField label="名称" htmlFor="ms-name" error={errors.name} hint={editing ? undefined : '一般写版本号，如 0.1.4；也可以是「2026 Q1」「登录改版」'}>
          <Input id="ms-name" value={name} autoFocus aria-invalid={!!errors.name}
            onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="开始日期" htmlFor="ms-start" error={errors.start_date} hint="可选，燃尽图从这天画起">
            <Input id="ms-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={!!errors.start_date} />
          </FormField>
          <FormField label="目标日期" htmlFor="ms-target" error={errors.target_date} hint="可选，页头显示还剩几天">
            <Input id="ms-target" type="date" value={target} onChange={(e) => { setTarget(e.target.value); setErrors((x) => ({ ...x, target_date: undefined })); }} aria-invalid={!!errors.target_date} />
          </FormField>
        </div>
        <div className="flex flex-col gap-2">
          <Label>说明 <span className="font-normal text-muted-foreground">（可选，Markdown）</span></Label>
          <div className="h-56">
            <MarkdownEditor value={description} onChange={setDescription} minHeight={180} fill placeholder="这次发布的目标、范围…" />
          </div>
        </div>
      </div>
    </SidePanel>
  );
};

export default MilestoneFormPanel;
