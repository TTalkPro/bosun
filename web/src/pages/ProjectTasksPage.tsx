import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Box, Button, Chip, Collapse, IconButton, Paper, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useProject } from '@/api/projects';
import { useTasks } from '@/api/tasks';
import type { Status, TaskFilter, TaskKind } from '@/api/types';
import { isApiError } from '@/api/client';
import MarkdownView from '@/components/markdown/MarkdownView';
import ProjectFormDialog from '@/features/projects/ProjectFormDialog';
import TaskFilters from '@/features/tasks/TaskFilters';
import TaskFormDialog from '@/features/tasks/TaskFormDialog';
import TaskTable from '@/features/tasks/TaskTable';
import { ALL_STATUSES } from '@/features/tasks/status';
import { paths } from '@/routes/paths';
import NotFoundPage from './NotFoundPage';

const PAGE_SIZE = 25;

// 筛选 ↔ URL query（刷新不丢）
const readFilter = (sp: URLSearchParams): TaskFilter => {
  const status = sp.get('status')?.split(',').filter((s): s is Status => (ALL_STATUSES as string[]).includes(s));
  return {
    status: status?.length ? status : undefined,
    q: sp.get('q') || undefined,
    kind: (['task', 'epic'] as const).find((k) => k === sp.get('kind')) as TaskKind | undefined,
    offset: Number(sp.get('offset') || 0) || 0,
    limit: PAGE_SIZE,
  };
};
const writeFilter = (f: TaskFilter): URLSearchParams => {
  const sp = new URLSearchParams();
  if (f.status?.length) sp.set('status', f.status.join(','));
  if (f.q) sp.set('q', f.q);
  if (f.kind) sp.set('kind', f.kind);
  if (f.offset) sp.set('offset', String(f.offset));
  return sp;
};

const ProjectTasksPage = () => {
  const { key = '' } = useParams();
  const projectKey = key.toUpperCase();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const filter = useMemo(() => readFilter(sp), [sp]);
  const setFilter = (f: TaskFilter) => setSp(writeFilter(f), { replace: true });

  const { data: project, error: projectError, isLoading: loadingProject } = useProject(projectKey);
  const { data, isLoading } = useTasks(project ? projectKey : undefined, filter);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  if (isApiError(projectError) && projectError.status === 404) return <NotFoundPage message={`项目 ${projectKey} 不存在`} />;

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" spacing={2} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {loadingProject ? <Skeleton width={240} height={40} /> : (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h4" noWrap>{project?.name}</Typography>
              <Chip label={projectKey} sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
              {project?.archived && <Chip label="已归档" variant="outlined" />}
              {project?.description && (
                <IconButton size="small" onClick={() => setDescOpen((v) => !v)} sx={{ transform: descOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-label="展开描述">
                  <ExpandMoreIcon />
                </IconButton>
              )}
            </Stack>
          )}
        </Box>
        <Tooltip title="项目设置"><IconButton onClick={() => setEditing(true)} disabled={!project}><SettingsOutlinedIcon /></IconButton></Tooltip>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} disabled={!project || project.archived}>新建任务</Button>
      </Stack>

      {project?.description && (
        <Collapse in={descOpen}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><MarkdownView markdown={project.description} /></Paper>
        </Collapse>
      )}

      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <TaskFilters value={filter} onChange={setFilter} />
      </Paper>

      <TaskTable
        rows={data?.tasks ?? []}
        total={data?.total ?? 0}
        loading={isLoading}
        page={Math.floor((filter.offset ?? 0) / PAGE_SIZE)}
        pageSize={PAGE_SIZE}
        onPageChange={(page) => setFilter({ ...filter, offset: page * PAGE_SIZE })}
      />

      {creating && <TaskFormDialog open onClose={() => setCreating(false)} projectKey={projectKey} onCreated={(t) => navigate(paths.task(t.id))} />}
      {editing && project && <ProjectFormDialog open onClose={() => setEditing(false)} project={project} />}
    </Box>
  );
};

export default ProjectTasksPage;
