import { useState, type ReactNode } from 'react';
import { Flag, ListTodo, X } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { createTask, useEpics } from '@/api/tasks';
import type { Priority, Task, TaskKind } from '@/api/types';
import FormField from '@/components/FormField';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import AssigneePicker from './AssigneePicker';
import { PriorityIcon } from './StatusIcon';
import MilestoneSelect from '@/features/milestones/MilestoneSelect';
import { PRIORITY_LABEL, PRIORITY_TEXT } from './status';

interface Props {
  open: boolean;
  onClose: () => void;
  projectKey: string;
  /** keepOpen：用户勾了「创建后继续新建」，面板还开着（别跳走） */
  onCreated?: (t: Task, keepOpen: boolean) => void;
  /** 从 Epic 页新建步骤：预选所属 Epic */
  defaultEpic?: string;
  /** 看板快速添加里「更多选项…」带过来的标题 */
  defaultTitle?: string;
  /** 缺省的 milestone（项目页当前看的那个） */
  defaultMilestone?: string;
}

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const KEEP_KEY = 'bosun.taskform.keepOpen';
const readKeep = () => { try { return localStorage.getItem(KEEP_KEY) === '1'; } catch { return false; } };

// 右栏的一行属性：左侧小标题，下面是控件（shadcn dashboard 任务表单的属性栏写法）
const Prop = ({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode }) => (
  <div className="grid gap-2">
    <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

/**
 * 新建任务 / Epic：左边标题 + 描述（撑满），右边属性栏（优先级 / Epic / 执行人 / 标签）。
 * 「创建后继续新建」勾上时，建完清空标题和描述、保留属性，适合一口气录一批同类任务。
 */
const TaskFormDialog = ({ open, onClose, projectKey, onCreated, defaultEpic, defaultTitle, defaultMilestone }: Props) => {
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [kind, setKind] = useState<TaskKind>('task');
  const [epic, setEpic] = useState<string>(defaultEpic ?? '');
  const { data: epics } = useEpics(projectKey);
  const [priority, setPriority] = useState<Priority>('medium');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [assignee, setAssignee] = useState('');
  // undefined = 不指定（Epic 步骤会继承 Epic 的）；'' = 明确放待规划
  const [milestone, setMilestone] = useState<string | undefined>(defaultMilestone);
  const [description, setDescription] = useState('');
  // 描述编辑器不受控：清空靠换 key 重建
  const [editorKey, setEditorKey] = useState(0);
  const [keepOpen, setKeepOpen] = useState(readKeep);
  const [created, setCreated] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  if (!open) return null;

  const noun = kind === 'epic' ? 'Epic' : '任务';

  const addLabel = () => {
    const value = labelInput.trim().replace(/,$/, '');
    if (value && !labels.includes(value)) setLabels([...labels, value]);
    setLabelInput('');
  };

  const submit = async () => {
    if (!title.trim()) { setTitleError('标题不能为空'); return; }
    setBusy(true);
    try {
      // 标签框里还没回车的字也算上
      const pending = labelInput.trim();
      const allLabels = pending && !labels.includes(pending) ? [...labels, pending] : labels;
      const t = await createTask(projectKey, { title: title.trim(), priority, labels: allLabels, description, assignee: assignee.trim() || undefined, kind, epic: kind === 'task' && epic ? epic : undefined, milestone });
      enqueueSnackbar(`${noun} ${t.id} 已创建`, { variant: 'success' });
      onCreated?.(t, keepOpen);
      if (keepOpen) {
        setCreated((xs) => [...xs, t.id]);
        setTitle(''); setDescription(''); setEditorKey((k) => k + 1); setLabels(allLabels); setLabelInput('');
        setTimeout(() => document.getElementById('task-title')?.focus(), 0);
      } else {
        onClose();
      }
    } catch (e) {
      const { field, message } = handleError(e, ['title']);
      if (field === 'title') setTitleError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={
        <span className="flex items-center gap-2">
          新建{kind === 'epic' ? ' Epic' : '任务'}
          <Badge variant="outline" className="font-mono">{projectKey}</Badge>
          {created.length > 0 && <span className="text-xs font-normal text-muted-foreground">本次已建 {created.length} 个：<span className="font-mono">{created.slice(-3).join('、')}</span>{created.length > 3 && '…'}</span>}
        </span>
      }
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <label className="mr-auto flex cursor-pointer items-center gap-2 self-center text-sm text-muted-foreground">
            <Checkbox checked={keepOpen} onCheckedChange={(v) => { const on = v === true; setKeepOpen(on); try { localStorage.setItem(KEEP_KEY, on ? '1' : '0'); } catch { /* ignore */ } }} />
            创建后继续新建
          </label>
          <span className="hidden self-center text-xs text-muted-foreground sm:inline">
            <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Ctrl</kbd> + <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Enter</kbd> 创建
          </span>
          <Button variant="outline" onClick={onClose} disabled={busy}>{created.length ? '完成' : '取消'}</Button>
          <Button onClick={submit} disabled={busy}>{kind === 'epic' ? '创建 Epic' : '创建任务'}</Button>
        </>
      }
    >
      <div
        className="flex min-h-full flex-col gap-6 md:flex-row"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
      >
        {/* 左：类型 / 标题 / 描述 */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="grid grid-cols-2 gap-2 sm:max-w-md" role="radiogroup" aria-label="类型">
            {([
              ['task', ListTodo, '任务', '一件具体要做的事'],
              ['epic', Flag, 'Epic', '一个整体目标，下面挂任务作为步骤'],
            ] as const).map(([value, Icon, name, desc]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                  kind === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
                )}
              >
                <Icon className={cn('mt-0.5 size-4 shrink-0', kind === value ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{name}</span>
                  <span className="block text-xs text-muted-foreground">{desc}</span>
                </span>
              </button>
            ))}
          </div>

          <FormField label="标题" htmlFor="task-title" error={titleError} aside={title.length > 0 ? `${title.length} 字` : undefined}>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleError(undefined); }}
              aria-invalid={!!titleError}
              placeholder={kind === 'epic' ? '例如：支持多租户' : '例如：登录页加「记住邮箱」'}
              className="h-10 text-base"
              autoFocus
            />
          </FormField>

          <div className="flex min-h-80 flex-1 flex-col gap-2">
            <Label>描述 <span className="font-normal text-muted-foreground">（可选，Markdown）</span></Label>
            <div className="min-h-0 flex-1">
              <MarkdownEditor key={editorKey} value="" onChange={setDescription} minHeight={240} fill />
            </div>
          </div>
        </div>

        {/* 右：属性栏 */}
        <aside className="flex shrink-0 flex-col gap-5 rounded-lg border bg-muted/30 p-4 md:w-72">
          <Prop label="优先级">
            <div className="grid grid-cols-3 gap-1 rounded-md border bg-background p-0.5" role="radiogroup" aria-label="优先级">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={priority === p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex h-7 items-center justify-center gap-1 rounded-[5px] text-sm transition-colors',
                    priority === p ? 'bg-accent font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <PriorityIcon priority={p} className={cn('size-3.5', PRIORITY_TEXT[p])} />{PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </Prop>

          {kind === 'task' && (
            <Prop label="所属 Epic" htmlFor="task-epic" hint={epics && epics.tasks.length === 0 ? '本项目还没有 Epic' : undefined}>
              <Select value={epic || '__none__'} onValueChange={(value) => setEpic(value === '__none__' ? '' : value)}>
                <SelectTrigger id="task-epic" className="w-full bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（无）</SelectItem>
                  {(epics?.tasks ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.id} · {item.title}</SelectItem>)}
                  {defaultEpic && !(epics?.tasks ?? []).some((item) => item.id === defaultEpic) && (
                    <SelectItem value={defaultEpic}>{defaultEpic}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Prop>
          )}

          <Prop label="Milestone" htmlFor="task-milestone"
            hint={milestone === undefined && kind === 'task' && epic ? '不选则跟所属 Epic 进同一个' : kind === 'epic' ? 'Epic 放进来后，下面还没做完的步骤会跟着它' : undefined}>
            <MilestoneSelect id="task-milestone" projectKey={projectKey} value={milestone ?? null} onChange={setMilestone} />
          </Prop>

          <Prop label="执行人" hint="可选：预先指派；也可以留空，谁开始就算谁">
            <div className="-mx-0.5">
              <AssigneePicker projectKey={projectKey} assignee={assignee || null} assigneeKind={null} onChange={(name) => setAssignee(name)} />
            </div>
          </Prop>

          <Prop label="标签" htmlFor="task-label-input" hint="回车或逗号添加">
            <Input
              id="task-label-input"
              value={labelInput}
              placeholder="如 frontend"
              className="bg-background"
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !labelInput && labels.length) { setLabels(labels.slice(0, -1)); return; }
                if (e.key !== 'Enter' && e.key !== ',') return;
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return; // 交给外层的 Ctrl+Enter 创建
                e.preventDefault();
                addLabel();
              }}
            />
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <Badge key={label} variant="secondary" className="gap-1 pr-1">
                    {label}
                    <button type="button" onClick={() => setLabels(labels.filter((item) => item !== label))} aria-label={`删除标签 ${label}`} className="rounded-full opacity-60 hover:opacity-100">
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </Prop>

          <p className="mt-auto rounded-md border border-dashed bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
            新建后状态为「新建」。{kind === 'epic' ? 'Epic 的进度按已验收的步骤数计算。' : '执行人开始做时会自动记成执行人。'}
          </p>
        </aside>
      </div>
    </SidePanel>
  );
};

export default TaskFormDialog;
