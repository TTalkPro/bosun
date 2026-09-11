import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { Autocomplete, Box, Breadcrumbs, Button, Chip, Grid, IconButton, InputBase, Link, MenuItem, Paper, Skeleton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import CommitIcon from '@mui/icons-material/Commit';
import FlagIcon from '@mui/icons-material/Flag';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
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
import TaskTable from '@/features/tasks/TaskTable';
import TaskFormDialog from '@/features/tasks/TaskFormDialog';
import LinksCard from '@/features/links/LinksCard';
import BlockedChip from '@/components/BlockedChip';
import { useApiError } from '@/components/useApiError';
import FeedbackDialog from '@/features/feedback/FeedbackDialog';
import FeedbackList from '@/features/feedback/FeedbackList';
import HistoryTimeline from '@/features/status/HistoryTimeline';
import TransitionButtons from '@/features/status/TransitionButtons';
import { PRIORITY_LABEL } from '@/features/tasks/status';
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
      <InputBase
        autoFocus fullWidth value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, borderBottom: 2, borderColor: 'primary.main' }}
      />
    );
  }
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
      <Typography variant="h4" sx={{ cursor: 'text', minWidth: 0 }} onClick={() => setEditing(true)}>{task.title}</Typography>
      <Tooltip title="编辑标题"><IconButton size="small" onClick={() => setEditing(true)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
    </Stack>
  );
};

