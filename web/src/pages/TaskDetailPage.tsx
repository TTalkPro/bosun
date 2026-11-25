import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Columns3, Copy, Flag, GitCommitVertical, Link2, List, MessageSquareText, MoreHorizontal, Pencil, Plus, X } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { isApiError } from '@/api/client';
import { createTask, updateTask, useEpics, useTask } from '@/api/tasks';
import type { Feedback, FeedbackKind, Priority, Task } from '@/api/types';
import { useProject } from '@/api/projects';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import MarkdownView from '@/components/markdown/MarkdownView';
import RelativeTime from '@/components/RelativeTime';
import ProjectMark from '@/components/ProjectMark';
import Section from '@/components/Section';
import TaskIdChip from '@/components/TaskIdChip';
import ActorChip, { ActorAvatar } from '@/components/ActorChip';
import EpicProgressBar from '@/components/EpicProgressBar';
import KanbanBoard from '@/features/board/KanbanBoard';
import TaskTable from '@/features/tasks/TaskTable';
import TaskFormDialog from '@/features/tasks/TaskFormDialog';
import LinksCard from '@/features/links/LinksCard';
import BlockedChip from '@/components/BlockedChip';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import FeedbackDialog from '@/features/feedback/FeedbackDialog';
import FeedbackComposer from '@/features/feedback/FeedbackComposer';
import ActivityFeed from '@/features/status/ActivityFeed';
import AssigneePicker from '@/features/tasks/AssigneePicker';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import FeedbackList from '@/features/feedback/FeedbackList';
import HistoryTimeline from '@/features/status/HistoryTimeline';
import TransitionButtons from '@/features/status/TransitionButtons';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/features/tasks/status';
import { PriorityIcon, StatusIcon } from '@/features/tasks/StatusIcon';
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
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { commit().catch(() => {}); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit().catch(() => {});
          if (e.key === 'Escape') { setValue(task.title); setEditing(false); }
        }}
        className="h-auto border-0 border-b-2 border-primary px-0 py-0.5 text-2xl font-bold leading-tight shadow-none focus-visible:ring-0 md:text-2xl"
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h1 className="min-w-0 cursor-text text-2xl leading-tight font-bold tracking-tight" onClick={() => setEditing(true)}>{task.title}</h1>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={() => setEditing(true)} aria-label="编辑标题"><Pencil className="size-4" /></Button></TooltipTrigger><TooltipContent>编辑标题</TooltipContent></Tooltip>
    </div>
  );
};

const Description = ({ task, onSave }: { task: Task; onSave: (description: string) => Promise<void> }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description);
  const [session, setSession] = useState(0); // 每次进入编辑重建编辑器；期间任务被刷新不会丢草稿
  const [busy, setBusy] = useState(false);
  return (
    <Section
      title="描述"
      action={editing ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7" onClick={() => setEditing(false)} disabled={busy}>取消</Button>
          <Button size="sm" className="h-7" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(draft); setEditing(false); } catch { /* patch 已提示，留在编辑态 */ } finally { setBusy(false); } }}>保存</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="h-7" onClick={() => { setDraft(task.description); setSession((n) => n + 1); setEditing(true); }}><Pencil />编辑</Button>
      )}
    >
      {editing
        ? <MarkdownEditor key={session} value={draft} onChange={setDraft} minHeight={260} autoFocus />
        : <MarkdownView markdown={task.description} empty="（没有描述，点击「编辑」添加）" />}
    </Section>
  );
};

// 路由 tasks/:id 在任务之间跳转时复用同一个组件实例：按任务 id 加 key 整个重建，
// 免得上一个任务的编辑态（描述草稿、标签输入、弹窗）带到下一个任务里、存错地方。
const TaskDetailPage = () => {
  const { id = '' } = useParams();
  const taskId = id.toUpperCase();
  return <TaskDetail key={taskId} taskId={taskId} />;
};

