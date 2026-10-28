import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { Navigate } from 'react-router';
import { updateOrg, useMe, useUsers, type User } from '@/api/auth';
import { ActorAvatar } from '@/components/ActorChip';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">组织</h1>
      <Card className="mb-6 gap-2 border py-4">
        <CardContent className="px-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-64">
              <label htmlFor="org-name" className="mb-1 block text-sm font-medium">组织名</label>
              <Input id="org-name" value={nameValue} onChange={(e) => setOrgName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveOrg(); }} />
            </div>
            <Button variant="outline" className="self-end" onClick={saveOrg} disabled={busy || orgName === null || !nameValue.trim()}>保存</Button>
            <p className="text-sm text-muted-foreground">id {me.org.id} · 创建于 <RelativeTime value={me.org.created_at} /></p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-lg font-semibold">用户</h2>
        <Badge variant="secondary">{users.length}</Badge>
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)}><Plus />新建用户</Button>
      </div>
      <Card className="gap-0 border py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>用户</TableHead><TableHead>邮箱</TableHead><TableHead>角色</TableHead><TableHead>状态</TableHead><TableHead>最近登录</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={u.status === 'disabled' ? 'opacity-50' : undefined}>
                  <TableCell><div className="flex items-center gap-2"><ActorAvatar name={u.name} kind="human" size={24} /><span>{u.name}</span>{u.id === me.user.id && <span className="text-xs text-muted-foreground">（我）</span>}</div></TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><SoftChip label={u.role === 'admin' ? '管理员' : '成员'} tone={u.role === 'admin' ? 'primary' : 'default'} /></TableCell>
                  <TableCell>{u.status === 'active' ? <Badge variant="outline" className="border-emerald-600 text-emerald-700 dark:text-emerald-400">启用</Badge> : <Badge variant="outline">已停用</Badge>}</TableCell>
                  <TableCell>{u.last_login_at ? <RelativeTime value={u.last_login_at} /> : <span className="text-xs text-muted-foreground">从未</span>}</TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(u)} aria-label="编辑"><Pencil className="size-4" /></Button></TooltipTrigger>
                      <TooltipContent>编辑</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {creating && <UserFormPanel onClose={() => setCreating(false)} />}
      {editing && <UserFormPanel user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default OrgPage;
