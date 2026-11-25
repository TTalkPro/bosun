import { Check, CircleAlert, CirclePlus, UserRound } from 'lucide-react';
import type { Priority } from '@/api/types';
import type { StatCounts } from '@/api/stats';
import { useActors } from '@/api/identity';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { UNASSIGNED, type BoardFilter } from '@/features/board/rules';
import { cn } from '@/lib/utils';
import { PRIORITY_LABEL } from './status';
import { PriorityIcon } from './StatusIcon';

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// 选中项在按钮里的显示：两项以内列名字，多了显示「已选 N」
const Chosen = ({ items }: { items: string[] }) => (
  <>
    <Separator orientation="vertical" className="mx-0.5 !h-4" />
    {items.length > 2
      ? <span className="rounded-sm bg-secondary px-1 text-xs font-normal">已选 {items.length}</span>
      : items.map((x) => <span key={x} className="max-w-24 truncate rounded-sm bg-secondary px-1 text-xs font-normal">{x}</span>)}
  </>
);

const Mark = ({ on }: { on: boolean }) => (
  <span className={cn('flex size-4 items-center justify-center rounded-sm border', on ? 'border-primary bg-primary text-primary-foreground' : 'opacity-60')}>
    {on && <Check className="size-3" />}
  </span>
);

/**
 * 列表视图的分面筛选（shadcn tasks 示例的 faceted filter）：执行人（可搜索，含「未领取」）、优先级、需要关注。
 * 由服务端过滤（翻页才对）；与看板工具条共用 URL 参数 who / pri / attn，切视图时筛选跟着走。
 */
interface Props {
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  /** 本项目的分面计数（/stats?project=）：执行人选项与数字都从这里来 */
  counts?: Pick<StatCounts, 'by_assignee' | 'unassigned' | 'by_priority'>;
}

const ListFacets = ({ value, onChange, counts }: Props) => {
  const { data } = useActors();
  // 选项 = 本项目里真有任务的执行人（按任务数）；URL 里选着但不在里面的也列出来，免得取消不掉。
  // 不用 /actors：只被派了任务、自己还没操作过的人不在那里面
  const byAssignee = counts?.by_assignee ?? {};
  const names = [...new Set([...Object.keys(byAssignee), ...value.who.filter((w) => w !== UNASSIGNED)])]
    .sort((a, b) => (byAssignee[b] ?? 0) - (byAssignee[a] ?? 0) || a.localeCompare(b));
  const kindOf = Object.fromEntries((data?.actors ?? []).map((a) => [a.name, a.kind]));
  const whoLabels = value.who.map((w) => (w === UNASSIGNED ? '未领取' : w));

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 border-dashed">
            <CirclePlus />执行人{value.who.length > 0 && <Chosen items={whoLabels} />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <Command>
            <CommandInput placeholder="搜索执行人" />
            <CommandList>
              <CommandEmpty>没有匹配的人</CommandEmpty>
              <CommandGroup>
                <CommandItem value="~未领取" onSelect={() => onChange({ ...value, who: toggle(value.who, UNASSIGNED) })}>
                  <Mark on={value.who.includes(UNASSIGNED)} /><UserRound className="size-4 text-muted-foreground" /><span className="flex-1">未领取</span>
                  {counts && <span className="text-xs tabular-nums text-muted-foreground">{counts.unassigned}</span>}
                </CommandItem>
                {names.map((n) => (
                  <CommandItem key={n} value={n} onSelect={() => onChange({ ...value, who: toggle(value.who, n) })}>
                    <Mark on={value.who.includes(n)} />
                    <span className="min-w-0 flex-1 truncate">{n}</span>
                    {kindOf[n] === 'agent' && <span className="text-[10px] text-muted-foreground">Agent</span>}
                    <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{byAssignee[n] ?? 0}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {value.who.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem onSelect={() => onChange({ ...value, who: [] })} className="justify-center">清除执行人</CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 border-dashed">
            <CirclePlus />优先级{value.priority.length > 0 && <Chosen items={value.priority.map((p) => PRIORITY_LABEL[p])} />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1">
          {(['high', 'medium', 'low'] as Priority[]).map((p) => (
            <button key={p} type="button" onClick={() => onChange({ ...value, priority: toggle(value.priority, p) })}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
              <Mark on={value.priority.includes(p)} /><PriorityIcon priority={p} /><span className="flex-1 text-left">{PRIORITY_LABEL[p]}</span>
              {counts && <span className="text-xs tabular-nums text-muted-foreground">{counts.by_priority[p] ?? 0}</span>}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="sm" aria-pressed={value.attention} onClick={() => onChange({ ...value, attention: !value.attention })}
        className={cn('h-8', value.attention ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400' : 'border-dashed')}>
        <CircleAlert />需要关注
      </Button>
    </>
  );
};

export default ListFacets;
