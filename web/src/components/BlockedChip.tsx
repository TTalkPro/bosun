import { Lock } from 'lucide-react';
import type { TaskLink } from '@/api/types';
import SoftChip from './SoftChip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const BlockedChip = ({ links }: { links?: TaskLink[] }) => {
  const blockers = (links ?? []).filter((l) => l.type === 'depends_on' && l.direction === 'out' && l.status !== 'DONE' && l.status !== 'VERIFIED').map((l) => l.task);
  return (<Tooltip><TooltipTrigger asChild><SoftChip className="font-semibold"><Lock />被阻塞</SoftChip></TooltipTrigger><TooltipContent>{blockers.length ? `等待：${blockers.join('、')}` : '有未完成的依赖，不能开始'}</TooltipContent></Tooltip>);
};
export default BlockedChip;
