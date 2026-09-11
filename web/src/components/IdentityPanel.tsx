import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { setActor, useActor } from '@/api/identity';
import SidePanel from '@/components/SidePanel';

// 顶栏「我是谁」：设置前端写操作用的名字（人）
const IdentityPanel = ({ onClose }: { onClose: () => void }) => {
  const current = useActor();
  const [name, setName] = useState(current);
  const save = () => { setActor(name); onClose(); };
  return (
    <SidePanel
      title="我是谁"
      onClose={onClose}
      actions={<><Button onClick={onClose}>取消</Button><Button variant="contained" onClick={save} disabled={!name.trim()}>保存</Button></>}
    >
      <Stack spacing={2}>
        <TextField label="名字" value={name} onChange={(e) => setName(e.target.value)} autoFocus helperText="在浏览器里操作时用这个名字记录（创建者 / 执行人 / Feedback 作者）；存在本机浏览器里" onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <Alert severity="info">Agent 不在这里设：它们在 MCP 会话开始时调 <code>identify(name, kind, project, worktree)</code>，多个 worktree 各用不同的名字。</Alert>
        <Typography variant="caption" color="text.secondary">这不是登录，只是给记录署名。</Typography>
      </Stack>
    </SidePanel>
  );
};

export default IdentityPanel;
