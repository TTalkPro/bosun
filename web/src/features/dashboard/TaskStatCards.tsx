import { ArrowDownRight, ArrowUpRight, CircleCheck, CircleHelp, Inbox, ListTodo, Lock, Timer } from 'lucide-react';
import type { StatCounts, StatsOverview } from '@/api/stats';
import { cn } from '@/lib/utils';
import { percentChange, windowSums } from './metrics';
import Sparkline from './Sparkline';
import StatCard from './StatCard';

// 环比：完成多了是好事（绿），少了只是提示（不标红，少做几个不是故障）
const Delta = ({ current, previous }: { current: number; previous: number }) => {
  const pct = percentChange(current, previous);
  if (pct === null) return <span>前 7 天 0 个</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium', up ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
      <Icon className="size-3.5" />{up ? '+' : ''}{pct}%
      <span className="ml-1 font-normal text-muted-foreground">较前 7 天</span>
    </span>
  );
};

interface Props {
  /** 卡片上的计数（总览页只加看得见的项目，项目页就是该项目） */
  counts: StatCounts | undefined;
  daily: StatsOverview['daily'] | undefined;
}

/**
 * 四张统计卡片：未结 / 进行中 / 待验收 / 近 7 天完成。总览页与项目页共用。
 * 「未结」「近 7 天完成」带 14 天小趋势（最近 7 天用系列色，与动态图的新建 / 完成同色）。
 */
const TaskStatCards = ({ counts, daily }: Props) => {
  const created = daily ? windowSums(daily, 'created') : undefined;
  const completed = daily ? windowSums(daily, 'completed') : undefined;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="未结任务" icon={Inbox} value={counts?.open}
        trend={daily && <Sparkline values={daily.map((d) => d.created)} color="bg-series-1" label="新建" />}
        footer={created && <>近 7 天新建 <b className="font-medium text-foreground tabular-nums">{created.current}</b> 个</>} />
      <StatCard label="进行中" icon={Timer} value={counts?.by_status.IN_PROGRESS}
        footer={counts && (counts.blocked > 0
          ? <span className="inline-flex items-center gap-1"><Lock className="size-3" />{counts.blocked} 个未结任务被阻塞</span>
          : '没有被阻塞的任务')} />
      <StatCard label="待验收" icon={CircleCheck} value={counts?.by_status.DONE}
        footer={counts && (counts.open_questions > 0
          ? <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><CircleHelp className="size-3" />{counts.open_questions} 个提问待回答</span>
          : '没有待回答的提问')} />
      <StatCard label="近 7 天完成" icon={ListTodo} value={completed?.current}
        trend={daily && <Sparkline values={daily.map((d) => d.completed)} color="bg-series-2" label="完成" />}
        footer={completed && <Delta current={completed.current} previous={completed.previous} />} />
    </div>
  );
};

export default TaskStatCards;
