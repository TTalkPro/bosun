import { useState } from 'react';
import dayjs from 'dayjs';
import type { StatsOverview } from '@/api/stats';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { niceMax } from './metrics';

const SERIES = [
  { key: 'created', label: '新建', color: 'bg-series-1' },
  { key: 'completed', label: '完成', color: 'bg-series-2' },
] as const;

const HEIGHT = 168;

/**
 * 每日「新建 vs 完成」分组柱图（参照 shadcn dashboard 的 Tasks completed vs started）。
 * - 两个系列：分类色 1、2 号位（已校验色盲区分度 / 对比度），图例常显，颜色不是唯一标识；
 * - 柱宽封顶 14px、顶端 4px 圆角、底端方角，同组两柱之间 2px 空隙；数为 0 不画；
 * - 整天一列都是悬停热区，提示框给日期与两个数；屏幕阅读器读隐藏的表格。
 */
const ActivityChart = ({ daily }: { daily: StatsOverview['daily'] | undefined }) => {
  const [hover, setHover] = useState<number | null>(null);
  if (!daily) return <Skeleton className="h-[220px] w-full" />;

  const max = niceMax(Math.max(0, ...daily.flatMap((d) => [d.created, d.completed])));
  const ticks = [max, max / 2, 0];
  // 天数多时隔几天标一个日期，最后一天总是标
  const every = daily.length > 10 ? Math.ceil(daily.length / 7) : 1;
  const today = dayjs().format('YYYY-MM-DD');

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className={cn('size-2.5 rounded-[3px]', s.color)} />{s.label}</span>
        ))}
      </div>
      <div className="flex gap-2" aria-hidden>
        {/* 纵轴刻度 */}
        <div className="relative w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" style={{ height: HEIGHT }}>
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: (i / (ticks.length - 1)) * HEIGHT }}>{t}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: HEIGHT }}>
            {/* 网格：1px 实线、比面板深一档 */}
            {ticks.map((t, i) => (
              <div key={t} className="absolute inset-x-0 border-t border-border/70" style={{ top: (i / (ticks.length - 1)) * HEIGHT }} />
            ))}
            <div className="absolute inset-0 flex">
              {daily.map((d, i) => (
                <div
                  key={d.date}
                  data-day={d.date}
                  className={cn('relative flex flex-1 items-end justify-center gap-0.5 rounded-sm transition-colors', hover === i && 'bg-muted/70')}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                >
                  {SERIES.map((s) => (
                    <span
                      key={s.key}
                      className={cn('w-full max-w-3.5 rounded-t-[4px]', s.color)}
                      style={{ height: (d[s.key] / max) * HEIGHT }}
                    />
                  ))}
                  {hover === i && (
                    <div className={cn(
                      // 放在该列旁边、绘图区顶部，不盖住标题和图例；左半边往右开，右半边往左开
                      'pointer-events-none absolute top-1 z-10 w-32 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md',
                      i < daily.length / 2 ? 'left-full ml-1' : 'right-full mr-1',
                    )}>
                      <div className="mb-1 font-medium">{dayjs(d.date).format('M 月 D 日')}{d.date === today ? '（今天）' : ''}</div>
                      {SERIES.map((s) => (
                        <div key={s.key} className="flex items-center gap-1.5">
                          <span className={cn('size-2 rounded-[2px]', s.color)} />
                          <span className="flex-1 text-muted-foreground">{s.label}</span>
                          <span className="font-medium tabular-nums">{d[s.key]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex text-[11px] text-muted-foreground">
            {daily.map((d, i) => (
              <span key={d.date} className="flex-1 text-center tabular-nums">
                {i === daily.length - 1 ? '今天' : (daily.length - 1 - i) % every === 0 ? dayjs(d.date).format('M/D') : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>每日新建与完成的任务数</caption>
        <thead><tr><th>日期</th><th>新建</th><th>完成</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.created}</td><td>{d.completed}</td></tr>)}</tbody>
      </table>
    </div>
  );
};

export default ActivityChart;
