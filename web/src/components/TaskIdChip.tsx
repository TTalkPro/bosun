import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TaskIdChip = ({ id, size }: { id: string; size?: 'small' | 'medium' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); try { await navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } };
  return (<Tooltip><TooltipTrigger asChild><Badge variant="outline" className={size === 'medium' ? 'h-6 font-mono' : 'h-5.5 font-mono text-xs'} onClick={copy}>{id}</Badge></TooltipTrigger><TooltipContent>{copied ? '已复制' : '复制 ID'}</TooltipContent></Tooltip>);
};
export default TaskIdChip;
