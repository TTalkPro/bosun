import { cn } from '@/lib/utils';

interface Props {
  values: number[];
  /** 最后几个点算「本期」，用系列色；之前的用弱化色 */
  current?: number;
  /** 本期柱的颜色类（bg-series-1 / bg-series-2） */
  color: string;
  label: string;
}

/**
 * 统计卡片里的小柱状趋势：不带坐标轴，只看形状。本期（最近 current 天）用系列色，
 * 之前的用弱化灰；0 画一条 1px 底线占位，免得空着像缺数据。纵向刻度至少到 4。数字在 title / aria-label 里。
 */
const Sparkline = ({ values, current = 7, color, label }: Props) => {
  // 刻度下限 4：每天 1 个时不至于每根都顶满，看着像很忙
  const max = Math.max(4, ...values);
  const split = values.length - current;
  return (
    <div className="flex h-8 w-28 shrink-0 items-end gap-0.5" role="img" aria-label={`${label}：${values.join('、')}`} title={`${label}（每天）：${values.join(' · ')}`}>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn('flex-1 rounded-t-[2px]', v === 0 ? 'bg-border' : i >= split ? color : 'bg-muted-foreground/25')}
          style={{ height: v === 0 ? 1 : `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
};

export default Sparkline;
