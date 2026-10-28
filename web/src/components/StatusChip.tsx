import type { ComponentProps } from 'react';
import type { Status } from '@/api/types';
import SoftChip from '@/components/SoftChip';
import { STATUS_COLOR, STATUS_LABEL } from '@/features/tasks/status';

const StatusChip = ({ status, ...rest }: { status: Status } & Omit<ComponentProps<typeof SoftChip>, 'tone'> & { sx?: unknown }) => (
  <SoftChip tone={STATUS_COLOR[status]} className="font-bold" {...rest}>{STATUS_LABEL[status]}</SoftChip>
);
export default StatusChip;
