import { ArrowDown, ArrowRight, ArrowUp, CircleCheck, CircleCheckBig, CircleDashed, CircleOff, CircleSlash, Timer, type LucideIcon } from 'lucide-react';
import type { Priority, Status } from '@/api/types';
import { cn } from '@/lib/utils';
import { PRIORITY_TEXT, STATUS_TEXT } from './status';

// 状态 / 优先级的图标与色：看板列头、卡片、表格、筛选面板共用（参照 shadcn tasks 示例的写法）
const STATUS_ICON: Record<Status, LucideIcon> = {
  NEW: CircleDashed,
  IN_PROGRESS: Timer,
  DONE: CircleCheck,
  VERIFIED: CircleCheckBig,
  REJECTED: CircleSlash,
  CANCELLED: CircleOff,
};

export const StatusIcon = ({ status, className }: { status: Status; className?: string }) => {
  const Icon = STATUS_ICON[status];
  return <Icon aria-hidden className={cn('size-4 shrink-0', STATUS_TEXT[status], className)} />;
};

const PRIORITY_ICON: Record<Priority, LucideIcon> = { low: ArrowDown, medium: ArrowRight, high: ArrowUp };

export const PriorityIcon = ({ priority, className }: { priority: Priority; className?: string }) => {
  const Icon = PRIORITY_ICON[priority];
  return <Icon aria-hidden className={cn('size-3.5 shrink-0', PRIORITY_TEXT[priority], className)} />;
};
