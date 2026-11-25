import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  Activity, Ban, Building2, Check, Copy, KeyRound, LockKeyhole, Mail, Monitor, Moon, MoreHorizontal, Palette, Plus, RefreshCw,
  ShieldCheck, Sun, UserRound, type LucideIcon,
} from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { rotateKey, revokeKey, useKeys, useMe, type ApiKey, type CreatedApiKey } from '@/api/auth';
import { ActorAvatar } from '@/components/ActorChip';
import ConfirmDialog from '@/components/ConfirmDialog';
import CreatedKeyDialog from '@/features/account/CreatedKeyDialog';
import RelativeTime from '@/components/RelativeTime';
import Section from '@/components/Section';
import { useApiError } from '@/components/useApiError';
import KeyFormPanel from '@/features/account/KeyFormPanel';
import PasswordPanel from '@/features/account/PasswordPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import StatCard from '@/features/dashboard/StatCard';
import MyWork from '@/features/account/MyWork';
import PreferencesPanel from '@/features/account/PreferencesPanel';
import { followSystem, getSystemMode, isFollowingSystem, setThemeMode, useThemeMode } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Tab = 'profile' | 'appearance' | 'keys';
const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'profile', label: '个人资料', icon: UserRound },
  { key: 'appearance', label: '外观与偏好', icon: Palette },
  { key: 'keys', label: 'API Key', icon: KeyRound },
];

const SCOPE_LABEL: Record<string, string> = { read: '只读', write: '读写', manage: '管理' };

