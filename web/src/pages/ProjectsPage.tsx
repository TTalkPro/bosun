import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { Plus } from 'lucide-react';
import { useProjects } from '@/api/projects';
import RelativeTime from '@/components/RelativeTime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import ProjectFormDialog from '@/features/projects/ProjectFormDialog';
import { paths } from '@/routes/paths';

const ProjectsPage = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useProjects(showArchived);
  const projects = data?.projects ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">项目</h1>
        <div className="flex-1" />
        <Label className="flex items-center gap-2 font-normal">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />显示已归档
        </Label>
        <Button onClick={() => setCreating(true)}><Plus />新建项目</Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-30 w-full rounded-xl" />)}
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <Card className="border py-4"><CardContent className="px-4">
          <p className="text-sm text-muted-foreground">还没有项目。点右上角「新建项目」，或让 Agent 通过 MCP 的 <code>create_project</code> 创建。</p>
        </CardContent></Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div key={p.key}>
            <RouterLink to={paths.project(p.key)} className="block h-full">
              <Card className={`h-full gap-0 border transition hover:border-ring/60 hover:shadow-md ${p.archived ? 'opacity-60' : ''}`}>
                <CardContent>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge className="font-mono font-bold">{p.key}</Badge>
                    {p.archived && <Badge variant="outline">已归档</Badge>}
                  </div>
                  <h2 className="truncate text-lg font-semibold">{p.name}</h2>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {p.description || '（无描述）'}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{p.task_count} 个任务</span>
                    <RelativeTime value={p.updated_at} />
                  </div>
                </CardContent>
              </Card>
            </RouterLink>
          </div>
        ))}
      </div>

      {creating && <ProjectFormDialog open onClose={() => setCreating(false)} />}
    </div>
  );
};

export default ProjectsPage;
