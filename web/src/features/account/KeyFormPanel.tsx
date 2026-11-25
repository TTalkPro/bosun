import { useState } from 'react';
import { Copy } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { createKey, type CreatedApiKey } from '@/api/auth';
import SidePanel from '@/components/SidePanel';
import RelativeTime from '@/components/RelativeTime';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const PRESETS = [
  { value: 'read', label: '只读', scopes: ['read'] },
  { value: 'agent', label: 'Agent', scopes: ['read', 'write'] },
  { value: 'manage', label: 'Manager', scopes: ['read', 'write', 'manage'] },
] as const;

const presetValue = (scopes: string[]) => {
  if (scopes.includes('manage')) return 'manage';
  if (scopes.includes('write')) return 'agent';
  return 'read';
};

// 新建 API key：成功后整串只在这里显示一次
const KeyFormPanel = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [projectKeysText, setProjectKeysText] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const submit = async () => {
    setBusy(true);
    try {
      const projectKeys = projectKeysText.split(/[,\s]+/).map((v) => v.trim().toUpperCase()).filter(Boolean);
      const nextDay = expiresAt ? new Date(`${expiresAt}T23:59:59`).getTime() : undefined;
      setCreated(await createKey({
        name: name.trim(),
        scopes,
        project_keys: projectKeys.length ? projectKeys : undefined,
        expires_at: Number.isFinite(nextDay) ? nextDay : undefined,
      }));
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.key); enqueueSnackbar('已复制', { variant: 'success' }); } catch { enqueueSnackbar('复制失败，请手动选中复制', { variant: 'warning' }); }
  };

  return (
    <SidePanel size="md"
      title={created ? `Key「${created.name}」已创建` : '新建 API Key'}
      onClose={onClose}
      busy={busy}
      modal={!!created}
      actions={created
        ? <Button onClick={onClose}>我已保存，关闭</Button>
        : <><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={submit} disabled={busy}>创建</Button></>}
    >
      {created ? (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            这串 key <strong>只显示这一次</strong>，关掉就再也看不到了；丢了就轮换或撤销重建。
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
            <code className="min-w-0 flex-1 font-mono text-sm break-all" data-testid="new-key">{created.key}</code>
            <Button variant="outline" size="sm" onClick={copy}><Copy className="size-4" />复制</Button>
          </div>
          <p className="text-sm text-muted-foreground">给 Claude Code 用：</p>
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs">
{`export BOSUN_API_KEY=${created.key}
claude mcp add --transport http bosun ${window.location.origin}/mcp \\
  --header "Authorization: Bearer \${BOSUN_API_KEY}"`}
          </pre>
          <p className="text-sm text-muted-foreground">
            Agent 连上后仍要先 <code>identify(name, kind, project)</code> 报个名字；写操作署这个名字，记在你的账号下。
          </p>
          <p className="text-sm text-muted-foreground">
            权限：<strong>{created.scopes?.length ? created.scopes.join(', ') : 'legacy 全量'}</strong>
            {created.project_keys?.length ? <>；项目：{created.project_keys.join(', ')}</> : <>；项目：组织内全部</>}
            {created.expires_at ? <>；过期：<RelativeTime value={created.expires_at} /></> : null}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="key-name" className="mb-2 block text-sm font-medium">名字</label>
            <Input
              id="key-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
            <p className="mt-1 text-xs text-muted-foreground">给自己看的备注，比如「笔记本 claude code」；留空为 default</p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">权限预设</p>
            <div className="inline-flex overflow-hidden rounded-md border">
              {PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setScopes([...preset.scopes])}
                  className={cn('px-3 py-1 text-sm hover:bg-accent', presetValue(scopes) === preset.value && 'bg-accent font-medium')}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              只读可浏览和查询；Agent 可创建 / 更新 / 迁移任务；Manager 还能管理项目与筛选器。旧 key 保持全量权限。
            </p>
          </div>

          <div>
            <label htmlFor="key-projects" className="mb-2 block text-sm font-medium">项目白名单（可选）</label>
            <Input
              id="key-projects"
              value={projectKeysText}
              onChange={(e) => setProjectKeysText(e.target.value)}
              placeholder="BOS, APP"
            />
            <p className="mt-1 text-xs text-muted-foreground">逗号或空格分隔；留空表示组织内全部项目</p>
          </div>

          <div>
            <label htmlFor="key-expires" className="mb-2 block text-sm font-medium">过期日期（可选）</label>
            <Input id="key-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">{expiresAt ? '当天结束前有效（本地时区）' : '留空表示不过期'}</p>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            Key 代表你本人：Agent 用它访问 MCP 时只能看到你所在组织的项目，写操作记在你的账号下。
          </div>
        </div>
      )}
    </SidePanel>
  );
};

export default KeyFormPanel;
