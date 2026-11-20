import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ChevronDown, Plus, Settings } from 'lucide-react';
import { useProject } from '@/api/projects';
import { useTasks } from '@/api/tasks';
import type { Status, TaskFilter, TaskKind } from '@/api/types';
import { isApiError } from '@/api/client';
import MarkdownView from '@/components/markdown/MarkdownView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    <div>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {loadingProject ? <Skeleton className="h-10 w-60" /> : (
            <div className="flex items-center gap-3">
              <h1 className="truncate text-3xl font-bold tracking-tight">{project?.name}</h1>
              <Badge className="font-mono font-bold">{projectKey}</Badge>
              {project?.archived && <Badge variant="outline">已归档</Badge>}
              {project?.description && (
                <Button variant="ghost" size="icon" className={descOpen ? 'rotate-180 transition-transform' : 'transition-transform'} onClick={() => setDescOpen((v) => !v)} aria-label="展开描述">
                  <ChevronDown className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => setEditing(true)} disabled={!project} aria-label="项目设置"><Settings className="size-4" /></Button></TooltipTrigger><TooltipContent>项目设置</TooltipContent></Tooltip>
        <Button onClick={() => setCreating(true)} disabled={!project || project.archived}><Plus />新建任务</Button>
      </div>

      {project?.description && (
        descOpen && <Card className="mb-4 gap-0 border p-4 py-4"><MarkdownView markdown={project.description} /></Card>
      )}

      <Card className="mb-4 gap-0 border p-3 py-3">
        <TaskFilters value={filter} onChange={setFilter} />
      </Card>

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
    </div>
  );
};

export default ProjectTasksPage;
