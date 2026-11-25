import { Check, Inbox, Milestone as MilestoneIcon } from 'lucide-react';
import type { TaskSummary } from '@/api/types';
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useMilestoneCtx } from './context';
import { assignable } from './meta';

/** 卡片 / 行菜单里的「Milestone」子菜单：列规划中 / 进行中 + 待规划 */
const MilestoneSubMenu = ({ task }: { task: TaskSummary }) => {
  const ctx = useMilestoneCtx();
  if (!ctx) return null;
  const options = assignable(ctx.milestones);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2"><MilestoneIcon className="size-4" />Milestone</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        {options.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => { if (m.id !== task.milestone) ctx.requestMove([task], m.id); }}>
            <Check className={cn('size-4', m.id === task.milestone ? 'opacity-100' : 'opacity-0')} />
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            {m.status === 'active' && <span className="text-[10px] text-primary">进行中</span>}
          </DropdownMenuItem>
        ))}
        {options.length === 0 && <DropdownMenuItem disabled>还没有可用的 milestone</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => { if (task.milestone) ctx.requestMove([task], ''); }} disabled={!task.milestone}>
          <Inbox className="size-4" />移到待规划
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};

export default MilestoneSubMenu;