const TaskDetail = ({ taskId }: { taskId: string }) => {
  const { data: task, error, mutate } = useTask(taskId);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  // null = 关闭；'new' = 新增；Feedback = 修订该条
  const [feedbackDialog, setFeedbackDialog] = useState<'new' | Feedback | null>(null);
  // 内联输入框「Markdown 编辑器…」带过去的草稿
  const [draft, setDraft] = useState<{ content: string; kind: FeedbackKind } | null>(null);
  const { data: project } = useProject(task?.project_key);
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
  if (!task && error) {
    return (
      <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <span className="flex-1">任务 {taskId} 加载失败：{isApiError(error) ? error.message : String(error)}</span>
        <Button size="sm" variant="outline" onClick={() => mutate()}>重试</Button>
      </div>
    );
  }
  if (!task) return <div className="space-y-4"><Skeleton className="h-12 w-80" /><Skeleton className="h-60 w-full rounded-xl" /></div>;
  const addLabel = () => {
    const label = labelInput.trim();
    if (!label || task.labels.includes(label)) return;
    save({ labels: [...task.labels, label] });
    setLabelInput('');
  };
  const removeLabel = (label: string) => save({ labels: task.labels.filter((item) => item !== label) });

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
  // 不关心结果的调用点用它：失败已经提示过了，别再留一个未处理的 rejection
  const save = (input: Parameters<typeof updateTask>[1]) => { patch(input).catch(() => {}); };

  const progress = task.progress;
  const composer = (
    <FeedbackComposer taskId={task.id} feedback={task.feedback} onSent={() => mutate()}
      onExpand={(content, kind) => { setDraft({ content, kind }); setFeedbackDialog('new'); }} />
  );
  // 「写 Feedback」：滚到当前标签页里的输入框并聚焦
  const focusComposer = () => {
    const el = [...document.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="写 Feedback"]')].find((x) => x.offsetParent !== null);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  };
  const openQuestion = task.open_question;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RouterLink className="hover:text-foreground" to={paths.projects}>项目</RouterLink>
          <ChevronRight className="size-3.5" />
          <RouterLink className="inline-flex items-center gap-1.5 hover:text-foreground" to={paths.project(task.project_key)}>
            <ProjectMark projectKey={task.project_key} className="size-4 text-[9px]" />{task.project_key}
          </RouterLink>
          {!isEpic && task.epic && (
            <>
              <ChevronRight className="size-3.5" />
              <RouterLink className="inline-flex max-w-60 items-center gap-1 truncate hover:text-foreground" to={paths.task(task.epic)}>
                <Flag className="size-3.5 shrink-0" /><span className="truncate">{task.epic}{task.epic_title ? ` · ${task.epic_title}` : ''}</span>
              </RouterLink>
            </>
          )}
          <ChevronRight className="size-3.5" />
          <span className="font-medium text-foreground">{task.id}</span>
        </nav>

        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <TaskIdChip id={task.id} size="medium" />
              {isEpic && <Badge variant="secondary" className="h-6"><Flag />Epic</Badge>}
              <span className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium"><StatusIcon status={task.status} className="size-3.5" />{STATUS_LABEL[task.status]}</span>
              <span className="inline-flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium"><PriorityIcon priority={task.priority} />{PRIORITY_LABEL[task.priority]}优先级</span>
              {task.blocked && <BlockedChip links={task.links} />}
              {openQuestion && <span className="inline-flex h-6 items-center gap-1 rounded-md bg-amber-500/15 px-2 text-xs font-semibold text-amber-700 dark:text-amber-400"><CircleHelp className="size-3.5" />有提问待回答</span>}
            </div>
            <InlineTitle task={task} onSave={(title) => patch({ title })} />
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <ActorAvatar name={task.created_by} kind={task.created_by_kind} size={18} />
              <span className="font-medium text-foreground">{task.created_by}</span>
              <span>创建于</span><RelativeTime value={task.created_at} />
              <span className="text-muted-foreground/50">·</span>
              <span>更新于</span><RelativeTime value={task.updated_at} />
              <span className="text-muted-foreground/50">·</span>
              <span className="inline-flex items-center gap-1"><MessageSquareText className="size-3.5" />{task.feedback_count} 条反馈</span>
              {task.commits.length > 0 && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="inline-flex items-center gap-1"><GitCommitVertical className="size-3.5" />{task.commits.length} 个提交</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TransitionButtons task={task} onChanged={(t) => mutate(t, false)} />
            <TaskNav task={task} last={project?.task_count} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          <Description task={task} onSave={(description) => patch({ description })} />

          {isEpic && (
            <Section
              title="步骤"
              count={task.children?.length ?? 0}
              action={
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-7 items-center rounded-md border p-0.5" role="tablist" aria-label="步骤视图">
                    {(['table', 'kanban'] as const).map((view) => (
                      <button key={view} type="button" role="tab" aria-selected={stepView === view} onClick={() => setStepView(view)}
                        className={cn('inline-flex h-5.5 items-center gap-1 rounded-sm px-2 text-xs font-medium transition-colors', stepView === view ? 'bg-secondary text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                        {view === 'table' ? <><List className="size-3.5" />列表</> : <><Columns3 className="size-3.5" />看板</>}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setCreatingStep(true)}><Plus />新建步骤</Button>
                </div>
              }
              bodyClassName="space-y-4"
            >
              {progress && progress.total > 0 && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: '步骤', value: progress.total },
                      { label: '已验收', value: progress.done },
                      { label: '进行中', value: progress.by_status.IN_PROGRESS ?? 0 },
                      { label: '已撤销', value: progress.cancelled },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="text-xs text-muted-foreground">{m.label}</div>
                        <div className="text-xl font-semibold tabular-nums">{m.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>完成率（不含已撤销）</span>
                      <span className="font-medium tabular-nums text-foreground">{Math.round(progress.percent)}%</span>
                    </div>
                    <Progress value={progress.percent} className="h-2" />
                  </div>
                </div>
              )}
              {stepView === 'kanban'
                ? <KanbanBoard tasks={task.children ?? []} onChanged={() => mutate()} showProject storageKey="bosun.board.epic.collapsed"
                    onCreate={() => setCreatingStep(true)}
                    onQuickCreate={async (title) => {
                      try { const t = await createTask(task.project_key, { title, epic: task.id }); await mutate(); enqueueSnackbar(`已创建步骤 ${t.id}`, { variant: 'success', autoHideDuration: 1500 }); }
                      catch (e) { handleError(e); throw e; }
                    }} />
                : <div className="overflow-hidden rounded-lg border"><TaskTable rows={task.children ?? []} total={task.children?.length ?? 0} page={0} pageSize={100} onPageChange={() => {}} showProject compact /></div>}
            </Section>
          )}

          <Card className="gap-0 py-0 shadow-xs">
            <Tabs defaultValue="all" className="gap-0">
              <div className="flex min-h-13 items-center gap-2 border-b px-5 py-2.5">
                <h2 className="mr-2 text-sm font-semibold">动态</h2>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="px-2.5 text-xs">全部</TabsTrigger>
                  <TabsTrigger value="feedback" className="px-2.5 text-xs">
                    Feedback<span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{task.feedback_count}</span>
                  </TabsTrigger>
                  <TabsTrigger value="history" className="px-2.5 text-xs">
                    状态历史<span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{task.history.length}</span>
                  </TabsTrigger>
                </TabsList>
                <div className="flex-1" />
                {openQuestion && <span className="hidden items-center gap-1 text-xs text-amber-700 sm:inline-flex dark:text-amber-400"><CircleHelp className="size-3.5" />有提问待回答</span>}
                <Button size="sm" variant="outline" className="h-7" onClick={focusComposer}><MessageSquareText />写 Feedback</Button>
              </div>
              <TabsContent value="all" className="p-5 pl-6">
                <ActivityFeed history={task.history} feedback={task.feedback} onEditFeedback={(f) => setFeedbackDialog(f)} footer={composer} />
              </TabsContent>
              <TabsContent value="feedback" className="space-y-4 p-5">
                <FeedbackList feedback={task.feedback} onEdit={(f) => setFeedbackDialog(f)} />
                <div className="pl-10 sm:pl-10">{composer}</div>
              </TabsContent>
              <TabsContent value="history" className="p-5">
                <HistoryTimeline history={task.history} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-4">
          <Section title="详情" bodyClassName="p-0">
            <dl className="divide-y text-sm">
              <PropRow label="状态">
                <span className="inline-flex items-center gap-1.5 font-medium"><StatusIcon status={task.status} />{STATUS_LABEL[task.status]}</span>
              </PropRow>
              <PropRow label="优先级" htmlFor="task-priority">
                <Select value={task.priority} onValueChange={(value) => save({ priority: value as Priority })}>
                  <SelectTrigger id="task-priority" size="sm" className="-ml-2 h-7 w-28 border-transparent shadow-none hover:bg-accent dark:bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                      <SelectItem key={p} value={p}><PriorityIcon priority={p} />{PRIORITY_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PropRow>
              <PropRow label="执行人">
                <AssigneePicker projectKey={task.project_key} assignee={task.assignee} assigneeKind={task.assignee_kind}
                  onChange={(assignee) => patch({ assignee }).catch(() => {})} />
              </PropRow>
              <PropRow label="提出人"><ActorChip name={task.created_by} kind={task.created_by_kind} size={20} /></PropRow>
              {!isEpic && (
                <PropRow label="所属 Epic" htmlFor="task-epic">
                  <Select value={task.epic ?? '__none__'} onValueChange={(value) => save({ epic: value === '__none__' ? '' : value })}>
                    <SelectTrigger id="task-epic" size="sm" className="-ml-2 h-7 w-full max-w-60 border-transparent shadow-none hover:bg-accent dark:bg-transparent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">（无）</SelectItem>
                      {(epics?.tasks ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.id} · {item.title}</SelectItem>)}
                      {task.epic && !(epics?.tasks ?? []).some((item) => item.id === task.epic) && <SelectItem value={task.epic}>{task.epic}{task.epic_title ? ` · ${task.epic_title}` : ''}</SelectItem>}
                    </SelectContent>
                  </Select>
                </PropRow>
              )}
              {isEpic && progress && (
                <PropRow label="进度">
                  <div className="flex w-full items-center gap-2">
                    <EpicProgressBar progress={progress} width={120} />
                    <span className="text-xs tabular-nums text-muted-foreground">{Math.round(progress.percent)}%</span>
                  </div>
                </PropRow>
              )}
              <PropRow label="标签" htmlFor="task-label-input" align="start">
                <div className="w-full space-y-2">
                  {task.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {task.labels.map((label) => (
                        <Badge key={label} variant="secondary" className="gap-1 pr-1">
                          {label}
                          <button type="button" onClick={() => removeLabel(label)} aria-label={`删除标签 ${label}`} className="rounded-sm opacity-60 hover:bg-background/60 hover:opacity-100"><X className="size-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Input id="task-label-input" className="h-7 text-xs" value={labelInput} placeholder="添加标签，回车确认"
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) { e.preventDefault(); addLabel(); } }}
                  />
                </div>
              </PropRow>
              <PropRow label="创建"><RelativeTime value={task.created_at} className="text-sm text-foreground" /></PropRow>
              <PropRow label="更新"><RelativeTime value={task.updated_at} className="text-sm text-foreground" /></PropRow>
            </dl>
          </Section>

          <LinksCard task={task} onChanged={(t) => mutate(t, false)} />

          {task.commits.length > 0 && (
            <Section title="提交" count={task.commits.length} bodyClassName="space-y-1.5 py-4">
              {task.commits.map((c) => (
                <div key={c} className="flex items-center gap-2 text-sm">
                  <GitCommitVertical className="size-4 shrink-0 text-muted-foreground" />
                  <code className="min-w-0 flex-1 truncate font-mono text-xs" title={c}>{c}</code>
                  <CopyButton value={c} />
                </div>
              ))}
            </Section>
          )}
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
          initialContent={feedbackDialog === 'new' ? draft?.content : undefined}
          initialKind={feedbackDialog === 'new' ? draft?.kind : undefined}
          onClose={() => { setFeedbackDialog(null); setDraft(null); }}
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
};

// 上一个 / 下一个任务（按编号；编号连续，不会删任务）+ 更多菜单
const TaskNav = ({ task, last }: { task: Task; last?: number }) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const prev = task.seq > 1 ? `${task.project_key}-${task.seq - 1}` : null;
  const next = last && task.seq < last ? `${task.project_key}-${task.seq + 1}` : null;
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); enqueueSnackbar(`已复制${what}`, { variant: 'success', autoHideDuration: 1200 }); } catch { /* ignore */ }
  };
  return (
    <div className="flex items-center gap-1">
      <div className="inline-flex items-center rounded-md border">
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 rounded-r-none" disabled={!prev} onClick={() => prev && navigate(paths.task(prev))} aria-label="上一个任务"><ChevronLeft className="size-4" /></Button>
        </TooltipTrigger><TooltipContent>{prev ? `上一个：${prev}` : '已经是第一个'}</TooltipContent></Tooltip>
        <span className="h-4 w-px bg-border" />
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 rounded-l-none" disabled={!next} onClick={() => next && navigate(paths.task(next))} aria-label="下一个任务"><ChevronRight className="size-4" /></Button>
        </TooltipTrigger><TooltipContent>{next ? `下一个：${next}` : '已经是最后一个'}</TooltipContent></Tooltip>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8" aria-label="更多操作"><MoreHorizontal className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => void copy(task.id, ' ID')}><Copy className="size-4" />复制 ID</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy(window.location.origin + paths.task(task.id), '链接')}><Link2 className="size-4" />复制链接</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate(`${paths.project(task.project_key)}?view=board`)}><Columns3 className="size-4" />在看板中查看</DropdownMenuItem>
          {task.epic && <DropdownMenuItem onSelect={() => navigate(paths.task(task.epic!))}><Flag className="size-4" />打开所属 Epic</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// 详情卡片里的一行属性：左边固定宽度的名称，右边值（可编辑控件直接放进来）
const PropRow = ({ label, htmlFor, align = 'center', children }: { label: string; htmlFor?: string; align?: 'center' | 'start'; children: ReactNode }) => (
  <div className={cn('flex gap-3 px-5 py-2.5', align === 'center' ? 'items-center' : 'items-start')}>
    <dt className={cn('w-16 shrink-0 text-muted-foreground', align === 'start' && 'pt-0.5')}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
    </dt>
    <dd className="flex min-w-0 flex-1 items-center">{children}</dd>
  </div>
);

const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip><TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="复制提交 hash"
        onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </TooltipTrigger><TooltipContent>{copied ? '已复制' : '复制'}</TooltipContent></Tooltip>
  );
};

export default TaskDetailPage;
