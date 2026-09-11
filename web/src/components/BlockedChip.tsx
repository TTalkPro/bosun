import { Tooltip } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { TaskLink } from '@/api/types';
import SoftChip from './SoftChip';

// 被阻塞：有未完成的依赖。给了 links 就在 tooltip 里列出阻塞者
const BlockedChip = ({ links }: { links?: TaskLink[] }) => {
  const blockers = (links ?? []).filter((l) => l.type === 'depends_on' && l.direction === 'out' && l.status !== 'DONE' && l.status !== 'VERIFIED').map((l) => l.task);
  return (
    <Tooltip title={blockers.length ? `等待：${blockers.join('、')}` : '有未完成的依赖，不能开始'}>
      <SoftChip icon={<LockOutlinedIcon />} label="被阻塞" tone="default" sx={{ fontWeight: 600 }} />
    </Tooltip>
  );
};

export default BlockedChip;
