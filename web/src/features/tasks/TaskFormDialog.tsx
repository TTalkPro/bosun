import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { createTask, useEpics } from '@/api/tasks';
import type { Priority, Task, TaskKind } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
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
  const [labelInput, setLabelInput] = useState('');
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
          <Button onClick={submit} disabled={busy}>创建</Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border p-0.5">
            {(['task', 'epic'] as TaskKind[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium',
                  kind === value ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
              >
                {value === 'epic' && <Flag className="size-4" />}
                {value === 'epic' ? 'Epic' : '任务'}
              </button>
            ))}
          </div>
          {kind === 'task' ? (
            <div className="min-w-64">
              <Label htmlFor="task-epic">所属 Epic</Label>
              <Select value={epic || '__none__'} onValueChange={(value) => setEpic(value === '__none__' ? '' : value)}>
                <SelectTrigger id="task-epic" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（无）</SelectItem>
                  {(epics?.tasks ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.id} · {item.title}</SelectItem>)}
                  {defaultEpic && !(epics?.tasks ?? []).some((item) => item.id === defaultEpic) && (
                    <SelectItem value={defaultEpic}>{defaultEpic}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {epics && epics.tasks.length === 0 && <p className="mt-1 text-xs text-muted-foreground">本项目还没有 Epic</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Epic 是一个整体目标；建好后把任务挂上去作为步骤，进度按已验收的步骤数计算。</p>
          )}
        </div>
        <div>
          <Label htmlFor="task-title">标题</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTitleError(undefined); }}
            aria-invalid={!!titleError}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          />
          {titleError && <p className="mt-1 text-xs text-destructive">{titleError}</p>}
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="sm:w-36">
            <Label htmlFor="task-priority">优先级</Label>
            <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
              <SelectTrigger id="task-priority" className="mt-1 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((item) => <SelectItem key={item} value={item}>{PRIORITY_LABEL[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 flex-1">
            <Label htmlFor="task-label-input">标签</Label>
            <Input
              id="task-label-input"
              value={labelInput}
              placeholder="回车添加"
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ',') return;
                e.preventDefault();
                const value = labelInput.trim();
                if (value && !labels.includes(value)) setLabels([...labels, value]);
                setLabelInput('');
              }}
            />
            {labels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                    <button type="button" onClick={() => setLabels(labels.filter((item) => item !== label))} aria-label={`删除标签 ${label}`} className="ml-0.5 rounded-full opacity-70 hover:opacity-100">×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="sm:w-52">
            <Label htmlFor="task-assignee">预派执行人（可选）</Label>
            <Input id="task-assignee" value={assignee} placeholder="keel/feature-x" className="mt-1" onChange={(e) => setAssignee(e.target.value)} />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-1 text-xs text-muted-foreground">描述（Markdown）</p>
          <div className="min-h-0 flex-1">
            <MarkdownEditor value="" onChange={setDescription} minHeight={240} fill />
          </div>
        </div>
      </div>
    </SidePanel>
  );
};

export default TaskFormDialog;
