import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Link2, Lock, X } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { removeLink } from '@/api/tasks';
import type { Task, TaskLink } from '@/api/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusChip from '@/components/StatusChip';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { paths } from '@/routes/paths';
import LinkPanel from './LinkPanel';
import { LINK_TYPE_LABEL } from './linkTypes';

interface Props {
  task: Task;
  onChanged?: (t: Task) => void;
}

const GROUPS: { key: string; title: string; match: (l: TaskLink) => boolean }[] = [
  { key: 'dep', title: '依赖', match: (l) => l.type === 'depends_on' && l.direction === 'out' },
  { key: 'blocks', title: '被依赖', match: (l) => l.type === 'depends_on' && l.direction === 'in' },
  { key: 'rep', title: '替代', match: (l) => l.type === 'replaces' && l.direction === 'out' },
  { key: 'repby', title: '被替代', match: (l) => l.type === 'replaces' && l.direction === 'in' },
];

const unmet = (l: TaskLink) => l.type === 'depends_on' && l.direction === 'out' && l.status !== 'DONE' && l.status !== 'VERIFIED';

// 关联卡片：按 依赖 / 被依赖 / 替代 / 被替代 分组；两端都能删（删的是同一条链）
const LinksCard = ({ task, onChanged }: Props) => {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TaskLink | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const ends = (l: TaskLink) => (l.direction === 'out' ? [task.id, l.task] : [l.task, task.id]);

  const doRemove = async () => {
    if (!removing) return;
    const [from, to] = ends(removing);
    setBusy(true);
    try {
      await removeLink(from, to, removing.type);
      enqueueSnackbar('关联已删除', { variant: 'success' });
      onChanged?.({ ...task, links: task.links.filter((l) => l !== removing) });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <Card className="gap-3 p-4 py-4">
      <div className="flex items-center">
        <h3 className="text-base font-semibold">关联 <span className="text-xs text-muted-foreground">({task.links.length})</span></h3>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setAdding(true)}><Link2 />添加</Button>
      </div>
      {task.links.length === 0 && <p className="text-xs text-muted-foreground/70">没有关联。依赖：对方没做完不能开始；替代：对方由本任务接手。</p>}
      <div className="space-y-3">
        {GROUPS.map((g) => {
          const items = task.links.filter(g.match);
          if (!items.length) return null;
          return (
            <div key={g.key}>
              <p className="text-xs font-semibold text-muted-foreground">{g.title}</p>
              <div className="mt-1.5 space-y-1.5">
                {items.map((l) => (
                  <div key={`${l.type}-${l.direction}-${l.task}`} className="group flex min-w-0 items-center gap-2">
                    {unmet(l) && (
                      <Tooltip>
                        <TooltipTrigger asChild><Lock className="size-4 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent>未完成，阻塞本任务开始</TooltipContent>
                      </Tooltip>
                    )}
                    <Badge variant="outline" className="cursor-pointer font-mono font-bold" onClick={() => navigate(paths.task(l.task))}>{l.task}</Badge>
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => navigate(paths.task(l.task))}>{l.title ?? '（已不存在）'}</button>
                    {l.status && <StatusChip status={l.status} />}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 opacity-0 transition group-hover:opacity-100" onClick={() => setRemoving(l)} aria-label="删除关联"><X className="size-4" /></Button>
                      </TooltipTrigger>
                      <TooltipContent>删除关联</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {adding && <LinkPanel task={task} onClose={() => setAdding(false)} onChanged={onChanged} />}
      <ConfirmDialog
        open={!!removing}
        title="删除关联"
        busy={busy}
        message={removing ? `删除 ${ends(removing)[0]} → ${LINK_TYPE_LABEL[removing.type]} → ${ends(removing)[1]}？双方状态都不会变。` : ''}
        onClose={() => setRemoving(null)}
        onConfirm={doRemove}
      />
    </Card>
  );
};

export default LinksCard;
