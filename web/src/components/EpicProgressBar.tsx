import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const EpicProgressBar = ({ progress, width = 140 }: { progress?: { done?: number; active_total?: number; total?: number; percent?: number }; width?: number }) => {
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const percent = progress?.percent ?? (total ? (done / total) * 100 : 0);
  return (<Tooltip><TooltipTrigger asChild><div style={{ width }}><Progress value={percent} /></div></TooltipTrigger><TooltipContent>{done}/{total} 完成</TooltipContent></Tooltip>);
};
export default EpicProgressBar;
