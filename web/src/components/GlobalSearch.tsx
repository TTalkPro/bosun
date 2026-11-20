import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { searchTasks, type SearchHit } from '@/api/search';
import StatusChip from '@/components/StatusChip';
import { isTaskId, normalizeId } from '@/features/tasks/status';
import { paths } from '@/routes/paths';

const GlobalSearch = () => {
  const navigate = useNavigate(); const [open, setOpen] = useState(false); const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]); const [loading, setLoading] = useState(false); const seq = useRef(0);
  useEffect(() => {
    const q = input.trim(); if (!q || isTaskId(q)) return; const mine = ++seq.current; const t = setTimeout(async () => {
      setLoading(true); try { const res = await searchTasks(q, { limit: 8 }); if (mine === seq.current) setHits(res); } catch { if (mine === seq.current) setHits([]); } finally { if (mine === seq.current) setLoading(false); }
    }, 300); return () => clearTimeout(t);
  }, [input]);
  const goTo = (id: string) => { navigate(paths.task(id)); setInput(''); setHits([]); setOpen(false); };
  const go = (hit: SearchHit) => goTo(hit.task.id);
  const options = hits;
  // 输入的就是一个任务 ID：给一条「直接跳转」（占位符就是这么承诺的）
  const directId = isTaskId(input.trim()) ? normalizeId(input.trim()) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button aria-label="搜索任务" className="flex h-9 w-40 items-center gap-2 rounded-md border bg-muted/60 px-3 text-sm text-muted-foreground transition hover:bg-muted sm:w-72"><Search className="size-4 opacity-80" /><span className="truncate">{input || '搜索任务…'}</span></button></PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,28rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={input} onValueChange={(v) => { setInput(v); if (!v.trim() || isTaskId(v.trim())) { seq.current++; setHits([]); setLoading(false); } }} placeholder="搜索任务，或输入 ID 如 BOS-12" />
          <CommandList>
            {directId && <CommandGroup><CommandItem value={`goto-${directId}`} onSelect={() => goTo(directId)} className="gap-2 py-2"><span className="rounded border px-1.5 py-0.5 font-mono text-xs font-bold">{directId}</span><span className="text-muted-foreground">跳转到这个任务</span></CommandItem></CommandGroup>}
            {options.length === 0 && !directId && <CommandEmpty>{loading ? '搜索中…' : input.trim() ? '没有匹配的任务' : '输入关键字或任务 ID'}</CommandEmpty>}
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
