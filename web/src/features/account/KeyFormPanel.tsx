import { useState } from 'react';
import { Alert, Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSnackbar } from 'notistack';
import { createKey, type CreatedApiKey } from '@/api/auth';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';

// 新建 API key：成功后整串只在这里显示一次
const KeyFormPanel = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const submit = async () => {
    setBusy(true);
    try { setCreated(await createKey(name.trim())); } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.key); enqueueSnackbar('已复制', { variant: 'success' }); } catch { enqueueSnackbar('复制失败，请手动选中复制', { variant: 'warning' }); }
  };

  return (
    <SidePanel
      title={created ? `Key「${created.name}」已创建` : '新建 API Key'}
      onClose={onClose}
      busy={busy}
      actions={created
        ? <Button variant="contained" onClick={onClose}>我已保存，关闭</Button>
        : <><Button onClick={onClose} disabled={busy}>取消</Button><Button variant="contained" onClick={submit} disabled={busy}>创建</Button></>}
    >
      {created ? (
        <Stack spacing={2}>
          <Alert severity="warning">这串 key <strong>只显示这一次</strong>，关掉就再也看不到了；丢了就撤销重建。</Alert>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 14, wordBreak: 'break-all' }}>
            <Box component="code" sx={{ flex: 1 }} data-testid="new-key">{created.key}</Box>
            <Tooltip title="复制"><IconButton onClick={copy} size="small"><ContentCopyIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
          <Typography variant="body2" color="text.secondary">给 Claude Code 用：</Typography>
          <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontSize: 12, overflowX: 'auto' }}>
{`export BOSUN_API_KEY=${created.key}
claude mcp add --transport http bosun ${window.location.origin}/mcp \\
  --header "Authorization: Bearer \${BOSUN_API_KEY}"`}
          </Box>
          <Typography variant="body2" color="text.secondary">Agent 连上后仍要先 <code>identify(name, kind, project)</code> 报个名字；写操作署这个名字，记在你的账号下。</Typography>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <TextField label="名字" value={name} onChange={(e) => setName(e.target.value)} helperText="给自己看的备注，比如「笔记本 claude code」；留空为 default" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          <Alert severity="info">Key 代表你本人：Agent 用它访问 MCP 时只能看到你所在组织的项目，写操作记在你的账号下。</Alert>
        </Stack>
      )}
    </SidePanel>
  );
};

export default KeyFormPanel;
