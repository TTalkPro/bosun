import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { CircleHelp, Lock, Plus } from 'lucide-react';
import { useProjects } from '@/api/projects';
import { useStats } from '@/api/stats';
import RelativeTime from '@/components/RelativeTime';
import ProjectMark from '@/components/ProjectMark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import ActivityChart from '@/features/dashboard/ActivityChart';
import StatusBar from '@/features/dashboard/StatusBar';
import { sumCounts } from '@/features/dashboard/metrics';
import TaskStatCards from '@/features/dashboard/TaskStatCards';
import ProjectFormDialog from '@/features/projects/ProjectFormDialog';
import { StatusIcon } from '@/features/tasks/StatusIcon';
import { ALL_STATUSES, STATUS_BAR, STATUS_LABEL } from '@/features/tasks/status';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';

const DAYS = 14;

const ProjectsPage = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useProjects(showArchived);
  const { data: stats } = useStats(DAYS);
  const projects = useMemo(() => data?.projects ?? [], [data]);

  // 卡片上的数字跟着「显示已归档」走：只加看得见的项目
  const totals = useMemo(
    () => (stats ? sumCounts(projects.map((p) => stats.projects[p.key]).filter((c) => !!c)) : undefined),
    [stats, projects],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">项目</h1>
          <p className="mt-1 text-sm text-muted-foreground">人与 Agent 协作的工单都按项目归档</p>
        </div>
        <div className="flex-1" />
        <Label className="flex items-center gap-2 font-normal">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />显示已归档
        </Label>
        <Button onClick={() => setCreating(true)}><Plus />新建项目</Button>
      </div>

      <TaskStatCards counts={totals} daily={stats?.daily} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 px-5 py-4 shadow-xs lg:col-span-2">
          <div className="mb-2">
            <h2 className="font-semibold">近 {DAYS} 天动态</h2>
            <p className="text-xs text-muted-foreground">每天新建与完成（迁移到「已完成」）的任务数，含已归档项目</p>
          </div>
          <ActivityChart daily={stats?.daily} />
        </Card>
        <Card className="gap-0 px-5 py-4 shadow-xs">
          <div className="mb-3">
            <h2 className="font-semibold">状态分布</h2>
            <p className="text-xs text-muted-foreground">{totals ? `共 ${totals.total} 个任务，${totals.epics} 个 Epic` : ' '}</p>
          </div>
          {totals ? (
            <div className="space-y-3">
              {ALL_STATUSES.map((s) => {
                const n = totals.by_status[s];
                return (
                  <div key={s} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIcon status={s} className="size-3.5" />
                      <span className="flex-1">{STATUS_LABEL[s]}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full rounded-full', STATUS_BAR[s])} style={{ width: totals.total ? `${(n / totals.total) * 100}%` : 0 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Skeleton className="h-56 w-full" />}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-semibold">全部项目 <span className="text-sm font-normal text-muted-foreground">{projects.length}</span></h2>

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        )}

        {!isLoading && projects.length === 0 && (
          <Card className="border py-4"><CardContent className="px-4">
            <p className="text-sm text-muted-foreground">还没有项目。点右上角「新建项目」，或让 Agent 通过 MCP 的 <code>create_project</code> 创建。</p>
          </CardContent></Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const c = stats?.projects[p.key];
            return (
              <RouterLink key={p.key} to={paths.project(p.key)} className="block h-full">
                <Card className={cn('group h-full gap-0 py-5 shadow-xs transition hover:border-foreground/15 hover:shadow-md', p.archived && 'opacity-60')}>
                  <CardContent className="flex h-full flex-col px-5">
                    <div className="flex items-center gap-3">
                      <ProjectMark projectKey={p.key} className="size-9 rounded-lg text-sm" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold group-hover:underline">{p.name}</h3>
                        <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                      </div>
                      {p.archived && <Badge variant="secondary">已归档</Badge>}
                    </div>
                    <p className="mt-3 line-clamp-2 min-h-10 flex-1 text-sm text-muted-foreground">
                      {p.description || '（无描述）'}
                    </p>
                    <div className="mt-4 space-y-2">
                      {c ? <StatusBar counts={c.by_status} /> : <Skeleton className="h-2 w-full" />}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {c ? (
                          <>
                            <span><b className="font-medium text-foreground tabular-nums">{c.open}</b> 未结</span>
                            <span><b className="font-medium text-foreground tabular-nums">{c.by_status.VERIFIED}</b> 已验收</span>
                            {c.open_questions > 0 && <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400"><CircleHelp className="size-3" />{c.open_questions}</span>}
                            {c.blocked > 0 && <span className="inline-flex items-center gap-0.5"><Lock className="size-3" />{c.blocked}</span>}
                          </>
                        ) : <span>{p.task_count} 个任务</span>}
                        <span className="flex-1" />
                        <RelativeTime value={p.updated_at} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </RouterLink>
            );
          })}
        </div>
      </div>

      {creating && <ProjectFormDialog open onClose={() => setCreating(false)} />}
    </div>
  );
};

export default ProjectsPage;