const InfoRow = ({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) => (
  <div className="flex items-center gap-3 px-5 py-3">
    <dt className="flex w-24 shrink-0 items-center gap-2 text-muted-foreground"><Icon className="size-4" />{label}</dt>
    <dd className="min-w-0 flex-1 truncate">{children}</dd>
  </div>
);

const Snippet = ({ label, code }: { label: string; code: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        {label}
        <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background hover:text-foreground"
          onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed"><code>{code}</code></pre>
    </div>
  );
};

// 主题预览缩略图：一条侧栏 + 几张卡片，用固定色画，不跟当前主题走
const ThemePreview = ({ dark }: { dark: boolean }) => (
  <div className={cn('flex h-24 gap-1.5 rounded-md p-2', dark ? 'bg-slate-950' : 'bg-slate-100')}>
    <div className={cn('w-1/4 space-y-1 rounded-sm p-1', dark ? 'bg-slate-900' : 'bg-white')}>
      {[0, 1, 2].map((i) => <div key={i} className={cn('h-1.5 rounded-full', i === 0 ? 'bg-blue-500' : dark ? 'bg-slate-700' : 'bg-slate-200')} />)}
    </div>
    <div className="flex-1 space-y-1.5">
      <div className={cn('h-6 rounded-sm', dark ? 'bg-slate-900' : 'bg-white')} />
      <div className="flex gap-1.5">
        <div className={cn('h-10 flex-1 rounded-sm', dark ? 'bg-slate-900' : 'bg-white')} />
        <div className={cn('h-10 flex-1 rounded-sm', dark ? 'bg-slate-900' : 'bg-white')} />
      </div>
    </div>
  </div>
);

// 外观：浅色 / 深色两张卡（高亮当前生效的）+ 是否跟随系统。
// 主题 store 的规则是「与系统一致 = 跟随系统」，所以选了和系统相同的那张就是回到跟随，这里如实显示
const AppearancePanel = () => {
  const mode = useThemeMode();
  const following = isFollowingSystem();
  const system = getSystemMode();
  return (
    <Section title="主题" description="选和系统不同的那一个会固定下来；选和系统相同的就是跟随系统">
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        {(['light', 'dark'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setThemeMode(m)} aria-pressed={mode === m}
            className={cn('rounded-lg border-2 p-1.5 text-left transition-colors', mode === m ? 'border-primary' : 'border-transparent hover:border-border')}>
            <ThemePreview dark={m === 'dark'} />
            <div className="flex items-center gap-1.5 px-1 pt-2 pb-0.5 text-sm font-medium">
              {m === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}{m === 'light' ? '浅色' : '深色'}
              {mode === m && <Check className="ml-auto size-4 text-primary" />}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <Monitor className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          {following
            ? <>正在跟随系统（系统当前为{system === 'dark' ? '深色' : '浅色'}），系统切换时页面跟着变</>
            : <>已固定为{mode === 'dark' ? '深色' : '浅色'}，不再跟随系统（系统当前为{system === 'dark' ? '深色' : '浅色'}）</>}
        </span>
        {!following && <Button size="sm" variant="outline" className="h-7" onClick={followSystem}>改回跟随系统</Button>}
      </div>
    </Section>
  );
};

const AccountPage = () => {
  const { data: me } = useMe();
  const { data: keysData } = useKeys();
  const [creating, setCreating] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [rotating, setRotating] = useState<ApiKey | null>(null);
  const [rotatedKey, setRotatedKey] = useState<CreatedApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [sp, setSp] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.key === sp.get('tab')) ? (sp.get('tab') as Tab) : 'profile';
  const setTab = (t: Tab) => setSp(t === 'profile' ? {} : { tab: t }, { replace: true });
  const mcpUrl = `${window.location.origin}/mcp`;
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
  const active = keys.filter((k) => k.status === 'active');
  const lastUsed = active.map((k) => k.last_used_at).filter((x): x is string => !!x).sort().at(-1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">账户</h1>
        <p className="mt-1 text-sm text-muted-foreground">个人资料、外观偏好，以及给 Agent 连 MCP 用的 API Key</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="账户设置">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}
              className={cn('flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-colors',
                tab === t.key ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}>
              <t.icon className="size-4" />{t.label}
              {t.key === 'keys' && <span className="ml-auto rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{active.length}</span>}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          {tab === 'profile' && (
            <>
              <Card className="gap-0 overflow-hidden py-0 shadow-xs">
                <div className="h-20 bg-gradient-to-r from-primary/25 via-primary/10 to-transparent" />
                <div className="flex flex-wrap items-end gap-4 px-6 pt-3 pb-5">
                  <div className="-mt-10 rounded-full bg-card p-1 shadow-sm"><ActorAvatar name={user.name} kind="human" size={64} /></div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-xl font-semibold">{user.name}</h2>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role === 'admin' ? '管理员' : '成员'}</Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
              </Card>

              <MyWork name={user.name} />

              <Section title="个人资料" description="显示名是你在任务历史 / Feedback 里的署名，由组织管理员修改" bodyClassName="p-0">
                <dl className="divide-y text-sm">
                  <InfoRow icon={UserRound} label="显示名">{user.name}</InfoRow>
                  <InfoRow icon={Mail} label="邮箱">{user.email}</InfoRow>
                  <InfoRow icon={Building2} label="组织">{org.name}</InfoRow>
                  <InfoRow icon={ShieldCheck} label="角色">{user.role === 'admin' ? '管理员（可管理组织成员、导入导出数据）' : '成员'}</InfoRow>
                </dl>
              </Section>

              <Section title="安全" bodyClassName="p-0">
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><LockKeyhole className="size-4 text-muted-foreground" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">登录密码</div>
                    <div className="text-xs text-muted-foreground">至少 8 位；改完后别处登录的会话全部失效，需要重新登录（当前浏览器不受影响）</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setChangingPw(true)}>修改密码</Button>
                </div>
              </Section>
            </>
          )}

          {tab === 'appearance' && <><AppearancePanel /><PreferencesPanel /></>}

          {tab === 'keys' && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="有效的 Key" icon={KeyRound} value={keysData ? active.length : undefined} />
                <StatCard label="已撤销" icon={Ban} value={keysData ? keys.length - active.length : undefined} />
                <Card className="gap-0 px-5 py-4 shadow-xs">
                  <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                    有效 Key 最近使用
                    <span className="flex size-8 items-center justify-center rounded-lg bg-muted"><Activity className="size-4 text-muted-foreground" /></span>
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight">{lastUsed ? <RelativeTime value={lastUsed} className="text-2xl text-foreground" /> : '从未'}</div>
                </Card>
              </div>

              <Section title="连接 MCP" description="Key 代表你本人：Agent 用它调用 MCP 工具时以你的名义、只能看到本组织（及 Key 限定）的项目">
                <div className="space-y-3">
                  <Snippet label="Claude Code 命令行" code={`claude mcp add --transport http --scope user bosun ${mcpUrl} \\\n  --header "Authorization: Bearer \${BOSUN_API_KEY}"`} />
                  <Snippet label=".mcp.json" code={`{ "mcpServers": { "bosun": { "type": "http", "url": "${mcpUrl}",\n  "headers": { "Authorization": "Bearer \${BOSUN_API_KEY}" } } } }`} />
                </div>
              </Section>

              <Section
                title="API Key"
                count={keys.length}
                action={<Button size="sm" className="h-7" onClick={() => setCreating(true)}><Plus />新建 Key</Button>}
                bodyClassName="p-0"
              >
                {keys.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                    <KeyRound className="size-6" />
                    还没有 key。建一把给 Agent 用，秘密值只显示一次。
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => setCreating(true)}><Plus />新建 Key</Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">名字</TableHead>
                        <TableHead>权限</TableHead>
                        <TableHead>创建</TableHead>
                        <TableHead>最近使用</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="w-12 pr-5" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keys.map((k) => (
                        <TableRow key={k.id} className={k.status === 'revoked' ? 'opacity-55' : undefined}>
                          <TableCell className="pl-5">
                            <div className="font-medium">{k.name}</div>
                            <code className="text-xs text-muted-foreground">{k.prefix}…</code>
                          </TableCell>
                          <TableCell>
                            <div className="flex max-w-64 flex-wrap gap-1">
                              {(k.scopes ?? ['*']).map((scope) => (
                                <Badge key={scope} variant="outline" className="font-normal">{scope === '*' ? 'legacy 全量' : SCOPE_LABEL[scope] ?? scope}</Badge>
                              ))}
                              <Badge variant="secondary" className="font-normal">{k.project_keys?.length ? `${k.project_keys.length} 个项目` : '全部项目'}</Badge>
                            </div>
                          </TableCell>
                          <TableCell><RelativeTime value={k.created_at} /></TableCell>
                          <TableCell>{k.last_used_at ? <RelativeTime value={k.last_used_at} /> : <span className="text-xs text-muted-foreground">从未</span>}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <span className={cn('size-2 rounded-full', k.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
                              {k.status === 'active' ? '有效' : '已撤销'}
                            </span>
                          </TableCell>
                          <TableCell className="pr-5 text-right">
                            {k.status === 'active' && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8" aria-label={`${k.name} 操作`}><MoreHorizontal className="size-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-36">
                                  <DropdownMenuItem onSelect={() => setRotating(k)}><RefreshCw className="size-4" />轮换</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => setRevoking(k)}><Ban className="size-4" />撤销</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Section>
            </>
          )}
        </div>
      </div>

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
