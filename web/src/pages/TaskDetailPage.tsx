import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { ChevronRight, Flag, GitCommitVertical, MessageSquareText, Pencil, Plus } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { isApiError } from '@/api/client';
import { updateTask, useEpics, useTask } from '@/api/tasks';
import type { Feedback, Priority, Task } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import MarkdownView from '@/components/markdown/MarkdownView';
import RelativeTime from '@/components/RelativeTime';
import StatusChip from '@/components/StatusChip';
import TaskIdChip from '@/components/TaskIdChip';
import ActorChip from '@/components/ActorChip';
import EpicChip from '@/components/EpicChip';
import EpicProgressBar from '@/components/EpicProgressBar';
import EpicKanban from '@/features/epics/EpicKanban';
import TaskTable from '@/features/tasks/TaskTable';
import TaskFormDialog from '@/features/tasks/TaskFormDialog';
import LinksCard from '@/features/links/LinksCard';
import BlockedChip from '@/components/BlockedChip';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import FeedbackDialog from '@/features/feedback/FeedbackDialog';
import FeedbackList from '@/features/feedback/FeedbackList';
import HistoryTimeline from '@/features/status/HistoryTimeline';
import TransitionButtons from '@/features/status/TransitionButtons';
import { PRIORITY_LABEL } from '@/features/tasks/status';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';
import NotFoundPage from './NotFoundPage';

// 标题：点击进入行内编辑，Enter 保存、Esc 取消
const InlineTitle = ({ task, onSave }: { task: Task; onSave: (title: string) => Promise<void> }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  // 非编辑态时跟随最新标题（轮询可能带来 Agent 的修改）
  const [prevTitle, setPrevTitle] = useState(task.title);
  if (prevTitle !== task.title) { setPrevTitle(task.title); if (!editing) setValue(task.title); }
  const commit = async () => {
    const v = value.trim();
    if (v && v !== task.title) await onSave(v);
    setEditing(false);
  };
  if (editing) {
    return (
      <Input
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="border-0 border-b-2 border-primary px-0 text-3xl font-bold leading-tight shadow-none focus-visible:ring-0"
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h1 className="min-w-0 cursor-text text-3xl font-bold tracking-tight" onClick={() => setEditing(true)}>{task.title}</h1>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(true)} aria-label="编辑标题"><Pencil className="size-4" /></Button></TooltipTrigger><TooltipContent>编辑标题</TooltipContent></Tooltip>
    </div>
  );
};

const Description = ({ task, onSave }: { task: Task; onSave: (description: string) => Promise<void> }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description);
  const [session, setSession] = useState(0); // 每次进入编辑重建编辑器；期间任务被刷新不会丢草稿
  const [busy, setBusy] = useState(false);
  return (
    <Card className="gap-0 border p-4 py-4">
      <div className="mb-3 flex items-center">
        <h2 className="text-base font-semibold">描述</h2>
        <div className="flex-1" />
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>取消</Button>
            <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(draft); setEditing(false); } finally { setBusy(false); } }}>保存</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setDraft(task.description); setSession((n) => n + 1); setEditing(true); }}><Pencil />编辑</Button>
        )}
      </div>
      {editing
        ? <MarkdownEditor key={session} value={draft} onChange={setDraft} minHeight={260} autoFocus />
        : <MarkdownView markdown={task.description} empty="（没有描述，点击「编辑」添加）" />}
    </Card>
  );
};

