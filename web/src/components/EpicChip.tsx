import { useNavigate } from 'react-router';
import { Chip, Tooltip } from '@mui/material';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { paths } from '@/routes/paths';

// 所属 Epic 小 chip：点击跳到 Epic 页
const EpicChip = ({ id, title, size = 'small' }: { id: string; title?: string | null; size?: 'small' | 'medium' }) => {
  const navigate = useNavigate();
  return (
    <Tooltip title={title ? `Epic · ${title}` : 'Epic'}>
      <Chip size={size} icon={<FlagOutlinedIcon />} label={title ? `${id} · ${title}` : id} variant="outlined" color="secondary"
        onClick={(e) => { e.stopPropagation(); navigate(paths.task(id)); }}
        sx={{ maxWidth: 260, fontFamily: title ? undefined : '"JetBrains Mono", Menlo, monospace' }} />
    </Tooltip>
  );
};

export default EpicChip;
