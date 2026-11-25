import { Link as RouterLink } from 'react-router';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useMilestone } from '@/api/milestones';
import RelativeTime from '@/components/RelativeTime';
import MarkdownView from '@/components/markdown/MarkdownView';
import SidePanel from '@/components/SidePanel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusIcon } from '@/features/tasks/StatusIcon';
import { paths } from '@/routes/paths';
import { cn } from '@/lib/utils';
import MilestoneStatusBadge from './MilestoneStatusBadge';

/** 一个 milestone 的范围变更（14 D7）：哪些任务什么时候、被谁移进 / 移出，去了哪 */
const MilestoneChangesPanel = ({ id, onClose }: { id: string; onClose: () => void }) => {
  const { data: m } = useMilestone(id);
  const changes = m?.changes ?? [];
  const ins = changes.filter((c) => c.direction === 'in').length;
  return (
    <SidePanel size="md" onClose={onClose}
      title={<span className="flex items-center gap-2">范围变更 {m && <><span className="font-normal text-muted-foreground">· {m.name}</span><MilestoneStatusBadge status={m.status} /></>}</span>}>
      {!m ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : (
        <div className="space-y-4">
          {m.status === 'released' && m.summary?.notes && (
            <details className="rounded-lg border bg-muted/30 p-3" open>
              <summary className="cursor-pointer text-sm font-semibold">发布说明</summary>
              <div className="mt-2"><MarkdownView markdown={m.summary.notes} /></div>
            </details>
          )}
          <p className="text-sm text-muted-foreground">
            共 {changes.length} 次变更：移入 {ins}、移出 {changes.length - ins}。现在范围内 {m.counts.total} 个任务{m.counts.epics ? `、${m.counts.epics} 个 Epic` : ''}。
          </p>
          {changes.length === 0 && <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">还没有任务移入或移出</div>}
          <ol className="space-y-2">
            {[...changes].reverse().map((c, i) => (
              <li key={`${c.task}-${c.at}-${i}`} className="flex gap-3 rounded-lg border p-3">
                <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full',
                  c.direction === 'in' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600')}>
                  {c.direction === 'in' ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <RouterLink to={paths.task(c.task)} className="flex items-center gap-1.5 hover:underline">
                    <StatusIcon status={c.status} className="size-3.5 shrink-0" />
                    <span className="font-mono text-xs">{c.task}</span>
                    <span className={cn('min-w-0 truncate', c.kind === 'epic' && 'font-semibold')}>{c.title}</span>
                  </RouterLink>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {c.direction === 'in' ? <>移入（来自 {c.from_name ?? '待规划'}）</> : <>移出 → {c.to_name ?? '待规划'}</>}
                    {' · '}<span className="text-foreground">{c.actor}</span> · <RelativeTime value={c.at} />
                  </div>
                  {c.comment && <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs">{c.comment}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </SidePanel>
  );
};

export default MilestoneChangesPanel;
