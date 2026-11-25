import { Inbox, Milestone as MilestoneIcon, X } from 'lucide-react';
import type { TaskSummary } from '@/api/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useMilestoneCtx } from './context';
import { assignable } from './meta';

/** 列表勾选后的批量条：设置 milestone / 移到待规划 / 取消选择 */
const BulkMilestoneBar = ({ tasks, onClear }: { tasks: TaskSummary[]; onClear: () => void }) => {
  const ctx = useMilestoneCtx();
  if (!ctx || tasks.length === 0) return null;
  const options = assignable(ctx.milestones);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="toolbar" aria-label="批量操作">
      <span className="font-medium">已选 {tasks.length} 个</span>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8"><MilestoneIcon />设置 Milestone…</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">移到</DropdownMenuLabel>
          {options.map((m) => (
            <DropdownMenuItem key={m.id} onSelect={() => ctx.requestMove(tasks, m.id)}>
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {m.status === 'active' && <span className="text-[10px] text-primary">进行中</span>}
            </DropdownMenuItem>
          ))}
          {options.length === 0 && <DropdownMenuItem disabled>还没有可用的 milestone</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => ctx.requestMove(tasks, '')}><Inbox className="size-4" />移到待规划</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" className="h-8" onClick={onClear}><X />取消选择</Button>
    </div>
  );
};

export default BulkMilestoneBar;
