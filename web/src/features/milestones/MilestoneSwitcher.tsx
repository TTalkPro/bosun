import { useState, type ReactNode } from 'react';
import { Check, ChevronRight, ChevronsUpDown, Inbox, Layers, Milestone as MilestoneIcon, Plus, Settings2 } from 'lucide-react';
import type { Milestone, MilestoneStatus } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import MilestoneStatusBadge from './MilestoneStatusBadge';
import { ALL, BACKLOG, MILESTONE_STATUS_LABEL, RECENT_RELEASED, dateRange, visibleReleased, type Scope } from './meta';

interface Props {
  milestones: Milestone[];
  scope: Scope;
  /** milestone id / backlog / all */
  onChange: (m: string) => void;
  /** 显示「全部任务」 */
  allowAll?: boolean;
  backlogCount?: number;
  onCreate?: () => void;
  onManage?: () => void;
}

const GROUPS: MilestoneStatus[] = ['active', 'planning', 'released'];

// 固定在列表上下的一行（不随列表滚动，所以不是 cmdk 的 Item；用普通按钮，Tab 可达）
const PinnedRow = ({ icon, label, active, aside, onClick }: { icon: ReactNode; label: string; active?: boolean; aside?: ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent">
    <Check className={cn('size-4 shrink-0', active ? 'opacity-100' : 'opacity-0')} />
    {icon}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {aside}
  </button>
);

/**
 * 项目页页头的范围切换。milestone 多了也不会把入口挤没：
 * - 上面固定「待规划」「全部任务」，下面固定「新建」「管理」，都不随列表滚动；
 * - 中间只放 milestone（进行中 / 规划中 / 已发布），可滚动；已发布的不搜索时只列最近 3 个，
 *   多出来的给一行「查看全部已发布 → 管理页」；搜索时全部参与匹配。
 */
const MilestoneSwitcher = ({ milestones, scope, onChange, allowAll, backlogCount, onCreate, onManage }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const current = scope.kind === 'milestone' ? milestones.find((m) => m.id === scope.id) : undefined;
  const pick = (v: string) => { setOpen(false); setSearch(''); onChange(v); };
  const released = milestones.filter((m) => m.status === 'released');
  const searching = search.trim() !== '';
  const shownReleased = visibleReleased(milestones, scope, searching);
  const hiddenReleased = released.length - shownReleased.length;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
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
          <CommandInput placeholder="搜索 milestone…" value={search} onValueChange={setSearch} />
          {!searching && (
            <div className="border-b p-1">
              <PinnedRow icon={<Inbox className="size-4 text-muted-foreground" />} label="待规划" active={scope.kind === 'backlog'}
                aside={backlogCount != null && <span className="text-xs tabular-nums text-muted-foreground">{backlogCount}</span>}
                onClick={() => pick(BACKLOG)} />
              {allowAll && (
                <PinnedRow icon={<Layers className="size-4 text-muted-foreground" />} label="全部任务" active={scope.kind === 'all'} onClick={() => pick(ALL)} />
              )}
            </div>
          )}
          <CommandList className="max-h-72">
            <CommandEmpty>{milestones.length ? '没有匹配的 milestone' : '还没有 milestone'}</CommandEmpty>
            {GROUPS.map((st) => {
              const items = st === 'released' ? shownReleased : milestones.filter((m) => m.status === st);
              if (!items.length) return null;
              return (
                <CommandGroup key={st} heading={st === 'released' && !searching && released.length > RECENT_RELEASED ? '最近已发布' : MILESTONE_STATUS_LABEL[st]}>
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
                  {st === 'released' && hiddenReleased > 0 && onManage && (
                    <CommandItem value="__more_released" onSelect={() => { setOpen(false); onManage(); }} className="gap-2 text-muted-foreground">
                      <span className="size-4" />
                      <span className="flex-1">查看全部已发布（{released.length}）</span>
                      <ChevronRight className="size-4" />
                    </CommandItem>
                  )}
                </CommandGroup>
              );
            })}
          </CommandList>
          {(onCreate || onManage) && (
            <div className="border-t p-1">
              {onCreate && <PinnedRow icon={<Plus className="size-4" />} label="新建 milestone" onClick={() => { setOpen(false); onCreate(); }} />}
              {onManage && <PinnedRow icon={<Settings2 className="size-4" />} label="管理 milestone…" onClick={() => { setOpen(false); onManage(); }} />}
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MilestoneSwitcher;
