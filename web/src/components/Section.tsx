import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  title: ReactNode;
  /** 标题旁的计数徽标 */
  count?: number;
  description?: ReactNode;
  /** 页眉右侧（按钮等） */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

// 详情页的分区卡片（shadcn dashboard 卡片的写法）：页眉一条细分隔线，标题 + 计数 + 右侧操作，下面是内容
const Section = ({ title, count, description, action, children, className, bodyClassName }: Props) => (
  <Card className={cn('gap-0 py-0 shadow-xs', className)}>
    <div className="flex min-h-13 items-center gap-2 border-b px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          {count != null && <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
    <div className={cn('p-5', bodyClassName)}>{children}</div>
  </Card>
);

export default Section;
