import { useEffect, useState } from 'react';
import { Check, Flag, Search } from 'lucide-react';
import type { Status, TaskFilter } from '@/api/types';
import { ALL_STATUSES, STATUS_LABEL } from './status';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  value: TaskFilter;
  onChange: (next: TaskFilter) => void;
}

const activeChip: Record<Status, string> = {
  NEW: 'border-sky-600 bg-sky-500/15 text-sky-700 dark:text-sky-400',
  IN_PROGRESS: 'border-primary bg-primary/12 text-primary dark:text-primary-foreground',
  DONE: 'border-amber-600 bg-amber-500/15 text-amber-700 dark:text-amber-400',
  VERIFIED: 'border-emerald-600 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'border-destructive bg-destructive/12 text-destructive',
  CANCELLED: 'border-muted-foreground bg-muted text-foreground',
};

// 筛选条：状态多选 chip + 一个搜索框（300ms 防抖）。
// 搜索走后端 BM25：标题 ×3、标签 ×8 加权，正文与 Feedback 也在内，所以不再单独有标签过滤。
const TaskFilters = ({ value, onChange }: Props) => {
  const [q, setQ] = useState(value.q ?? '');

  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? '') !== q) onChange({ ...value, q: q || undefined, offset: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const selected = value.status ?? [];
  const toggle = (s: Status) => {
    const next = selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s];
    onChange({ ...value, status: next.length ? next : undefined, offset: 0 });
  };

  return (
    <div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-center">
      <div className="flex flex-wrap gap-1.5">
        {ALL_STATUSES.map((s) => {
          const on = selected.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className={cn('inline-flex h-6.5 items-center gap-1 rounded-full border px-2 text-xs transition',
                on ? cn(activeChip[s], 'font-bold') : 'border-border bg-background font-medium text-muted-foreground hover:bg-accent hover:text-foreground')}
              aria-pressed={on}
            >
              {on && <Check className="size-3" />}
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
      <div className="inline-flex rounded-md border p-0.5">
        {(['all', 'task', 'epic'] as const).map((item) => {
          const active = (value.kind ?? 'all') === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange({ ...value, kind: item === 'all' ? undefined : item, offset: 0 })}
              className={cn('inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs font-medium',
                active ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
            >
              {item === 'epic' && <Flag className="size-3.5" />}
              {item === 'all' ? '全部' : item === 'task' ? '任务' : 'Epic'}
            </button>
          );
        })}
      </div>
      <div className="relative w-full md:ml-auto md:w-90">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-8"
          placeholder="搜索：标题 / 标签 / 正文 / 反馈 / ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
    </div>
  );
};

export default TaskFilters;
