import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { CircleAlert, CircleCheck, Rocket } from 'lucide-react';
import { assignMilestone, milestoneAction } from '@/api/milestones';
import { useEpics, useTasks } from '@/api/tasks';
import type { Milestone, TaskSummary } from '@/api/types';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import { useSnackbar } from '@/components/notify';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusIcon } from '@/features/tasks/StatusIcon';
import { STATUS_LABEL } from '@/features/tasks/status';
import { paths } from '@/routes/paths';
import { cn } from '@/lib/utils';
import { defaultCarryTarget, isFinished, isUnfinished, releaseNotes } from './release';

const TaskLines = ({ tasks }: { tasks: TaskSummary[] }) => (
  <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-sm">
    {tasks.map((t) => (
      <li key={t.id}>
        <RouterLink to={paths.task(t.id)} target="_blank" className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent">
          <StatusIcon status={t.status} className="size-3.5 shrink-0" />
          <span className="font-mono text-xs text-muted-foreground">{t.id}</span>
          <span className={cn('min-w-0 flex-1 truncate', t.kind === 'epic' && 'font-semibold')}>{t.title}</span>
          <span className="text-xs text-muted-foreground">{STATUS_LABEL[t.status]}</span>
        </RouterLink>
      </li>
    ))}
  </ul>
);

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: string }) => (
  <div className="rounded-lg border bg-card px-3 py-2.5">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={cn('mt-0.5 text-xl font-semibold tabular-nums', tone)}>{value}</div>
  </div>
);

interface Props {
  milestone: Milestone;
  milestones: Milestone[];
  onClose: () => void;
}

/**
 * 发布（14 §4.3）= 这次发布的验收：
 * - 还有没做完的（新建 / 进行中，Epic 也算）不能发布——在这里一键移到别的 milestone / 待规划，或者去把它们做完；
 * - 发布时已完成的全部自动变为已验收；
 * - 发布说明按 Epic 分组自动生成，可以改。
 */
const ReleasePanel = ({ milestone: m, milestones, onClose }: Props) => {
  const { data } = useTasks(m.project_key, { milestone: m.id, limit: 500 });
  const { data: epics } = useEpics(m.project_key);
  const [target, setTarget] = useState(() => defaultCarryTarget(milestones, m));
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const steps = tasks.filter((t) => t.kind !== 'epic');
  const delivered = steps.filter(isFinished);
  const toVerify = tasks.filter((t) => t.status === 'DONE');
  const unfinished = tasks.filter(isUnfinished);
  const dropped = steps.filter((t) => t.status === 'REJECTED' || t.status === 'CANCELLED');
  const epicTitles = useMemo(() => Object.fromEntries((epics?.tasks ?? []).map((e) => [e.id, e.title])), [epics]);
  const draft = useMemo(() => (data && epics ? releaseNotes(m, tasks, epicTitles) : null), [data, epics, m, tasks, epicTitles]);
  const others = milestones.filter((x) => x.status !== 'released' && x.id !== m.id);
  const nameOf = (id: string) => (id === 'backlog' ? '待规划' : milestones.find((x) => x.id === id)?.name ?? id);

  const moveOut = async () => {
    setBusy(true);
    try {
      const r = await assignMilestone(m.project_key, unfinished.map((t) => t.id), target === 'backlog' ? '' : target, `${m.name} 发布前移出`);
      enqueueSnackbar(r.failed.length ? `移出 ${r.updated.length} 个，${r.failed.length} 个失败：${r.failed[0].reason}` : `已把 ${r.updated.length} 个没做完的移到 ${nameOf(target)}`,
        { variant: r.failed.length ? 'warning' : 'success' });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    setBusy(true);
    try {
      await milestoneAction(m, 'release', { notes: notes ?? draft ?? '' });
      enqueueSnackbar(`${m.name} 已发布：交付 ${delivered.length} 项${toVerify.length ? `，${toVerify.length} 项随发布验收` : ''}`, { variant: 'success' });
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const blocked = unfinished.length > 0;
  return (
    <SidePanel
      title={<span className="flex items-center gap-2"><Rocket className="size-4" />发布 {m.name}</span>}
      onClose={onClose}
      busy={busy}
      actions={<>
        <span className={cn('mr-auto self-center text-xs', blocked ? 'text-destructive' : 'text-muted-foreground')}>
          {blocked ? `还有 ${unfinished.length} 个没做完，先完成或移出才能发布` : '发布即验收；发布后不能再往里加任务，可以「重新打开」'}
        </span>
        <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
        <Button onClick={release} disabled={busy || !data || blocked}><Rocket />发布 {m.name}</Button>
      </>}
    >
      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            {blocked ? (
              <section className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alert">
                <div className="flex items-start gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div>
                    <h3 className="text-sm font-semibold">有 {unfinished.length} 个任务没有完成</h3>
                    <p className="text-xs text-muted-foreground">发布就是这次的验收，范围里不能有新建 / 进行中的任务。先把它们做完，或者移出这个 milestone。</p>
                  </div>
                </div>
                <TaskLines tasks={unfinished} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">全部移到</span>
                  <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger className="h-8 w-48 bg-background" aria-label="移到哪里"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {others.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}{x.target_date ? `（目标 ${x.target_date}）` : ''}</SelectItem>)}
                      <SelectItem value="backlog">待规划</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8" onClick={moveOut} disabled={busy}>移出这 {unfinished.length} 个</Button>
                </div>
                <p className="text-xs text-muted-foreground">移出会记进每个任务的 milestone 变更记录（「{m.name} 发布前移出」）。要做完的话点任务打开处理。</p>
              </section>
            ) : (
              <p className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CircleCheck className="size-4" />范围里的任务都完成了，可以发布
              </p>
            )}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">这次交付</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="交付" value={delivered.length} tone="text-emerald-700 dark:text-emerald-400" />
                <Stat label="随发布验收" value={toVerify.length} />
                <Stat label="没做完" value={unfinished.length} tone={blocked ? 'text-destructive' : undefined} />
                <Stat label="拒绝 / 撤销" value={dropped.length} />
              </div>
              {toVerify.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">这些已完成、还没验收的会在发布时自动变为<b className="font-medium text-foreground">已验收</b>：</p>
                  <TaskLines tasks={toVerify} />
                </div>
              )}
              {delivered.length === 0 && <p className="text-xs text-muted-foreground">这次还没有已完成的任务。</p>}
            </section>
          </div>

          <section className="flex min-h-96 flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label>发布说明</Label>
              <span className="text-xs text-muted-foreground">按 Epic 分组自动生成，可以改；存进这次发布的记录</span>
            </div>
            <div className="min-h-0 flex-1">
              {draft != null && <MarkdownEditor value={draft} onChange={setNotes} minHeight={360} fill />}
            </div>
          </section>
        </div>
      )}
    </SidePanel>
  );
};

export default ReleasePanel;