const TaskDetailPage = () => {
  const { id = '' } = useParams();
  const taskId = id.toUpperCase();
  const { data: task, error, mutate } = useTask(taskId);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  // null = 关闭；'new' = 新增；Feedback = 修订该条
  const [feedbackDialog, setFeedbackDialog] = useState<'new' | Feedback | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [creatingStep, setCreatingStep] = useState(false);
  const [stepView, setStepView] = useState<'table' | 'kanban'>('table');
  const isEpic = task?.kind === 'epic';
  const { data: epics } = useEpics(task && !isEpic ? task.project_key : undefined);

  useEffect(() => {
    document.title = task ? `${task.id} · ${task.title} - Bosun` : 'Bosun';
    return () => { document.title = 'Bosun'; };
  }, [task]);

  if (isApiError(error) && (error.status === 404 || error.status === 400)) return <NotFoundPage message={`任务 ${taskId} 不存在`} />;
  if (!task) return <div className="space-y-4"><Skeleton className="h-12 w-80" /><Skeleton className="h-60 w-full rounded-xl" /></div>;
  const addLabel = () => {
    const label = labelInput.trim();
    if (!label || task.labels.includes(label)) return;
    patch({ labels: [...task.labels, label] });
    setLabelInput('');
  };
  const removeLabel = (label: string) => patch({ labels: task.labels.filter((item) => item !== label) });

  const patch = async (input: Parameters<typeof updateTask>[1]) => {
    try {
      const t = await updateTask(task.id, input);
      await mutate(t, false);
      enqueueSnackbar('已保存', { variant: 'success', autoHideDuration: 1200 });
    } catch (e) {
      handleError(e);
      throw e;
    }
  };

  return (
    <div>
      <nav aria-label="breadcrumb" className="mb-2 flex items-center gap-1 text-sm">
        <RouterLink className="hover:underline" to={paths.projects}>项目</RouterLink>
        <ChevronRight className="size-4 text-muted-foreground" />
        <RouterLink className="hover:underline" to={paths.project(task.project_key)}>{task.project_key}</RouterLink>
        <ChevronRight className="size-4 text-muted-foreground" />
        <span className="text-foreground">{task.id}</span>
      </nav>

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <TaskIdChip id={task.id} size="medium" />
          {isEpic && <Badge variant="secondary"><Flag />Epic</Badge>}
          <StatusChip status={task.status} />
          {task.blocked && <BlockedChip links={task.links} />}
          {isEpic && task.progress && <EpicProgressBar progress={task.progress} width={220} />}
          <div className="flex-1" />
          <TransitionButtons task={task} onChanged={(t) => mutate(t, false)} />
        </div>
        <InlineTitle task={task} onSave={(title) => patch({ title })} />
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-28">
            <Label htmlFor="task-priority">优先级</Label>
            <Select value={task.priority} onValueChange={(value) => patch({ priority: value as Priority })}>
              <SelectTrigger id="task-priority" size="sm" className="mt-1 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full min-w-64 flex-1 lg:max-w-130">
            <Label htmlFor="task-label-input">标签</Label>
            <Input id="task-label-input" className="mt-1" value={labelInput} placeholder="回车添加"
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel(); } }}
            />
            {task.labels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {task.labels.map((label) => <Badge key={label} variant="secondary">{label}<button type="button" onClick={() => removeLabel(label)} aria-label={`删除标签 ${label}`} className="ml-0.5 rounded-full opacity-70 hover:opacity-100">×</button></Badge>)}
              </div>
            )}
          </div>
          {!isEpic && (
            <div className="w-full min-w-50 max-w-80">
              <Label htmlFor="task-epic">所属 Epic</Label>
              <Select value={task.epic ?? '__none__'} onValueChange={(value) => patch({ epic: value === '__none__' ? undefined : value })}>
                <SelectTrigger id="task-epic" size="sm" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（无）</SelectItem>
                  {(epics?.tasks ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.id} · {item.title}</SelectItem>)}
                  {task.epic && !(epics?.tasks ?? []).some((item) => item.id === task.epic) && <SelectItem value={task.epic}>{task.epic}{task.epic_title ? ` · ${task.epic_title}` : ''}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">提出</span>
            <ActorChip name={task.created_by} kind={task.created_by_kind} size={18} />
            <span className="text-xs text-muted-foreground">· 执行</span>
            {task.assignee ? <ActorChip name={task.assignee} kind={task.assignee_kind} size={18} /> : <span className="text-xs text-muted-foreground/70">未领取</span>}
            <span className="text-xs text-muted-foreground">· <RelativeTime value={task.created_at} /> 创建 · 更新 <RelativeTime value={task.updated_at} /></span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
            {!isEpic && task.epic && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">这是 Epic 的一个步骤：</span>
                <EpicChip id={task.epic} title={task.epic_title} />
              </div>
            )}
            <Description task={task} onSave={(description) => patch({ description })} />
            {isEpic && (
              <Card className="gap-0 border p-4 py-4">
                <div className="mb-3 flex items-center">
                  <h2 className="text-base font-semibold">步骤 <span className="text-xs text-muted-foreground">({task.children?.length ?? 0})</span></h2>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => setCreatingStep(true)}><Plus />新建步骤</Button>
                </div>
                <div className="mb-2 flex justify-end">
                  <div className="inline-flex rounded-md border p-0.5">
                    {(['table', 'kanban'] as const).map((view) => (
                      <button key={view} type="button" onClick={() => setStepView(view)}
                        className={cn('h-7 rounded-sm px-2.5 text-xs font-medium', stepView === view ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                        {view === 'table' ? '列表' : '看板'}
                      </button>
                    ))}
                  </div>
                </div>
                {stepView === 'kanban'
                  ? <EpicKanban tasks={task.children ?? []} onChanged={(t) => mutate(t, false)} />
                  : <TaskTable rows={task.children ?? []} total={task.children?.length ?? 0} page={0} pageSize={100} onPageChange={() => {}} showProject compact />}
              </Card>
            )}
            <Card className="gap-0 border p-4 py-4">
              <div className="mb-3 flex items-center">
                <h2 className="text-base font-semibold">Feedback <span className="text-xs text-muted-foreground">({task.feedback_count})</span></h2>
                <div className="flex-1" />
                <Button size="sm" onClick={() => setFeedbackDialog('new')}><MessageSquareText />添加 Feedback</Button>
              </div>
              <FeedbackList feedback={task.feedback} onEdit={(f) => setFeedbackDialog(f)} />
            </Card>
          </div>
        <div className="space-y-4 lg:col-span-4">
            {task.commits.length > 0 && (
              <Card className="gap-0 border p-4 py-4">
                <h2 className="mb-2 text-base font-semibold">提交</h2>
                <div className="flex flex-wrap gap-1.5">
                  {task.commits.map((c) => <Badge key={c} variant="outline" className="font-mono" title={c}><GitCommitVertical />{c.slice(0, 10)}</Badge>)}
                </div>
              </Card>
            )}
            <LinksCard task={task} onChanged={(t) => mutate(t, false)} />
            <Card className="gap-0 border p-4 py-4">
              <h2 className="mb-2 text-base font-semibold">状态历史</h2>
              <HistoryTimeline history={task.history} />
            </Card>
        </div>
      </div>

      {creatingStep && (
        <TaskFormDialog open onClose={() => setCreatingStep(false)} projectKey={task.project_key} defaultEpic={task.id} onCreated={() => mutate()} />
      )}
      {feedbackDialog && (
        <FeedbackDialog
          taskId={task.id}
          feedback={task.feedback}
          editing={feedbackDialog === 'new' ? undefined : feedbackDialog}
          onClose={() => setFeedbackDialog(null)}
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
};

export default TaskDetailPage;
