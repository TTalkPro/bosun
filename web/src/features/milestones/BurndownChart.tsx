import { useLayoutEffect, useState } from 'react';
import dayjs from 'dayjs';
import type { StatsOverview } from '@/api/stats';
import { Skeleton } from '@/components/ui/skeleton';
import { niceMax } from '@/features/dashboard/metrics';
import { cn } from '@/lib/utils';
import { burndownSeries } from './release';

const PAD = { top: 8, right: 8, bottom: 20, left: 26 };

interface Props {
  daily: StatsOverview['daily'] | undefined;
  targetDate: string | null;
  height?: number;
}

/**
 * 燃尽图（14 §5）：每天结束时还剩多少没完成（实线，系列色 1），理想线从第一天的范围线性降到目标日 0（虚线，灰）。
 * 今天以后只有理想线。悬停整列出十字线与提示框；屏幕阅读器读隐藏的表格。
 */
const BurndownChart = ({ daily, targetDate, height = 150 }: Props) => {
  // 回调 ref：骨架换成图表时绘图区是新元素，观察者要跟着换
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  if (!daily) return <Skeleton className="w-full" style={{ height: height + 28 }} />;
  const { actual, ideal } = burndownSeries(daily, targetDate);
  const max = niceMax(Math.max(0, ...actual.filter((v): v is number => v != null), ...ideal.filter((v): v is number => v != null)));
  const n = daily.length;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const path = (vals: (number | null)[]) =>
    vals.reduce((acc, v, i) => (v == null ? acc : `${acc}${acc && vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`), '');
  const todayIdx = daily.findIndex((d) => d.date === dayjs().format('YYYY-MM-DD'));
  const lastActual = actual.reduce<number>((last, v, i) => (v != null ? i : last), -1);
  // 横轴最多标 6 个左右；从最后一天往回数，第一天总是标，但离它太近的不标（免得两个日期挤在一起）
  const every = n > 6 ? Math.ceil(n / 6) : 1;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full bg-series-1" />剩余</span>
        {ideal.some((v) => v != null) && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed border-muted-foreground/60" />理想</span>}
      </div>
      <div ref={setEl} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} className="overflow-visible" aria-hidden>
            {[max, max / 2, 0].map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{t}</text>
              </g>
            ))}
            {todayIdx >= 0 && todayIdx < n - 1 && (
              <line x1={x(todayIdx)} x2={x(todayIdx)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-muted-foreground/40" strokeDasharray="2 3" />
            )}
            <path d={path(ideal)} fill="none" className="stroke-muted-foreground/60" strokeWidth={2} strokeDasharray="5 4" />
            <path d={path(actual)} fill="none" className="stroke-series-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {lastActual >= 0 && (
              <circle cx={x(lastActual)} cy={y(actual[lastActual]!)} r={4} className="fill-series-1 stroke-card" strokeWidth={2} />
            )}
            {hover != null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-foreground/30" />
                {actual[hover] != null && <circle cx={x(hover)} cy={y(actual[hover]!)} r={4} className="fill-series-1 stroke-card" strokeWidth={2} />}
              </>
            )}
            {daily.map((d, i) => (i === 0 || ((n - 1 - i) % every === 0 && i >= every)) && (
              <text key={d.date} x={x(i)} y={height - 4} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-muted-foreground text-[10px] tabular-nums">
                {dayjs(d.date).format('M/D')}
              </text>
            ))}
          </svg>
        )}
        {/* 悬停热区：每天一列，比线粗得多 */}
        <div className="absolute flex" style={{ left: PAD.left - innerW / Math.max(1, n - 1) / 2, width: innerW + innerW / Math.max(1, n - 1), top: 0, bottom: PAD.bottom }}>
          {daily.map((d, i) => <div key={d.date} className="h-full flex-1" onMouseEnter={() => setHover(i)} />)}
        </div>
        {hover != null && (
          <div className={cn('pointer-events-none absolute top-0 z-10 w-36 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md',
            hover < n / 2 ? '' : '-translate-x-full')}
            style={{ left: x(hover) + (hover < n / 2 ? 10 : -10) }}>
            <div className="mb-1 font-medium">{dayjs(daily[hover].date).format('M 月 D 日')}</div>
            <Row label="剩余" value={actual[hover] ?? '—'} swatch="bg-series-1" />
            {ideal[hover] != null && <Row label="理想" value={Math.round(ideal[hover]! * 10) / 10} swatch="bg-muted-foreground/60" />}
            <Row label="移入" value={daily[hover].created} />
            <Row label="完成" value={daily[hover].completed} />
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>燃尽：每天结束时剩余未完成的任务数</caption>
        <thead><tr><th>日期</th><th>剩余</th><th>理想</th><th>移入</th><th>完成</th></tr></thead>
        <tbody>{daily.map((d, i) => <tr key={d.date}><td>{d.date}</td><td>{actual[i] ?? ''}</td><td>{ideal[i] ?? ''}</td><td>{d.created}</td><td>{d.completed}</td></tr>)}</tbody>
      </table>
    </div>
  );
};

const Row = ({ label, value, swatch }: { label: string; value: number | string; swatch?: string }) => (
  <div className="flex items-center gap-1.5">
    {swatch ? <span className={cn('size-2 rounded-[2px]', swatch)} /> : <span className="size-2" />}
    <span className="flex-1 text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{value}</span>
  </div>
);

export default BurndownChart;
