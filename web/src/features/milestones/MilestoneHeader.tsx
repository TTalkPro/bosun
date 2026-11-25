import dayjs from 'dayjs';
import { useState } from 'react';
import { CalendarDays, ChevronDown, CircleCheck, Flag, Inbox, MoreHorizontal, Pause, Pencil, Play, Plus, Rocket, RotateCcw, Timer } from 'lucide-react';
import type { StatsOverview } from '@/api/stats';
import MarkdownView from '@/components/markdown/MarkdownView';
import type { Milestone } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import BurndownChart from './BurndownChart';
import MilestoneStatusBadge from './MilestoneStatusBadge';
import { dateRange, dueText } from './meta';
import { useMilestoneAction } from './useMilestoneAction';

const Metric = ({ icon: Icon, label, value, tone }: { icon: typeof Timer; label: string; value: string | number; tone?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', tone)}>
    <Icon className="size-3.5" />{label}<span className="font-semibold tabular-nums text-foreground">{value}</span>
  </span>
);

interface HeaderProps {
  milestone: Milestone;
  /** 按 milestone 的统计（燃尽用 daily）；还没回来时显示骨架 */
  daily: StatsOverview['daily'] | undefined;
  onEdit: () => void;
  onRelease: () => void;
}

/** 选中某个 milestone 时项目页页头下的概况卡片：左边进度与计数，右边燃尽图；已发布的再给发布记录 */
export const MilestoneHeader = ({ milestone: m, daily, onEdit, onRelease }: HeaderProps) => {
  const { run, busy } = useMilestoneAction();
  const [notesOpen, setNotesOpen] = useState(false);
  const due = dueText(m);
  const range = dateRange(m);
  const c = m.counts;
  const s = m.summary;
  return (
    <Card className="gap-0 px-5 py-4 shadow-xs">
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold">{m.name}</h2>
                <MilestoneStatusBadge status={m.status} />
                {range && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{range}</span>}
                {due && <span className={cn('text-xs font-medium', due.overdue ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>{due.text}</span>}
              </div>
              {m.description && <p className="line-clamp-1 text-sm text-muted-foreground">{m.description.replace(/[#*`>_-]/g, '').trim()}</p>}
            </div>
            <div className="flex items-center gap-2">
              {m.status === 'planning' && <Button size="sm" onClick={() => run(m, 'activate')} disabled={busy}><Play />开始</Button>}
              {m.status === 'active' && <Button size="sm" onClick={onRelease} disabled={busy}><Rocket />发布…</Button>}
              <Button size="sm" variant="outline" onClick={onEdit}><Pencil />编辑</Button>
              {(m.status === 'active' || m.status === 'released') && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="size-8" aria-label="更多操作" disabled={busy}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {m.status === 'active' && <DropdownMenuItem onSelect={() => run(m, 'pause')}><Pause className="size-4" />暂停（回到规划中）</DropdownMenuItem>}
                    {m.status === 'released' && <DropdownMenuItem onSelect={() => run(m, 'reopen')}><RotateCcw className="size-4" />重新打开</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {m.status === 'released' && s ? (
            <div className="mt-4 space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400"><Rocket className="size-4" />
                  {m.released_at ? dayjs(m.released_at).format('YYYY-MM-DD HH:mm') : ''} 由 {s.released_by} 发布
                </span>
                <span className="text-muted-foreground">交付 <b className="text-foreground tabular-nums">{s.counts.delivered}</b></span>
                {s.counts.pending_verify > 0 && <span className="text-amber-700 dark:text-amber-400">其中待验收 {s.counts.pending_verify}</span>}
                {s.carried_over.length > 0 && <span className="text-muted-foreground">结转 {s.carried_over.length} → {s.carried_to === 'backlog' ? '待规划' : s.carried_to_name ?? s.carried_to}</span>}
                {s.notes && (
                  <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-medium hover:underline" onClick={() => setNotesOpen((v) => !v)} aria-expanded={notesOpen}>
                    <ChevronDown className={cn('size-3.5 transition-transform', !notesOpen && '-rotate-90')} />发布说明
                  </button>
                )}
              </div>
              {notesOpen && s.notes && <div className="rounded-md border bg-card p-3"><MarkdownView markdown={s.notes} /></div>}
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">完成 <span className="font-medium text-foreground tabular-nums">{c.done}</span> / {c.scope}（已完成 + 已验收；不含 Epic 与已拒绝 / 已撤销）</span>
                  <span className="font-semibold tabular-nums">{c.percent}%</span>
                </div>
                <Progress value={c.percent} aria-label="完成率" />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                <Metric icon={Inbox} label="未开始" value={c.open - c.in_progress} />
                <Metric icon={Timer} label="进行中" value={c.in_progress} />
                <Metric icon={CircleCheck} label="待验收" value={c.pending_verify} tone={c.pending_verify ? 'text-amber-700 dark:text-amber-400' : undefined} />
                <Metric icon={CircleCheck} label="已验收" value={c.verified} />
                {c.epics > 0 && <Metric icon={Flag} label="Epic 完成" value={`${c.epics_done} / ${c.epics}`} />}
                {(c.rejected + c.cancelled) > 0 && <span className="text-xs text-muted-foreground">另有 {c.rejected + c.cancelled} 个已拒绝 / 已撤销</span>}
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 border-t pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <div className="mb-1 text-xs font-medium">燃尽</div>
          <BurndownChart daily={daily} targetDate={m.target_date} height={130} />
        </div>
      </div>
    </Card>
  );
};

/** 待规划视图的提示条：没有进行中的 milestone 时引导新建或开始一个 */
export const BacklogHeader = ({ hasActive, planning, onCreate }: { hasActive: boolean; planning: Milestone[]; onCreate: () => void }) => {
  const { run, busy } = useMilestoneAction();
  return (
    <Card className="flex-row flex-wrap items-center gap-3 px-5 py-4 shadow-xs">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Inbox className="size-4.5 text-muted-foreground" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">待规划</div>
        <p className="text-xs text-muted-foreground">
          {hasActive ? '还没排进任何 milestone 的任务。用行菜单，或勾选后批量把它们排进去。'
            : '当前没有进行中的 milestone。新建一个，或从规划中挑一个开始，就能用看板跟踪那一次发布。'}
        </p>
      </div>
      {!hasActive && planning.slice(0, 2).map((m) => (
        <Button key={m.id} size="sm" variant="outline" onClick={() => run(m, 'activate')} disabled={busy}><Play />开始 {m.name}</Button>
      ))}
      <Button size="sm" variant={hasActive ? 'outline' : 'default'} onClick={onCreate}><Plus />新建 milestone</Button>
    </Card>
  );
};
