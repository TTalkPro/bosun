import { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import { useSnackbar } from 'notistack';
import { Navigate } from 'react-router';
import { updateOrg, useMe, useUsers, type User } from '@/api/auth';
import { ActorAvatar } from '@/components/ActorChip';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import { useApiError } from '@/components/useApiError';
import UserFormPanel from '@/features/org/UserFormPanel';
import { paths } from '@/routes/paths';

// 组织管理（admin）：组织名、用户表
const OrgPage = () => {
  const { data: me } = useMe();
  const { data: usersData } = useUsers(me?.user.role === 'admin');
  const [orgName, setOrgName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  if (!me) return null;
  if (me.user.role !== 'admin') return <Navigate to={paths.projects} replace />;
  const users = usersData?.users ?? [];
  const nameValue = orgName ?? me.org.name;

  const saveOrg = async () => {
    if (!nameValue.trim() || nameValue.trim() === me.org.name) { setOrgName(null); return; }
    setBusy(true);
    try { await updateOrg({ name: nameValue.trim() }); enqueueSnackbar('组织名已更新', { variant: 'success' }); setOrgName(null); } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>组织</Typography>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
            <TextField label="组织名" value={nameValue} onChange={(e) => setOrgName(e.target.value)} size="small" sx={{ minWidth: 260 }} onKeyDown={(e) => { if (e.key === 'Enter') saveOrg(); }} />
            <Button variant="outlined" onClick={saveOrg} disabled={busy || orgName === null || !nameValue.trim()}>保存</Button>
            <Typography variant="body2" color="text.secondary">id {me.org.id} · 创建于 <RelativeTime value={me.org.created_at} /></Typography>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.5 }}>
        <Typography variant="h6">用户</Typography>
        <Chip size="small" label={users.length} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>新建用户</Button>
      </Stack>
      <Card variant="outlined">
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>用户</TableCell><TableCell>邮箱</TableCell><TableCell>角色</TableCell><TableCell>状态</TableCell><TableCell>最近登录</TableCell><TableCell align="right" /></TableRow></TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} sx={{ opacity: u.status === 'disabled' ? 0.5 : 1 }}>
                  <TableCell><Stack direction="row" spacing={1} alignItems="center"><ActorAvatar name={u.name} kind="human" size={24} /><span>{u.name}</span>{u.id === me.user.id && <Typography variant="caption" color="text.secondary">（我）</Typography>}</Stack></TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><SoftChip label={u.role === 'admin' ? '管理员' : '成员'} tone={u.role === 'admin' ? 'primary' : 'default'} /></TableCell>
                  <TableCell>{u.status === 'active' ? <Chip size="small" color="success" variant="outlined" label="启用" /> : <Chip size="small" variant="outlined" label="已停用" />}</TableCell>
                  <TableCell>{u.last_login_at ? <RelativeTime value={u.last_login_at} /> : <Typography variant="caption" color="text.secondary">从未</Typography>}</TableCell>
                  <TableCell align="right"><Tooltip title="编辑"><IconButton size="small" onClick={() => setEditing(u)}><EditIcon fontSize="small" /></IconButton></Tooltip></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Card>

      {creating && <UserFormPanel onClose={() => setCreating(false)} />}
      {editing && <UserFormPanel user={editing} onClose={() => setEditing(null)} />}
    </Box>
  );
};

export default OrgPage;
