import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CirclePlus, Flag, Search, X } from 'lucide-react';
import type { Status, TaskFilter } from '@/api/types';
import { ALL_STATUSES, STATUS_LABEL } from './status';
import { StatusIcon } from './StatusIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Props {
  value: TaskFilter;
  onChange: (next: TaskFilter) => void;
  /** 工具条右侧（视图切换等） */
  extra?: ReactNode;
  /** 紧跟在「状态」后面的额外分面（列表视图的执行人 / 优先级 / 需要关注） */
  facets?: ReactNode;
  /** 这些分面有没有生效、怎么清：「重置」一并处理 */
  facetsActive?: boolean;
  onResetFacets?: () => void;
}

// 工具条（参照 shadcn tasks 示例）：搜索框（300ms 防抖）+ 状态多选面板 + 类型切换 + 重置。
// 搜索走后端 BM25：标题 ×3、标签 ×8 加权，正文与 Feedback 也在内，所以不再单独有标签过滤。
const TaskFilters = ({ value, onChange, extra, facets, facetsActive, onResetFacets }: Props) => {
  const [q, setQ] = useState(value.q ?? '');
  // sent：自己最近一次发出去的 q；seenQ：上次渲染看到的外部 q
  const [sent, setSent] = useState(value.q ?? '');
  const [seenQ, setSeenQ] = useState(value.q ?? '');
  // 防抖回调里要用**最新**的筛选值：打字后 300ms 内点了状态 chip，不能拿旧的 value 把它盖回去
  const latest = useRef({ value, onChange });
  useEffect(() => { latest.current = { value, onChange }; });

  useEffect(() => {
    const t = setTimeout(() => {
      const { value: v, onChange: change } = latest.current;
      if ((v.q ?? '') !== q) { setSent(q); change({ ...v, q: q || undefined, offset: 0 }); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // 外面把 q 改了（切项目、浏览器前进后退）：搜索框跟上。自己刚发出去的那次不算，
  // 免得回声把这 300ms 里接着打的字冲掉
  if ((value.q ?? '') !== seenQ) {
    setSeenQ(value.q ?? '');
    if ((value.q ?? '') !== sent) { setQ(value.q ?? ''); setSent(value.q ?? ''); }
  }

  const selected = value.status ?? [];
  const toggle = (s: Status) => {
    const next = selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s];
    onChange({ ...value, status: next.length ? next : undefined, offset: 0 });
  };

  const dirty = selected.length > 0 || !!value.kind || !!value.q || !!facetsActive;
  const reset = () => { setQ(''); setSent(''); onResetFacets?.(); onChange({ ...value, status: undefined, kind: undefined, q: undefined, offset: 0 }); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-8"
          placeholder="搜索标题 / 标签 / 正文 / 反馈 / ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 border-dashed">
            <CirclePlus />状态
            {selected.length > 0 && (
              <>
                <Separator orientation="vertical" className="mx-0.5 !h-4" />
                {selected.length > 2
                  ? <span className="rounded-sm bg-secondary px-1 text-xs font-normal">已选 {selected.length}</span>
                  : ALL_STATUSES.filter((s) => selected.includes(s)).map((s) => <span key={s} className="rounded-sm bg-secondary px-1 text-xs font-normal">{STATUS_LABEL[s]}</span>)}
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1">
          {ALL_STATUSES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox checked={selected.includes(s)} onCheckedChange={() => toggle(s)} />
              <StatusIcon status={s} />
              {STATUS_LABEL[s]}
            </label>
          ))}
          {selected.length > 0 && (
            <>
              <Separator className="my-1" />
              <button type="button" className="w-full rounded-sm px-2 py-1.5 text-center text-sm hover:bg-accent" onClick={() => onChange({ ...value, status: undefined, offset: 0 })}>清除状态</button>
            </>
          )}
        </PopoverContent>
      </Popover>
      {facets}
      <div className="inline-flex h-8 items-center rounded-md border p-0.5">
        {(['all', 'task', 'epic'] as const).map((item) => {
          const active = (value.kind ?? 'all') === item;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...value, kind: item === 'all' ? undefined : item, offset: 0 })}
              className={cn('inline-flex h-6.5 items-center gap-1 rounded-sm px-2.5 text-xs font-medium transition-colors',
                active ? 'bg-secondary text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              {item === 'epic' && <Flag className="size-3.5" />}
              {item === 'all' ? '全部' : item === 'task' ? '任务' : 'Epic'}
            </button>
          );
        })}
      </div>
      {dirty && <Button variant="ghost" size="sm" className="h-8 px-2" onClick={reset}>重置<X /></Button>}
      {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
    </div>
  );
};

export default TaskFilters;
