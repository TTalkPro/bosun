import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  /** 数字下面的一行：环比 / 附注 */
  footer?: ReactNode;
  /** 数字右边的小趋势图 */
  trend?: ReactNode;
  className?: string;
}

// 统计卡片（shadcn dashboard 的 stat card：标签 + 图标 / 大数字 / 一行附注）
const StatCard = ({ label, value, icon: Icon, footer, trend, className }: Props) => (
  <Card className={cn('gap-0 px-5 py-4 shadow-xs', className)}>
    <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
      {label}
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted"><Icon className="size-4 text-muted-foreground" /></span>
    </div>
    <div className="mt-1 flex items-end justify-between gap-3">
      {value === undefined
        ? <Skeleton className="h-9 w-16" />
        : <div className="text-3xl font-semibold tracking-tight tabular-nums">{value.toLocaleString()}</div>}
      {trend}
    </div>
    {footer && <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{footer}</div>}
  </Card>
);

export default StatCard;
