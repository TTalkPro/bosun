import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import AddLinkIcon from '@mui/icons-material/AddLink';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useSnackbar } from 'notistack';
import { removeLink } from '@/api/tasks';
import type { Task, TaskLink } from '@/api/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusChip from '@/components/StatusChip';
import { useApiError } from '@/components/useApiError';
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
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>关联 <Typography component="span" variant="caption" color="text.secondary">({task.links.length})</Typography></Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<AddLinkIcon />} onClick={() => setAdding(true)}>添加</Button>
      </Stack>
      {task.links.length === 0 && <Typography variant="caption" color="text.disabled">没有关联。依赖：对方没做完不能开始；替代：对方由本任务接手。</Typography>}
      <Stack spacing={1.25}>
        {GROUPS.map((g) => {
          const items = task.links.filter(g.match);
          if (!items.length) return null;
          return (
            <Box key={g.key}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{g.title}</Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {items.map((l) => (
                  <Stack key={`${l.type}-${l.direction}-${l.task}`} direction="row" alignItems="center" spacing={1}
                    sx={{ '&:hover .rm': { opacity: 1 }, minWidth: 0 }}>
                    {unmet(l) && <Tooltip title="未完成，阻塞本任务开始"><LockOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></Tooltip>}
                    <Chip size="small" variant="outlined" label={l.task} onClick={() => navigate(paths.task(l.task))}
                      sx={{ fontFamily: '"JetBrains Mono", Menlo, monospace', fontWeight: 700 }} />
                    <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(paths.task(l.task))}>{l.title ?? '（已不存在）'}</Typography>
                    {l.status && <StatusChip status={l.status} />}
                    <Tooltip title="删除关联">
                      <IconButton className="rm" size="small" onClick={() => setRemoving(l)} sx={{ opacity: 0, transition: 'opacity .15s' }}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {adding && <LinkPanel task={task} onClose={() => setAdding(false)} onChanged={onChanged} />}
      <ConfirmDialog
        open={!!removing}
        title="删除关联"
        busy={busy}
        message={removing ? `删除 ${ends(removing)[0]} → ${LINK_TYPE_LABEL[removing.type]} → ${ends(removing)[1]}？双方状态都不会变。` : ''}
        onClose={() => setRemoving(null)}
        onConfirm={doRemove}
      />
    </Paper>
  );
};

export default LinksCard;
