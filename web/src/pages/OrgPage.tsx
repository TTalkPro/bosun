import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import dayjs from 'dayjs';
import { Bot, Check, Copy, Plus, Search, ShieldCheck, UserCheck, UserX, Users, type LucideIcon } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { updateOrg, useMe, useUsers, type User } from '@/api/auth';
import { useActors } from '@/api/identity';
import { ActorAvatar } from '@/components/ActorChip';
import RelativeTime from '@/components/RelativeTime';
import Section from '@/components/Section';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import StatCard from '@/features/dashboard/StatCard';
import UserFormPanel from '@/features/org/UserFormPanel';
import TeamLoad from '@/features/org/TeamLoad';
import { openTasksQuery } from '@/features/org/queries';
import UserRowMenu from '@/features/org/UserRowMenu';
import { useStats } from '@/api/stats';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';

type RoleFilter = 'all' | 'admin' | 'member' | 'disabled';
const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'admin', label: '管理员' },
  { key: 'member', label: '成员' },
  { key: 'disabled', label: '已停用' },
];

const InfoRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-h-12 items-center gap-3 px-5 py-2.5">
    <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
    <dd className="flex min-w-0 flex-1 items-center gap-2">{children}</dd>
  </div>
);

const CopyId = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip><TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="复制组织 id"
        onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </TooltipTrigger><TooltipContent>{copied ? '已复制' : '复制'}</TooltipContent></Tooltip>
  );
};

const RoleBadge = ({ role }: { role: User['role'] }) => (
  <Badge variant={role === 'admin' ? 'default' : 'secondary'} className="font-normal">
    {role === 'admin' && <ShieldCheck />}{role === 'admin' ? '管理员' : '成员'}
  </Badge>
);

// 某人手上的未结任务数，点进去是对应的 BQL 查询；0 显示成淡色的 0
const OpenCount = ({ name, n }: { name: string; n: number | undefined }) =>
  n ? <Link to={openTasksQuery(name)} className="font-medium tabular-nums text-primary hover:underline" title={`查看 ${name} 的未结任务`}>{n}</Link>
    : <span className="tabular-nums text-muted-foreground/60">0</span>;