const Description = ({ task, onSave }: { task: Task; onSave: (description: string) => Promise<void> }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description);
  const [session, setSession] = useState(0); // 每次进入编辑重建编辑器；期间任务被刷新不会丢草稿
  const [busy, setBusy] = useState(false);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>描述</Typography>
        <Box sx={{ flex: 1 }} />
        {editing ? (
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => setEditing(false)} disabled={busy}>取消</Button>
            <Button size="small" variant="contained" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(draft); setEditing(false); } finally { setBusy(false); } }}>保存</Button>
          </Stack>
        ) : (
          <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => { setDraft(task.description); setSession((n) => n + 1); setEditing(true); }}>编辑</Button>
        )}
      </Stack>
      {editing
        ? <MarkdownEditor key={session} value={draft} onChange={setDraft} minHeight={260} autoFocus />
        : <MarkdownView markdown={task.description} empty="（没有描述，点击「编辑」添加）" />}
    </Paper>
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
  const [creatingStep, setCreatingStep] = useState(false);
  const isEpic = task?.kind === 'epic';
  const { data: epics } = useEpics(task && !isEpic ? task.project_key : undefined);

  useEffect(() => {
    document.title = task ? `${task.id} · ${task.title} - Bosun` : 'Bosun';
    return () => { document.title = 'Bosun'; };
  }, [task]);

  if (isApiError(error) && (error.status === 404 || error.status === 400)) return <NotFoundPage message={`任务 ${taskId} 不存在`} />;
  if (!task) return <Stack spacing={2}><Skeleton width={320} height={48} /><Skeleton variant="rounded" height={240} /></Stack>;

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
    <Box>
      <Breadcrumbs sx={{ mb: 1.5 }}>
        <Link component={RouterLink} to={paths.projects} underline="hover" color="inherit">项目</Link>
        <Link component={RouterLink} to={paths.project(task.project_key)} underline="hover" color="inherit">{task.project_key}</Link>
        <Typography color="text.primary">{task.id}</Typography>
      </Breadcrumbs>

      <Stack spacing={1.5} sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
          <TaskIdChip id={task.id} size="medium" />
          {isEpic && <Chip size="small" icon={<FlagIcon />} label="Epic" color="secondary" />}
          <StatusChip status={task.status} />
          {task.blocked && <BlockedChip links={task.links} />}
          {isEpic && task.progress && <EpicProgressBar progress={task.progress} width={220} />}
          <Box sx={{ flex: 1 }} />
          <TransitionButtons task={task} onChanged={(t) => mutate(t, false)} />
        </Stack>
        <InlineTitle task={task} onSave={(title) => patch({ title })} />
        <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
          <TextField select size="small" label="优先级" value={task.priority} onChange={(e) => patch({ priority: e.target.value as Priority })} sx={{ minWidth: 110 }}>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <MenuItem key={p} value={p}>{PRIORITY_LABEL[p]}</MenuItem>)}
          </TextField>
          <Autocomplete
            multiple freeSolo size="small" options={[]} value={task.labels}
            onChange={(_, v) => patch({ labels: v as string[] })}
            renderTags={(value, getTagProps) => value.map((option, index) => <Chip size="small" label={option} {...getTagProps({ index })} key={option} />)}
            renderInput={(params) => <TextField {...params} label="标签" placeholder="回车添加" />}
            sx={{ minWidth: 260, flex: 1, maxWidth: 520 }}
          />
          {!isEpic && (
            <TextField select size="small" label="所属 Epic" value={task.epic ?? ''} onChange={(e) => patch({ epic: e.target.value })} sx={{ minWidth: 200, maxWidth: 320 }}>
              <MenuItem value="">（无）</MenuItem>
              {(epics?.tasks ?? []).map((e) => <MenuItem key={e.id} value={e.id}>{e.id} · {e.title}</MenuItem>)}
              {task.epic && !(epics?.tasks ?? []).some((e) => e.id === task.epic) && <MenuItem value={task.epic}>{task.epic}{task.epic_title ? ` · ${task.epic_title}` : ''}</MenuItem>}
            </TextField>
          )}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="caption" color="text.secondary">提出</Typography>
            <ActorChip name={task.created_by} kind={task.created_by_kind} size={18} />
            <Typography variant="caption" color="text.secondary">· 执行</Typography>
            {task.assignee ? <ActorChip name={task.assignee} kind={task.assignee_kind} size={18} /> : <Typography variant="caption" color="text.disabled">未领取</Typography>}
            <Typography variant="caption" color="text.secondary">· <RelativeTime value={task.created_at} /> 创建 · 更新 <RelativeTime value={task.updated_at} /></Typography>
          </Stack>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            {!isEpic && task.epic && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">这是 Epic 的一个步骤：</Typography>
                <EpicChip id={task.epic} title={task.epic_title} />
              </Stack>
            )}
            <Description task={task} onSave={(description) => patch({ description })} />
            {isEpic && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>步骤 <Typography component="span" variant="caption" color="text.secondary">({task.children?.length ?? 0})</Typography></Typography>
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setCreatingStep(true)}>新建步骤</Button>
                </Stack>
                <TaskTable rows={task.children ?? []} total={task.children?.length ?? 0} page={0} pageSize={100} onPageChange={() => {}} showProject compact />
              </Paper>
            )}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Feedback <Typography component="span" variant="caption" color="text.secondary">({task.feedback_count})</Typography></Typography>
                <Box sx={{ flex: 1 }} />
                <Button size="small" variant="contained" startIcon={<AddCommentOutlinedIcon />} onClick={() => setFeedbackDialog('new')}>添加 Feedback</Button>
              </Stack>
              <FeedbackList feedback={task.feedback} onEdit={(f) => setFeedbackDialog(f)} />
            </Paper>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            {task.commits.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>提交</Typography>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {task.commits.map((c) => <Chip key={c} size="small" icon={<CommitIcon />} variant="outlined" label={c.slice(0, 10)} title={c} sx={{ fontFamily: '"JetBrains Mono", Menlo, monospace' }} />)}
                </Stack>
              </Paper>
            )}
            <LinksCard task={task} onChanged={(t) => mutate(t, false)} />
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>状态历史</Typography>
              <HistoryTimeline history={task.history} />
            </Paper>
          </Stack>
        </Grid>
      </Grid>

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
    </Box>
  );
};

export default TaskDetailPage;
