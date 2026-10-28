import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { searchTasks, type SearchHit } from '@/api/search';
import StatusChip from '@/components/StatusChip';
import { isTaskId } from '@/features/tasks/status';
import { paths } from '@/routes/paths';

const GlobalSearch = () => {
  const navigate = useNavigate(); const [open, setOpen] = useState(false); const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]); const [loading, setLoading] = useState(false); const seq = useRef(0);
  useEffect(() => {
    const q = input.trim(); if (!q || isTaskId(q)) return; const mine = ++seq.current; const t = setTimeout(async () => {
      setLoading(true); try { const res = await searchTasks(q, { limit: 8 }); if (mine === seq.current) setHits(res); } catch { if (mine === seq.current) setHits([]); } finally { if (mine === seq.current) setLoading(false); }
    }, 300); return () => clearTimeout(t);
  }, [input]);
  const go = (hit: SearchHit) => { navigate(paths.task(hit.task.id)); setInput(''); setHits([]); setOpen(false); };
  const options = useMemo(() => hits, [hits]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button aria-label="搜索任务" className="flex h-9 w-40 items-center gap-2 rounded-md bg-white/15 px-3 text-sm text-white transition hover:bg-white/25 sm:w-72 dark:bg-white/10"><Search className="size-4 opacity-80" /><span className="truncate">{input || '搜索任务…'}</span></button></PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,28rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={input} onValueChange={(v) => { setInput(v); if (!v.trim() || isTaskId(v.trim())) { seq.current++; setHits([]); } }} placeholder="搜索任务，或输入 ID 如 BOS-12" />
          <CommandList>
            {options.length === 0 && <CommandEmpty>{loading ? '搜索中…' : input.trim() ? '没有匹配的任务' : '输入关键字或任务 ID'}</CommandEmpty>}
            <CommandGroup>
              {options.map((hit) => (<CommandItem key={hit.task.id} value={hit.task.id} onSelect={() => go(hit)} className="gap-2 py-2">
                <span className="rounded border px-1.5 py-0.5 font-mono text-xs font-bold">{hit.task.id}</span><span className="min-w-0 flex-1 truncate font-medium">{hit.task.title}</span><StatusChip status={hit.task.status} />
                {hit.feedback && <span className="w-full truncate text-xs text-muted-foreground">{hit.feedback.author} 的反馈：{hit.feedback.snippet}</span>}
              </CommandItem>))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
export default GlobalSearch;
