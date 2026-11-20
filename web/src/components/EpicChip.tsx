import { useNavigate } from 'react-router';
import { Flag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { paths } from '@/routes/paths';

const EpicChip = ({ id, title, size }: { id: string; title?: string | null; size?: 'small' | 'medium' }) => {
  const navigate = useNavigate();
  return (
    <Tooltip><TooltipTrigger asChild>
      <Badge variant="outline" className={size === 'medium' ? 'h-6' : 'h-5.5'} onClick={(e) => { e.stopPropagation(); navigate(paths.task(id)); }}>
        <Flag className="size-3" />{title ? `${id} · ${title}` : id}
      </Badge>
    </TooltipTrigger><TooltipContent>{title ? `Epic · ${title}` : 'Epic'}</TooltipContent></Tooltip>
  );
};
export default EpicChip;