// 组织管理（admin，参照 dashboard 的 Users / Team 页）：统计卡片、组织信息、用户表（搜索 + 角色筛选）、Agent 列表
const OrgPage = () => {
  const { data: me } = useMe();
  const isAdmin = me?.user.role === 'admin';
  const { data: usersData } = useUsers(isAdmin);
  const { data: actorsData } = useActors();
  const { data: stats } = useStats(1);
  const openBy = stats?.totals.open_by_assignee ?? {};
  const [orgName, setOrgName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const users = useMemo(() => usersData?.users ?? [], [usersData]);
  const agents = useMemo(() => (actorsData?.actors ?? []).filter((a) => a.kind === 'agent'), [actorsData]);
  // 执行人是人还是 Agent：用户名单里有的就是人，其余按 /actors 的登记
  const kindOf = useMemo<Record<string, 'human' | 'agent'>>(() => ({
    ...Object.fromEntries((actorsData?.actors ?? []).map((a) => [a.name, a.kind])),
    ...Object.fromEntries((usersData?.users ?? []).map((u) => [u.name, 'human' as const])),
  }), [actorsData, usersData]);
  const userName = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) =>
      (roleFilter === 'all' || (roleFilter === 'disabled' ? u.status === 'disabled' : u.role === roleFilter && u.status === 'active'))
      && (!needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)));
  }, [users, q, roleFilter]);

  if (!me) return null;
  if (!isAdmin) return <Navigate to={paths.projects} replace />;
  const nameValue = orgName ?? me.org.name;
  const weekAgo = dayjs().subtract(7, 'day');
  const activeUsers = users.filter((u) => u.status === 'active');
  const recentLogins = users.filter((u) => u.last_login_at && dayjs(u.last_login_at).isAfter(weekAgo)).length;
  const recentAgents = agents.filter((a) => dayjs(a.last_seen).isAfter(weekAgo)).length;
  const counts: Record<RoleFilter, number> = {
    all: users.length,
    admin: activeUsers.filter((u) => u.role === 'admin').length,
    member: activeUsers.filter((u) => u.role === 'member').length,
    disabled: users.length - activeUsers.length,
  };

  const saveOrg = async () => {
    if (!nameValue.trim() || nameValue.trim() === me.org.name) { setOrgName(null); return; }
    setBusy(true);
    try { await updateOrg({ name: nameValue.trim() }); enqueueSnackbar('组织名已更新', { variant: 'success' }); setOrgName(null); } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const stat = (label: string, icon: LucideIcon, value: number | undefined, footer: ReactNode) => (
    <StatCard label={label} icon={icon} value={value} footer={footer} />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">组织与用户</h1>
          <p className="mt-1 text-sm text-muted-foreground">{me.org.name} 的成员与 Agent。用户的显示名就是他在任务历史里的署名</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus />新建用户</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stat('用户', Users, usersData ? users.length : undefined, usersData && <>启用 <b className="font-medium text-foreground tabular-nums">{activeUsers.length}</b> · 停用 {users.length - activeUsers.length}</>)}
        {stat('管理员', ShieldCheck, usersData ? counts.admin : undefined, '可管理成员、导入导出数据')}
        {stat('近 7 天登录', UserCheck, usersData ? recentLogins : undefined, usersData && <>{activeUsers.length ? Math.round((recentLogins / activeUsers.length) * 100) : 0}% 的启用用户</>)}
        {stat('Agent', Bot, actorsData ? agents.length : undefined, actorsData && <>近 7 天活跃 <b className="font-medium text-foreground tabular-nums">{recentAgents}</b> 个</>)}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-1">
        <Section title="组织信息" bodyClassName="p-0">
          <dl className="divide-y text-sm">
            <InfoRow label="组织名">
              <Input id="org-name" aria-label="组织名" className="h-8" value={nameValue} onChange={(e) => setOrgName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveOrg(); if (e.key === 'Escape') setOrgName(null); }} />
              {orgName !== null && orgName !== me.org.name && (
                <Button size="sm" className="h-8" onClick={saveOrg} disabled={busy || !nameValue.trim()}>保存</Button>
              )}
            </InfoRow>
            <InfoRow label="ID"><code className="font-mono text-xs">{me.org.id}</code><CopyId value={me.org.id} /></InfoRow>
            <InfoRow label="创建于"><RelativeTime value={me.org.created_at} className="text-sm text-foreground" /></InfoRow>
            <InfoRow label="我的身份"><RoleBadge role={me.user.role} /></InfoRow>
          </dl>
        </Section>
        <TeamLoad open={stats?.totals.open_by_assignee} unassigned={stats?.totals.open_unassigned} kindOf={kindOf} />
        </div>

        <Section
          title="用户"
          count={users.length}
          className="xl:col-span-2"
          bodyClassName="p-0"
          action={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-7 w-48 pl-7 text-xs" placeholder="搜索名字 / 邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          }
        >
          <div className="flex flex-wrap gap-1 border-b px-5 py-2">
            {ROLE_FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={roleFilter === f.key} onClick={() => setRoleFilter(f.key)}
                className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                  roleFilter === f.key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {f.label}<span className="tabular-nums text-muted-foreground">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">用户</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>负责未结</TableHead>
                  <TableHead>最近登录</TableHead>
                  <TableHead>加入</TableHead>
                  <TableHead className="w-12 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((u) => (
                  <TableRow key={u.id} className={u.status === 'disabled' ? 'opacity-55' : undefined}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-2.5">
                        <ActorAvatar name={u.name} kind="human" size={32} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium">{u.name}{u.id === me.user.id && <span className="text-xs font-normal text-muted-foreground">（我）</span>}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><RoleBadge role={u.role} /></TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {u.status === 'active'
                          ? <><span className="size-2 rounded-full bg-emerald-500" />启用</>
                          : <><UserX className="size-3.5 text-muted-foreground" />已停用</>}
                      </span>
                    </TableCell>
                    <TableCell><OpenCount name={u.name} n={openBy[u.name]} /></TableCell>
                    <TableCell>{u.last_login_at ? <RelativeTime value={u.last_login_at} /> : <span className="text-xs text-muted-foreground">从未</span>}</TableCell>
                    <TableCell><RelativeTime value={u.created_at} /></TableCell>
                    <TableCell className="pr-5 text-right">
                      <UserRowMenu user={u} isSelf={u.id === me.user.id} onEdit={() => setEditing(u)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {usersData && shown.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">没有符合条件的用户</div>}
          </div>
        </Section>
      </div>

      <Section title="Agent" count={agents.length} description="在本组织里调用过 MCP 的 Agent（按最近出现排序）。Agent 以 API Key 主人的名义工作，Key 在各人的账户页管理" bodyClassName="p-0">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <Bot className="size-6" />
            还没有 Agent 连进来。在账户页建一把 API Key，按页面上的说明配置 MCP 即可。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Agent</TableHead>
                  <TableHead>归属</TableHead>
                  <TableHead>项目 / 工作区</TableHead>
                  <TableHead>负责未结</TableHead>
                  <TableHead>首次出现</TableHead>
                  <TableHead className="pr-5">最近活跃</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((a) => {
                  const recent = dayjs(a.last_seen).isAfter(weekAgo);
                  return (
                    <TableRow key={a.name}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <ActorAvatar name={a.name} kind="agent" size={28} />
                          <span className="font-mono text-sm">{a.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{a.user_id ? (userName[a.user_id] ?? a.user_id) : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {a.project || a.worktree ? (
                          <div className="flex flex-wrap gap-1">
                            {a.project && <Badge variant="outline" className="font-mono font-normal">{a.project}</Badge>}
                            {a.worktree && <Badge variant="secondary" className="max-w-56 truncate font-mono font-normal">{a.worktree}</Badge>}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><OpenCount name={a.name} n={openBy[a.name]} /></TableCell>
                      <TableCell><RelativeTime value={a.first_seen} /></TableCell>
                      <TableCell className="pr-5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn('size-2 rounded-full', recent ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                          <RelativeTime value={a.last_seen} />
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      {creating && <UserFormPanel onClose={() => setCreating(false)} />}
      {editing && <UserFormPanel user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default OrgPage;
