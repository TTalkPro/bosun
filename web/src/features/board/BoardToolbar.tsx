import { ArrowDownUp, Bot, CircleAlert, UserRound, X } from 'lucide-react';
import type { Priority, TaskSummary } from '@/api/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PriorityIcon } from '@/features/tasks/StatusIcon';
import { PRIORITY_LABEL } from '@/features/tasks/status';
import { cn } from '@/lib/utils';
import {
  assigneesOf, BOARD_SORTS, EMPTY_BOARD_FILTER, isBoardFilterActive, SORT_LABEL, UNASSIGNED,
  type BoardFilter, type BoardSort,
} from './rules';

interface Props {
  /** 筛选前的全部任务（算执行人列表与各项计数） */
  tasks: TaskSummary[];
  /** 筛选后还剩几个 */
  shown: number;
  value: BoardFilter;
  onChange: (next: BoardFilter) => void;
  sort: BoardSort;
  onSortChange: (s: BoardSort) => void;
}

const STACK = 5;

// 头像叠放里用首字母 + 按名字散列的底色（图标头像都长一样，叠在一起分不出是谁）；Agent 右下角带个小标
const HUES = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500'];
const hueOf = (name: string) => HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
const initialOf = (name: string) => {
  const base = name.includes('/') ? name.split('/')[0] : name;   // keel/feature-x → k
  return [...base][0]?.toUpperCase() ?? '?';
};
const Initial = ({ name, agent, size = 26 }: { name: string; agent: boolean; size?: number }) => (
  <span className={cn('relative flex shrink-0 items-center justify-center rounded-full font-semibold text-white', hueOf(name))}
    style={{ width: size, height: size, fontSize: size * 0.42 }}>
    {initialOf(name)}
    {agent && <span className="absolute -right-0.5 -bottom-0.5 flex size-3 items-center justify-center rounded-full bg-background text-foreground"><Bot className="size-2.5" /></span>}
  </span>
);
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * 看板工具条（参照 dashboard 的 Kanban：头像叠放的成员筛选 + 筛选 + 排序）。只在前端筛已拉回的任务；
 * 执行人头像点一下只看他的（可多选），「未领取」单独一个；优先级三档；「需要关注」= 被阻塞或有提问待回答。
 */
const BoardToolbar = ({ tasks, shown, value, onChange, sort, onSortChange }: Props) => {
  const people = assigneesOf(tasks);
  const unassigned = tasks.filter((t) => !t.assignee).length;
  const attention = tasks.filter((t) => t.blocked || t.open_question).length;
  const stack = people.slice(0, STACK);
  const rest = people.slice(STACK);
  const restSelected = rest.filter((p) => value.who.includes(p.name)).length;
  const active = isBoardFilterActive(value);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2 shadow-xs">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">执行人</span>
        <div className="flex items-center -space-x-1.5">
          {stack.map((p) => {
            const on = value.who.includes(p.name);
            return (
              <Tooltip key={p.name}><TooltipTrigger asChild>
                <button type="button" aria-pressed={on} aria-label={`只看 ${p.name}（${p.count}）`}
                  onClick={() => onChange({ ...value, who: toggle(value.who, p.name) })}
                  className={cn('rounded-full ring-2 transition-transform hover:z-10 hover:-translate-y-0.5', on ? 'z-10 ring-primary' : 'ring-card')}>
                  <Initial name={p.name} agent={p.kind === 'agent'} />
                </button>
              </TooltipTrigger><TooltipContent>{p.name}{p.kind === 'agent' ? '（Agent）' : ''} · {p.count} 个任务</TooltipContent></Tooltip>
            );
          })}
          {rest.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label={`其余 ${rest.length} 位执行人`}
                  className={cn('relative flex size-[26px] items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2',
                    restSelected ? 'z-10 ring-primary' : 'ring-card')}>
                  +{rest.length}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                {rest.map((p) => (
                  <label key={p.name} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox checked={value.who.includes(p.name)} onCheckedChange={() => onChange({ ...value, who: toggle(value.who, p.name) })} />
                    <Initial name={p.name} agent={p.kind === 'agent'} size={20} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{p.count}</span>
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
        {unassigned > 0 && (
          <button type="button" aria-pressed={value.who.includes(UNASSIGNED)} onClick={() => onChange({ ...value, who: toggle(value.who, UNASSIGNED) })}
            className={cn('inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2 text-xs transition-colors',
              value.who.includes(UNASSIGNED) ? 'border-solid border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
            <UserRound className="size-3.5" />未领取<span className="tabular-nums">{unassigned}</span>
          </button>
        )}
        {people.length === 0 && unassigned === 0 && <span className="text-xs text-muted-foreground">—</span>}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">优先级</span>
        <div className="inline-flex h-7 items-center rounded-md border p-0.5">
          {(['high', 'medium', 'low'] as Priority[]).map((p) => {
            const on = value.priority.includes(p);
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => onChange({ ...value, priority: toggle(value.priority, p) })}
                className={cn('inline-flex h-5.5 items-center gap-1 rounded-sm px-2 text-xs font-medium transition-colors',
                  on ? 'bg-secondary text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                <PriorityIcon priority={p} className="size-3" />{PRIORITY_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" aria-pressed={value.attention} onClick={() => onChange({ ...value, attention: !value.attention })}
        className={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
          value.attention ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground')}>
        <CircleAlert className="size-3.5" />需要关注<span className="tabular-nums">{attention}</span>
      </button>

      <div className="ml-auto flex items-center gap-3">
        {active && (
          <>
            <span className="text-xs tabular-nums text-muted-foreground">显示 {shown} / {tasks.length}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(EMPTY_BOARD_FILTER)}>清除<X /></Button>
          </>
        )}
        <div className="flex items-center gap-1.5">
          <ArrowDownUp className="size-3.5 text-muted-foreground" />
          <Select value={sort} onValueChange={(v) => onSortChange(v as BoardSort)}>
            <SelectTrigger size="sm" className="h-7 w-28 text-xs" aria-label="列内排序"><SelectValue /></SelectTrigger>
            <SelectContent align="end">
              {BOARD_SORTS.map((s) => <SelectItem key={s} value={s} className="text-xs">{SORT_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default BoardToolbar;
