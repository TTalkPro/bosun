import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { CircleAlert, CircleCheck, Rocket } from 'lucide-react';
import { createMilestone, milestoneAction } from '@/api/milestones';
import { useEpics, useTasks } from '@/api/tasks';
import type { Milestone, TaskSummary } from '@/api/types';
import FormField from '@/components/FormField';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import { useSnackbar } from '@/components/notify';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusIcon } from '@/features/tasks/StatusIcon';
import { STATUS_LABEL } from '@/features/tasks/status';
import { paths } from '@/routes/paths';
import { cn } from '@/lib/utils';
import { defaultCarryTarget, isFinished, isUnfinished, releaseNotes } from './release';

const NEW = '__new__';

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
 * 发布（14 §4.3）：看清这次交付了什么 → 决定没做完的去哪 → 改发布说明 → 发布。
 * 已完成未验收的算交付（审定时定的），单独列出来提醒之后验收。
 */
const ReleasePanel = ({ milestone: m, milestones, onClose }: Props) => {
  const { data } = useTasks(m.project_key, { milestone: m.id, limit: 500 });
  const { data: epics } = useEpics(m.project_key);
  const [target, setTarget] = useState(() => defaultCarryTarget(milestones, m));
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const steps = tasks.filter((t) => t.kind !== 'epic');
  const delivered = steps.filter(isFinished);
  const pending = steps.filter((t) => t.status === 'DONE');
  const unfinished = tasks.filter(isUnfinished);
  const dropped = steps.filter((t) => t.status === 'REJECTED' || t.status === 'CANCELLED');
  const epicTitles = useMemo(() => Object.fromEntries((epics?.tasks ?? []).map((e) => [e.id, e.title])), [epics]);
  const draft = useMemo(() => (data && epics ? releaseNotes(m, tasks, epicTitles) : null), [data, epics, m, tasks, epicTitles]);
  const planning = milestones.filter((x) => x.status === 'planning' && x.id !== m.id);

  const release = async () => {
    if (target === NEW && !newName.trim()) { setNameError('写个名称，比如 0.1.5'); return; }
    setBusy(true);
    try {
      let carry = target;
      if (unfinished.length && target === NEW) {
        const created = await createMilestone(m.project_key, { name: newName.trim() });
        carry = created.id;
      }
      await milestoneAction(m, 'release', { carry_over: unfinished.length ? carry : 'backlog', notes: notes ?? draft ?? '' });
      enqueueSnackbar(`${m.name} 已发布：交付 ${delivered.length} 项${unfinished.length ? `，${unfinished.length} 项结转` : ''}`, { variant: 'success' });
      onClose();
    } catch (e) {
      const { field, message } = handleError(e, ['name']);
      if (field === 'name') setNameError(message.includes('already exists') ? '已经有同名的 milestone' : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={<span className="flex items-center gap-2"><Rocket className="size-4" />发布 {m.name}</span>}
      onClose={onClose}
      busy={busy}
      actions={<>
        <span className="mr-auto self-center text-xs text-muted-foreground">发布后不能再往里加任务；可以「重新打开」</span>
        <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
        <Button onClick={release} disabled={busy || !data}><Rocket />发布 {m.name}</Button>
      </>}
    >
      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">这次交付</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="交付" value={delivered.length} tone="text-emerald-700 dark:text-emerald-400" />
                <Stat label="其中待验收" value={pending.length} tone={pending.length ? 'text-amber-700 dark:text-amber-400' : undefined} />
                <Stat label="没做完" value={unfinished.length} />
                <Stat label="拒绝 / 撤销" value={dropped.length} />
              </div>
              {pending.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />这些已完成但还没验收：算本次交付，之后照常验收。
                  </p>
                  <TaskLines tasks={pending} />
                </div>
              )}
              {delivered.length === 0 && <p className="text-xs text-muted-foreground">这次没有已完成的任务。</p>}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">没做完的 <span className="font-normal text-muted-foreground">{unfinished.length}</span></h3>
              {unfinished.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><CircleCheck className="size-4" />全部做完了，没有要结转的</p>
              ) : (
                <>
                  <TaskLines tasks={unfinished} />
                  <FormField label="移到" htmlFor="carry-target" hint="新建和进行中的任务都会移过去，每条都记进它的 milestone 变更记录">
                    <Select value={target} onValueChange={(v) => { setTarget(v); setNameError(undefined); }}>
                      <SelectTrigger id="carry-target" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {planning.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}{x.target_date ? `（目标 ${x.target_date}）` : ''}</SelectItem>)}
                        <SelectItem value={NEW}>新建一个 milestone…</SelectItem>
                        <SelectItem value="backlog">退回待规划</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  {target === NEW && (
                    <FormField label="新 milestone 名称" htmlFor="carry-new" error={nameError}>
                      <Input id="carry-new" value={newName} autoFocus placeholder="例如 0.1.5" aria-invalid={!!nameError}
                        onChange={(e) => { setNewName(e.target.value); setNameError(undefined); }} />
                    </FormField>
                  )}
                </>
              )}
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
