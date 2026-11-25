import type { MilestoneStatus } from '@/api/types';
import { cn } from '@/lib/utils';
import { MILESTONE_STATUS_CLASS, MILESTONE_STATUS_LABEL } from './meta';

const MilestoneStatusBadge = ({ status, className }: { status: MilestoneStatus; className?: string }) => (
  <span className={cn('inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-medium', MILESTONE_STATUS_CLASS[status], className)}>
    {MILESTONE_STATUS_LABEL[status]}
  </span>
);

export default MilestoneStatusBadge;
