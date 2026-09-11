import type { ChipProps } from '@mui/material';
import type { Status } from '@/api/types';
import SoftChip from '@/components/SoftChip';
import { STATUS_COLOR, STATUS_LABEL } from '@/features/tasks/status';

const StatusChip = ({ status, ...rest }: { status: Status } & Omit<ChipProps, 'label' | 'color' | 'variant'>) => (
  <SoftChip label={STATUS_LABEL[status]} tone={STATUS_COLOR[status]} sx={{ fontWeight: 700 }} {...rest} />
);

export default StatusChip;
