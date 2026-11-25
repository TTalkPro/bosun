import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import dayjs from 'dayjs';
import { CalendarDays, ChevronDown, Columns3, History, MoreHorizontal, Pause, Pencil, Play, Plus, Rocket, RotateCcw, Trash2 } from 'lucide-react';
import { deleteMilestone, useMilestones } from '@/api/milestones';
import { useProject } from '@/api/projects';
import type { Milestone } from '@/api/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import MilestoneChangesPanel from '@/features/milestones/MilestoneChangesPanel';
import MilestoneFormPanel from '@/features/milestones/MilestoneFormPanel';
import MilestoneStatusBadge from '@/features/milestones/MilestoneStatusBadge';
import ReleasePanel from '@/features/milestones/ReleasePanel';
import { dateRange, dueText } from '@/features/milestones/meta';
import { useMilestoneAction } from '@/features/milestones/useMilestoneAction';
import { paths } from '@/routes/paths';
import { cn } from '@/lib/utils';

interface CardProps {
  m: Milestone;
  onEdit: () => void;
  onRelease: () => void;
  onChanges: () => void;
  onDelete: () => void;
  big?: boolean;
}

const MilestoneCard = ({ m, onEdit, onRelease, onChanges, onDelete, big }: CardProps) => {
  const navigate = useNavigate();
  const { run, busy } = useMilestoneAction();
  const due = dueText(m);
  const range = dateRange(m);
  const c = m.counts;
  const open = () => navigate(`${paths.project(m.project_key)}?view=board&m=${m.id}`);
  return (
    <Card className={cn('gap-0 py-0 shadow-xs transition hover:border-foreground/15', big && 'border-primary/30')}>
      <div className="flex items-start gap-3 px-5 pt-4">
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={cn('truncate font-semibold', big ? 'text-lg' : 'text-base')}>{m.name}</span>
            <MilestoneStatusBadge status={m.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {range && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{range}</span>}
            {due && <span className={cn('font-medium', due.overdue ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>{due.text}</span>}
            {m.status === 'released' && m.released_at && <span>{dayjs(m.released_at).format('YYYY-MM-DD')} 发布</span>}
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`${m.name} 操作`} disabled={busy}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={open}><Columns3 className="size-4" />打开看板</DropdownMenuItem>
            <DropdownMenuItem onSelect={onChanges}><History className="size-4" />范围变更</DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}><Pencil className="size-4" />编辑</DropdownMenuItem>
            <DropdownMenuSeparator />
            {m.status === 'planning' && <DropdownMenuItem onSelect={() => run(m, 'activate')}><Play className="size-4" />开始</DropdownMenuItem>}
            {m.status === 'active' && <DropdownMenuItem onSelect={onRelease}><Rocket className="size-4" />发布…</DropdownMenuItem>}
            {m.status === 'active' && <DropdownMenuItem onSelect={() => run(m, 'pause')}><Pause className="size-4" />暂停（回到规划中）</DropdownMenuItem>}
            {m.status === 'released' && <DropdownMenuItem onSelect={() => run(m, 'reopen')}><RotateCcw className="size-4" />重新打开</DropdownMenuItem>}
            {m.status === 'planning' && (
              <DropdownMenuItem onSelect={onDelete} disabled={c.total + c.epics > 0} className="text-destructive focus:text-destructive">
                <Trash2 className="size-4" />删除{c.total + c.epics > 0 ? '（先移走任务）' : ''}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="space-y-1.5 px-5 pt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">完成 <span className="font-medium text-foreground tabular-nums">{c.done}</span> / {c.scope}</span>
          <span className="font-semibold tabular-nums">{c.percent}%</span>
        </div>
        <Progress value={c.percent} className="h-1.5" aria-label="完成率" />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t px-5 py-2.5 text-xs text-muted-foreground">
        <span>进行中 <b className="font-semibold text-foreground tabular-nums">{c.in_progress}</b></span>
        <span>待验收 <b className={cn('font-semibold tabular-nums', c.pending_verify ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>{c.pending_verify}</b></span>
        {c.epics > 0 && <span>Epic <b className="font-semibold text-foreground tabular-nums">{c.epics_done}/{c.epics}</b></span>}
        {m.status === 'released' && m.summary && <span>交付 <b className="font-semibold text-foreground tabular-nums">{m.summary.counts.delivered}</b></span>}
        <button type="button" onClick={onChanges} className="ml-auto inline-flex items-center gap-1 hover:text-foreground"><History className="size-3.5" />{m.status === 'released' ? '发布说明与范围变更' : '范围变更'}</button>
      </div>
    </Card>
  );
};

/** 项目的 milestone 管理：进行中置顶，规划中按目标日期，已发布按发布时间倒序（可折叠） */
const MilestonesPage = () => {
  const { key = '' } = useParams();
  const projectKey = key.toUpperCase();
  const { data: project } = useProject(projectKey);
  const { data, isLoading } = useMilestones(projectKey);
  const [form, setForm] = useState<{ milestone?: Milestone } | null>(null);
  const [changes, setChanges] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);
  const [releasing, setReleasing] = useState<Milestone | null>(null);
  const [showReleased, setShowReleased] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const all = data?.milestones ?? [];
  const active = all.filter((m) => m.status === 'active');
  const planning = all.filter((m) => m.status === 'planning');
  const released = all.filter((m) => m.status === 'released');
  const cardProps = (m: Milestone) => ({ m, onEdit: () => setForm({ milestone: m }), onRelease: () => setReleasing(m), onChanges: () => setChanges(m.id), onDelete: () => setDeleting(m) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Milestone</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <RouterLink to={paths.project(projectKey)} className="hover:text-foreground hover:underline">{project?.name ?? projectKey}</RouterLink>
            {' '}的发布计划：每次发布先规划一组任务，开始后看板只看这一组；同一时间只有一个进行中。
          </p>
        </div>
        <Button onClick={() => setForm({})} disabled={project?.archived}><Plus />新建 milestone</Button>
      </div>

      {isLoading && !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div> : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">进行中</h2>
            {active.length ? active.map((m) => <MilestoneCard key={m.id} big {...cardProps(m)} />) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                没有进行中的 milestone，项目看板现在显示的是待规划池。{planning.length ? '从下面的规划中挑一个开始。' : '先新建一个。'}
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">规划中 <span className="font-normal text-muted-foreground">{planning.length}</span></h2>
            {planning.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{planning.map((m) => <MilestoneCard key={m.id} {...cardProps(m)} />)}</div>
              : <p className="text-sm text-muted-foreground">没有规划中的 milestone</p>}
          </section>
          {released.length > 0 && (
            <section className="space-y-3">
              <button type="button" className="flex items-center gap-1.5 text-sm font-semibold" onClick={() => setShowReleased((v) => !v)} aria-expanded={showReleased}>
                <ChevronDown className={cn('size-4 transition-transform', !showReleased && '-rotate-90')} />
                已发布 <span className="font-normal text-muted-foreground">{released.length}</span>
              </button>
              {showReleased && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{released.map((m) => <MilestoneCard key={m.id} {...cardProps(m)} />)}</div>}
            </section>
          )}
        </>
      )}

      {form && <MilestoneFormPanel projectKey={projectKey} milestone={form.milestone} onClose={() => setForm(null)} />}
      {releasing && <ReleasePanel milestone={releasing} milestones={all} onClose={() => setReleasing(null)} />}
      {changes && <MilestoneChangesPanel id={changes} onClose={() => setChanges(null)} />}
      <ConfirmDialog open={!!deleting} title={`删除 ${deleting?.name ?? ''}？`} message="只有规划中、且没有任务的 milestone 能删除。删除后编号不会复用。" confirmText="删除" danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try { await deleteMilestone(deleting); enqueueSnackbar(`已删除 ${deleting.name}`, { variant: 'success' }); } catch (e) { handleError(e); }
          setDeleting(null);
        }} />
    </div>
  );
};

export default MilestonesPage;
