import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowUp, CircleAlert, CircleCheck, Eye, EyeOff, Info, Loader2, Lock, Mail } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login, useMe } from '@/api/auth';
import { isApiError, tooManyText } from '@/api/client';
import AuthShell from '@/features/auth/AuthShell';
import { paths } from '@/routes/paths';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : paths.projects);

// 「记住邮箱」：只存邮箱，不存密码（密码交给浏览器自己的密码管理）
const REMEMBER_KEY = 'bosun.login.email';
const rememberedEmail = (): string => { try { return localStorage.getItem(REMEMBER_KEY) ?? ''; } catch { return ''; } };
const rememberEmail = (email: string | null) => {
  try { if (email) localStorage.setItem(REMEMBER_KEY, email); else localStorage.removeItem(REMEMBER_KEY); } catch { /* ignore */ }
};

// 倒计时文字：一分钟以内说秒，长的（登录锁定常是 15 分钟）用 分:秒
const waitText = (secs: number) =>
  secs < 60 ? `${secs} 秒` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} `;

const LoginPage = () => {
  const [params] = useSearchParams(); const navigate = useNavigate(); const { data: me } = useMe();
  const [initialEmail] = useState(rememberedEmail);
  const [email, setEmail] = useState(initialEmail); const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!initialEmail);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({}); const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // 被限流时的倒计时（秒）：按钮变成「N 秒后可再试」，到点自己恢复
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (me) return <Navigate to={safeNext(params.get('next'))} replace />;
  const next = params.get('next');
  const signedOut = params.get('signedout') === '1';

  const submit = async (e: FormEvent) => {
    e.preventDefault(); const errs: typeof errors = {};
    if (cooldown > 0) return;
    if (!EMAIL_RE.test(email.trim())) errs.email = '请输入合法的邮箱';
    if (!password) errs.password = '请输入密码';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      rememberEmail(remember ? email.trim() : null);
      navigate(safeNext(next), { replace: true });
    } catch (err) {
      if (isApiError(err) && err.status === 401) setErrors({ form: '邮箱或密码不对' });
      else if (isApiError(err) && err.status === 429) {
        setErrors({ form: tooManyText(err) });
        const secs = Number(err.detail?.retry_after);
        if (Number.isFinite(secs) && secs > 0) setCooldown(Math.ceil(secs));
      } else if (isApiError(err) && err.status === 403) setErrors({ form: '这个账号已被停用，请联系组织管理员' });
      else setErrors({ form: err instanceof Error ? err.message : String(err) });
    } finally { setBusy(false); }
  };

  // Caps Lock：在密码框里按键 / 聚焦时看一眼
  const watchCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  return (<AuthShell title="登录" subtitle="用组织管理员分配给你的邮箱和密码登录">
    <form onSubmit={submit} noValidate className="space-y-4">
      {signedOut && !errors.form && (
        <div role="status" className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CircleCheck className="size-4 shrink-0" />已退出登录
        </div>
      )}
      {next && !signedOut && !errors.form && (
        <div role="status" className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">需要先登录。登录后回到 <code className="break-all font-mono text-xs text-foreground">{safeNext(next)}</code></span>
        </div>
      )}
      {errors.form && <Alert variant="destructive"><CircleAlert /><AlertDescription>{errors.form}</AlertDescription></Alert>}
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" type="email" className="h-10 pl-9" placeholder="you@example.com" value={email}
            onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((x) => ({ ...x, email: undefined })); }}
            aria-invalid={!!errors.email} autoFocus={!initialEmail} autoComplete="email" />
        </div>
        {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="password" type={showPw ? 'text' : 'password'} className="h-10 pr-10 pl-9" value={password}
            onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((x) => ({ ...x, password: undefined })); }}
            onKeyDown={watchCaps} onKeyUp={watchCaps} onBlur={() => setCapsLock(false)}
            aria-invalid={!!errors.password} aria-describedby={capsLock ? 'caps-hint' : undefined}
            autoFocus={!!initialEmail} autoComplete="current-password" />
          <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? '隐藏密码' : '显示密码'} aria-pressed={showPw}
            className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password ? <p className="text-sm text-destructive">{errors.password}</p>
          : capsLock ? <p id="caps-hint" className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><ArrowUp className="size-3.5" />大写锁定已打开</p>
          : <p className="text-xs text-muted-foreground">忘了密码？请组织管理员在「组织与用户」里帮你重置</p>}
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={remember} onCheckedChange={(v) => { setRemember(v === true); if (v !== true) rememberEmail(null); }} />
        记住邮箱
      </label>
      <Button type="submit" size="lg" className="h-10 w-full" disabled={busy || cooldown > 0}>
        {busy && <Loader2 className="animate-spin" />}{cooldown > 0 ? `${waitText(cooldown)}后可再试` : '登录'}
      </Button>
      <div className="relative py-1 text-center text-xs text-muted-foreground">
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-background px-2">还没有组织？</span>
      </div>
      <Button asChild variant="outline" className="h-10 w-full"><RouterLink to={paths.register}>注册一个新组织</RouterLink></Button>
    </form>
  </AuthShell>);
};
export default LoginPage;
