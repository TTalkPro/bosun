import { useState } from 'react';
import { Check, ChevronsUpDown, Inbox, Layers, Milestone as MilestoneIcon, Plus, Settings2 } from 'lucide-react';
import type { Milestone, MilestoneStatus } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import MilestoneStatusBadge from './MilestoneStatusBadge';
import { ALL, BACKLOG, MILESTONE_STATUS_LABEL, dateRange, type Scope } from './meta';

interface Props {
  milestones: Milestone[];
  scope: Scope;
  /** milestone id / backlog / all */
  onChange: (m: string) => void;
  /** 列表视图才有「全部」 */
  allowAll?: boolean;
  backlogCount?: number;
  onCreate?: () => void;
  onManage?: () => void;
}

const GROUPS: MilestoneStatus[] = ['active', 'planning', 'released'];

/** 项目页页头的范围切换：进行中 / 规划中 / 已发布 / 待规划 / 全部 */
const MilestoneSwitcher = ({ milestones, scope, onChange, allowAll, backlogCount, onCreate, onManage }: Props) => {
  const [open, setOpen] = useState(false);
  const current = scope.kind === 'milestone' ? milestones.find((m) => m.id === scope.id) : undefined;
  const pick = (v: string) => { setOpen(false); onChange(v); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 max-w-80 justify-start gap-2 px-3" aria-label="切换 milestone">
          {scope.kind === 'backlog' ? <Inbox className="size-4 text-muted-foreground" />
            : scope.kind === 'all' ? <Layers className="size-4 text-muted-foreground" />
            : <MilestoneIcon className="size-4 text-muted-foreground" />}
          <span className="min-w-0 truncate font-semibold">
            {scope.kind === 'backlog' ? '待规划' : scope.kind === 'all' ? '全部任务' : current?.name ?? scope.id}
          </span>
          {current && <MilestoneStatusBadge status={current.status} />}
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="搜索 milestone…" />
          <CommandList className="max-h-96">
            <CommandEmpty>没有匹配的 milestone</CommandEmpty>
            {GROUPS.map((st) => {
              const items = milestones.filter((m) => m.status === st);
              if (!items.length) return null;
              return (
                <CommandGroup key={st} heading={MILESTONE_STATUS_LABEL[st]}>
                  {items.map((m) => (
                    <CommandItem key={m.id} value={`${m.name} ${m.id}`} onSelect={() => pick(m.id)} className="gap-2">
                      <Check className={cn('size-4', scope.kind === 'milestone' && scope.id === m.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[dateRange(m), `${m.counts.scope} 个任务`, m.counts.epics ? `${m.counts.epics} 个 Epic` : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{m.counts.percent}%</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="__backlog 待规划" onSelect={() => pick(BACKLOG)} className="gap-2">
                <Check className={cn('size-4', scope.kind === 'backlog' ? 'opacity-100' : 'opacity-0')} />
                <Inbox className="size-4 text-muted-foreground" />
                <span className="flex-1">待规划</span>
                {backlogCount != null && <span className="text-xs tabular-nums text-muted-foreground">{backlogCount}</span>}
              </CommandItem>
              {allowAll && (
                <CommandItem value="__all 全部任务" onSelect={() => pick(ALL)} className="gap-2">
                  <Check className={cn('size-4', scope.kind === 'all' ? 'opacity-100' : 'opacity-0')} />
                  <Layers className="size-4 text-muted-foreground" />
                  <span className="flex-1">全部任务</span>
                </CommandItem>
              )}
            </CommandGroup>
            {(onCreate || onManage) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {onCreate && <CommandItem value="__create 新建" onSelect={() => { setOpen(false); onCreate(); }} className="gap-2"><Plus className="size-4" />新建 milestone</CommandItem>}
                  {onManage && <CommandItem value="__manage 管理" onSelect={() => { setOpen(false); onManage(); }} className="gap-2"><Settings2 className="size-4" />管理 milestone…</CommandItem>}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MilestoneSwitcher;
