import { useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import KeyIcon from '@mui/icons-material/VpnKeyOutlined';
import { useSnackbar } from 'notistack';
import { revokeKey, useKeys, useMe, type ApiKey } from '@/api/auth';
import { ActorAvatar } from '@/components/ActorChip';
import ConfirmDialog from '@/components/ConfirmDialog';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import { useApiError } from '@/components/useApiError';
import KeyFormPanel from '@/features/account/KeyFormPanel';
import PasswordPanel from '@/features/account/PasswordPanel';

// 账户：自己是谁、改密、API key
const AccountPage = () => {
  const { data: me } = useMe();
  const { data: keysData } = useKeys();
  const [creating, setCreating] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const keys = keysData?.keys ?? [];

  const doRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try { await revokeKey(revoking.id); enqueueSnackbar('已撤销', { variant: 'success' }); setRevoking(null); } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  if (!me) return null;
  const { user, org } = me;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>账户</Typography>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
            <ActorAvatar name={user.name} kind="human" size={48} />
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6">{user.name}</Typography>
                <SoftChip label={user.role === 'admin' ? '管理员' : '成员'} tone={user.role === 'admin' ? 'primary' : 'default'} />
              </Stack>
              <Typography variant="body2" color="text.secondary">{user.email} · {org.name}</Typography>
            </Box>
            <Button variant="outlined" onClick={() => setChangingPw(true)}>修改密码</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            显示名是你在任务历史 / Feedback 里的署名，由组织管理员修改。
          </Typography>
        </CardContent>
      </Card>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.5 }}>
        <KeyIcon color="action" />
        <Typography variant="h6">API Key</Typography>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>新建 Key</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        给 Agent（Claude Code 等）连 MCP 用：<code>Authorization: Bearer &lt;key&gt;</code>。Key 代表你本人，只能看到本组织的项目。
      </Typography>
      <Card variant="outlined">
        {keys.length === 0 ? (
          <CardContent><Typography color="text.secondary">还没有 key。</Typography></CardContent>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>名字</TableCell><TableCell>前缀</TableCell><TableCell>创建</TableCell><TableCell>最近使用</TableCell><TableCell>状态</TableCell><TableCell align="right" /></TableRow></TableHead>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id} sx={{ opacity: k.status === 'revoked' ? 0.5 : 1 }}>
                    <TableCell>{k.name}</TableCell>
                    <TableCell><code>{k.prefix}…</code></TableCell>
                    <TableCell><RelativeTime value={k.created_at} /></TableCell>
                    <TableCell>{k.last_used_at ? <RelativeTime value={k.last_used_at} /> : <Typography variant="caption" color="text.secondary">从未</Typography>}</TableCell>
                    <TableCell>{k.status === 'active' ? <Chip size="small" color="success" variant="outlined" label="有效" /> : <Chip size="small" variant="outlined" label="已撤销" />}</TableCell>
                    <TableCell align="right">{k.status === 'active' && <Button size="small" color="error" onClick={() => setRevoking(k)}>撤销</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      {creating && <KeyFormPanel onClose={() => setCreating(false)} />}
      {changingPw && <PasswordPanel onClose={() => setChangingPw(false)} />}
      <ConfirmDialog
        open={!!revoking}
        title="撤销这把 key？"
        message={<>用它的 Agent 会立刻收到 401，且不可恢复。<br /><code>{revoking?.prefix}…</code>（{revoking?.name}）</>}
        confirmText="撤销"
        danger
        busy={busy}
        onConfirm={doRevoke}
        onClose={() => setRevoking(null)}
      />
    </Box>
  );
};

export default AccountPage;
