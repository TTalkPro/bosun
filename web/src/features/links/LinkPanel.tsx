import { useEffect, useRef, useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { searchTasks, type SearchHit } from '@/api/search';
import { addLink } from '@/api/tasks';
import type { LinkType, Task } from '@/api/types';
import SidePanel from '@/components/SidePanel';
import StatusChip from '@/components/StatusChip';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isTaskId, normalizeId } from '@/features/tasks/status';
import { LINK_TYPE_LABEL } from './linkTypes';

interface Props {
  task: Task;
  onClose: () => void;
  onChanged?: (t: Task) => void;
}

const TYPES: { value: LinkType; label: string }[] = [
  { value: 'depends_on', label: '依赖' },
  { value: 'replaces', label: '替代' },
];

// 添加关联：类型 + 跨项目任务搜索（也可直接输 ID）
const LinkPanel = ({ task, onClose, onChanged }: Props) => {
  const [type, setType] = useState<LinkType>('depends_on');
  const [input, setInput] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  useEffect(() => {
    const q = input.trim();
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      if (!q) { setHits([]); return; }
      try {
        const res = await searchTasks(q, { limit: 10 });
        if (mine === seq.current) setHits(res.filter((h) => h.task.id !== task.id));
      } catch {
        if (mine === seq.current) setHits([]);
      }
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [input, task.id]);

  const targetId = picked?.task.id ?? (isTaskId(input) ? normalizeId(input) : '');

  const submit = async () => {
    if (!targetId) { enqueueSnackbar('选一个任务，或输入任务 ID', { variant: 'warning' }); return; }
    setBusy(true);
    try {
      const t = await addLink(task.id, targetId, type);
      const other = t.links.find((l) => l.direction === 'out' && l.type === type && l.task === targetId);
      enqueueSnackbar(
        type === 'replaces' && other?.status === 'CANCELLED' ? `已替代 ${targetId}，它已自动撤销` : `${task.id} ${LINK_TYPE_LABEL[type]} ${targetId}`,
        { variant: 'success' },
      );
      onChanged?.(t);
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel size="md"
      title={`添加关联 · ${task.id}`}
      onClose={onClose}
      busy={busy}
      actions={<><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={submit} disabled={busy || !targetId}>添加</Button></>}
    >
      <div className="space-y-4">
        <div className="inline-flex overflow-hidden rounded-md border">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn('px-4 py-1.5 text-sm hover:bg-accent', type === t.value && 'bg-accent font-medium')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          {type === 'depends_on' ? (
            <><b>{task.id}</b> 依赖目标任务：目标没到「已完成 / 已验收」之前，本任务不能开始（显示为被阻塞）。不允许成环。</>
          ) : (
            <><b>{task.id}</b> 替代目标任务：目标若还在「新建 / 进行中」会自动撤销，历史里记「replaced by {task.id}」。</>
          )}
        </div>

        <div>
          <label htmlFor="link-target" className="mb-2 block text-sm font-medium">目标任务</label>
          <Input
            id="link-target"
            autoFocus
            value={input}
            onChange={(e) => { setInput(e.target.value); if (picked && e.target.value !== `${picked.task.id} ${picked.task.title}`) setPicked(null); }}
            placeholder="搜索标题，或输入 KEEL-7"
          />
          {input.trim() && !picked && (
            <div className="mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover">
              {hits.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {isTaskId(input.trim()) ? `直接使用 ${normalizeId(input)}` : input.trim() ? '没有匹配' : '输入标题关键字或任务 ID'}
                </p>
              ) : hits.map((h) => (
                <button
                  key={h.task.id}
                  type="button"
                  onClick={() => { setPicked(h); setInput(`${h.task.id} ${h.task.title}`); }}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="font-mono text-sm font-bold">{h.task.id}</span>
                  <span className="min-w-0 flex-1 truncate">{h.task.title}</span>
                  <StatusChip status={h.task.status} />
                </button>
              ))}
            </div>
          )}
        </div>

        {targetId && (
          <p className="text-xs text-muted-foreground">将建立：{task.id} → {LINK_TYPE_LABEL[type]} → {targetId}</p>
        )}
      </div>
    </SidePanel>
  );
};

export default LinkPanel;
