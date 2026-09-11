import { Avatar, Stack, Tooltip, Typography } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { useActorKinds } from '@/api/identity';

type Kind = 'human' | 'agent';

// 操作者：人形 / 机器人图标 + 名字。kind 优先用调用方给的（任务 JSON 里有），否则查 actors 表
export const ActorAvatar = ({ name, kind, size = 24 }: { name: string; kind?: Kind | null; size?: number }) => {
  const kinds = useActorKinds();
  const k: Kind = kind ?? kinds[name] ?? (name === 'user' ? 'human' : 'agent');
  return (
    <Tooltip title={k === 'human' ? `${name}（人）` : `${name}（Agent）`}>
      <Avatar sx={{ width: size, height: size, bgcolor: k === 'human' ? 'secondary.main' : 'primary.main', '& svg': { fontSize: size * 0.65 } }}>
        {k === 'human' ? <PersonOutlineIcon /> : <SmartToyOutlinedIcon />}
      </Avatar>
    </Tooltip>
  );
};

const ActorChip = ({ name, kind, size = 20 }: { name: string; kind?: Kind | null; size?: number }) => (
  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
    <ActorAvatar name={name} kind={kind} size={size} />
    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{name}</Typography>
  </Stack>
);

export default ActorChip;
