import { useState } from 'react';
import { Check, ChevronsUpDown, UserPlus, UserRound, X } from 'lucide-react';
import { useActors } from '@/api/identity';
import { useStats } from '@/api/stats';
import ActorChip from '@/components/ActorChip';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  projectKey: string;
  assignee: string | null;
  assigneeKind: 'human' | 'agent' | null;
  /** '' = 取消指派 */
  onChange: (assignee: string) => Promise<unknown> | void;
}

/**
 * 执行人选择（详情卡片里）：候选 = 本项目里已有任务的执行人（按任务数）+ 组织里出现过的人 / Agent；
 * 也可以直接输入一个名字指派（Agent 的名字往往还没在系统里出现过）。领取（开始）时后端会把开始的人记成执行人。
 */
const AssigneePicker = ({ projectKey, assignee, assigneeKind, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: stats } = useStats(14, projectKey);
  const { data: actors } = useActors();
  const byAssignee = stats?.projects[projectKey]?.by_assignee ?? {};
  const kindOf = Object.fromEntries((actors?.actors ?? []).map((a) => [a.name, a.kind]));
  const names = [...new Set([...Object.keys(byAssignee), ...(actors?.actors ?? []).map((a) => a.name)])]
    .sort((a, b) => (byAssignee[b] ?? 0) - (byAssignee[a] ?? 0) || a.localeCompare(b));
  const typed = search.trim();
  const pick = async (name: string) => { setOpen(false); setSearch(''); if (name !== (assignee ?? '')) await onChange(name); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 h-7 max-w-full justify-start gap-1.5 px-2 font-normal" aria-label="修改执行人">
          {assignee ? <ActorChip name={assignee} kind={assigneeKind} size={20} /> : <span className="inline-flex items-center gap-1.5 text-muted-foreground"><UserRound className="size-4" />未领取</span>}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="搜索或输入名字" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty className="py-2" />
            <CommandGroup>
              {names.map((n) => (
                <CommandItem key={n} value={n} onSelect={() => void pick(n)}>
                  <Check className={cn('size-4', n === assignee ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{n}</span>
                  {kindOf[n] === 'agent' && <span className="text-[10px] text-muted-foreground">Agent</span>}
                  {byAssignee[n] ? <span className="text-xs tabular-nums text-muted-foreground">{byAssignee[n]}</span> : null}
                </CommandItem>
              ))}
              {typed && !names.includes(typed) && (
                <CommandItem value={`__assign__${typed}`} onSelect={() => void pick(typed)}>
                  <UserPlus className="size-4" />指派给「{typed}」
                </CommandItem>
              )}
            </CommandGroup>
            {assignee && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="__clear__" onSelect={() => void pick('')}><X className="size-4" />取消指派</CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default AssigneePicker;
