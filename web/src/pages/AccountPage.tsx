import { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { rotateKey, revokeKey, useKeys, useMe, type ApiKey, type CreatedApiKey } from '@/api/auth';
import { ActorAvatar } from '@/components/ActorChip';
import ConfirmDialog from '@/components/ConfirmDialog';
import CreatedKeyDialog from '@/features/account/CreatedKeyDialog';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import { useApiError } from '@/components/useApiError';
import KeyFormPanel from '@/features/account/KeyFormPanel';
import PasswordPanel from '@/features/account/PasswordPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const AccountPage = () => {
  const { data: me } = useMe();
  const { data: keysData } = useKeys();
  const [creating, setCreating] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [rotating, setRotating] = useState<ApiKey | null>(null);
  const [rotatedKey, setRotatedKey] = useState<CreatedApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const keys = keysData?.keys ?? [];

  const doRevoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeKey(revoking.id);
      enqueueSnackbar('已撤销', { variant: 'success' });
      setRevoking(null);
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const doRotate = async () => {
    if (!rotating) return;
    setBusy(true);
    try {
      setRotatedKey(await rotateKey(rotating.id));
      setRotating(null);
      enqueueSnackbar('已轮换，旧 key 已失效', { variant: 'success' });
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  if (!me) return null;
  const { user, org } = me;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">账户</h1>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <ActorAvatar name={user.name} kind="human" size={48} />
            <div className="min-w-52 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{user.name}</h2>
                <SoftChip tone={user.role === 'admin' ? 'primary' : 'default'} label={user.role === 'admin' ? '管理员' : '成员'} />
              </div>
              <p className="text-sm text-muted-foreground">{user.email} · {org.name}</p>
            </div>
            <Button variant="outline" onClick={() => setChangingPw(true)}>修改密码</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            显示名是你在任务历史 / Feedback 里的署名，由组织管理员修改。
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <KeyRound className="size-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">API Key</h2>
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)}><Plus className="size-4" />新建 Key</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        给 Agent（Claude Code 等）连 MCP 用：<code>Authorization: Bearer &lt;key&gt;</code>。Key 代表你本人，只能看到本组织的项目。
      </p>

      <Card className="py-0">
        {keys.length === 0 ? (
          <CardContent className="py-6 text-muted-foreground">还没有 key。</CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名字</TableHead>
                <TableHead>前缀</TableHead>
                <TableHead>权限</TableHead>
                <TableHead>创建</TableHead>
                <TableHead>最近使用</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id} className={k.status === 'revoked' ? 'opacity-50' : undefined}>
                  <TableCell>{k.name}</TableCell>
                  <TableCell><code>{k.prefix}…</code></TableCell>
                  <TableCell>
                    <div className="flex max-w-64 flex-wrap gap-1">
                      {(k.scopes ?? ['*']).map((scope) => (
                        <SoftChip key={scope} label={scope === '*' ? 'legacy 全量' : scope} />
                      ))}
                      {k.project_keys?.length ? <SoftChip label={`${k.project_keys.length} 项目`} /> : null}
                    </div>
                  </TableCell>
                  <TableCell><RelativeTime value={k.created_at} /></TableCell>
                  <TableCell>
                    {k.last_used_at ? <RelativeTime value={k.last_used_at} /> : <span className="text-xs text-muted-foreground">从未</span>}
                  </TableCell>
                  <TableCell>
                    <SoftChip tone={k.status === 'active' ? 'success' : 'default'} label={k.status === 'active' ? '有效' : '已撤销'} />
                  </TableCell>
                  <TableCell className="text-right">
                    {k.status === 'active' && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setRotating(k)}>轮换</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRevoking(k)}>撤销</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
      <ConfirmDialog
        open={!!rotating}
        title="轮换这把 key？"
        message={<>将生成新秘密值，旧 key 会立刻失效；权限和项目范围保持不变。<br /><code>{rotating?.prefix}…</code>（{rotating?.name}）</>}
        confirmText="轮换"
        busy={busy}
        onConfirm={doRotate}
        onClose={() => setRotating(null)}
      />
      {rotatedKey && (
        <CreatedKeyDialog
          apiKey={rotatedKey}
          title={`Key「${rotatedKey.name}」已轮换`}
          onClose={() => setRotatedKey(null)}
        />
      )}
    </div>
  );
};

export default AccountPage;
