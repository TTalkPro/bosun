import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router';
import { Building2, Check, CircleAlert, CircleCheck, Eye, EyeOff, Loader2, Lock, Mail, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react';
import { register, requestCode, useMe, type CodeSent } from '@/api/auth';
import { isApiError, tooManyText } from '@/api/client';
import AuthShell from '@/features/auth/AuthShell';
import { passwordStrength, STRENGTH_LABEL } from '@/features/auth/passwordStrength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { paths } from '@/routes/paths';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** 与后端 bosun_email_code 的 RESEND_MS 一致 */
const RESEND_SECS = 60;

const Notice = ({ tone, children }: { tone: 'error' | 'success' | 'warning'; children: ReactNode }) => {
  const Icon = tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : TriangleAlert;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-2 rounded-md border p-3 text-sm',
      tone === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
      tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
      <Icon className="mt-0.5 size-4 shrink-0" /><div className="min-w-0">{children}</div>
    </div>
  );
};

// 两步进度：① 验证邮箱 ② 创建组织
const Steps = ({ step }: { step: 1 | 2 }) => (
  <ol className="flex items-center gap-2 text-xs" aria-label="注册步骤">
    {(['验证邮箱', '创建组织'] as const).map((label, i) => {
      const n = (i + 1) as 1 | 2;
      const done = step > n;
      const current = step === n;
      return (
        <li key={label} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
            done && 'border-primary bg-primary text-primary-foreground',
            current && 'border-primary text-primary',
            !done && !current && 'text-muted-foreground')}>
            {done ? <Check className="size-3.5" /> : n}
          </span>
          <span className={cn('whitespace-nowrap', current ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
          {i === 0 && <span className={cn('h-px flex-1', step > 1 ? 'bg-primary' : 'bg-border')} />}
        </li>
      );
    })}
  </ol>
);

interface FieldProps {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  helper?: ReactNode;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  placeholder?: string;
  /** 输入框右侧的按钮（显示密码等） */
  trailing?: ReactNode;
}

const Field = ({ id, label, icon: Icon, value, onChange, error, helper, type = 'text', autoFocus, autoComplete, placeholder, trailing }: FieldProps) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}
        autoFocus={autoFocus} autoComplete={autoComplete} placeholder={placeholder} className={cn('h-10 pl-9', trailing && 'pr-10')} />
      {trailing}
    </div>
    {(error || helper) && <div className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{error ?? helper}</div>}
  </div>
);

// 6 位验证码：底下一个真输入框（标签、粘贴、one-time-code 自动填充都照常），上面画 6 个格子
const CodeInput = ({ id, value, onChange, invalid, autoFocus }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean; autoFocus?: boolean }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <div aria-hidden className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && (i === value.length || (value.length === 6 && i === 5));
          return (
            <div key={i} className={cn('flex h-12 items-center justify-center rounded-md border bg-background font-mono text-lg font-semibold shadow-xs transition-colors dark:bg-input/30',
              active && 'border-ring ring-[3px] ring-ring/40',
              invalid && 'border-destructive')}>
              {value[i] ?? (active ? <span className="h-5 w-px animate-pulse bg-foreground" /> : '')}
            </div>
          );
        })}
      </div>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus={autoFocus}
        aria-invalid={invalid}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
};

const StrengthMeter = ({ password }: { password: string }) => {
  const s = passwordStrength(password);
  const color = s <= 1 ? 'bg-destructive' : s === 2 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="grid flex-1 grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => <span key={i} className={cn('h-1 rounded-full', i <= s ? color : 'bg-muted')} />)}
      </div>
      <span className="w-20 text-right">{password ? `强度：${STRENGTH_LABEL[s]}` : '至少 8 位'}</span>
    </div>
  );
};

const Divider = ({ children }: { children: ReactNode }) => (
  <div className="relative py-1 text-center text-xs text-muted-foreground">
    <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
    <span className="relative bg-background px-2">{children}</span>
  </div>
);

// 两步：① 邮箱 → 发验证码 ② 验证码 + 组织名 + 显示名 + 密码 → 建组织，注册人即管理员
const RegisterPage = () => {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  // 重发倒计时（秒）；服务端 60 秒内不重发，被拒时按它给的 retry_after 校准
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (me) return <Navigate to={paths.projects} replace />;

  const fail = (err: unknown) => {
    if (isApiError(err) && err.status === 400 && err.field) setErrors({ [err.field]: err.message });
    // 第二步的表单里没有邮箱输入框：冲突要显示在表单级，否则看不到
    else if (isApiError(err) && err.status === 409) setErrors(sent ? { form: '这个邮箱已经注册过了，直接登录即可' } : { email: '这个邮箱已经注册过了' });
    else if (isApiError(err) && err.status === 429) {
      setErrors({ form: tooManyText(err) });
      const secs = Number(err.detail?.retry_after);
      if (Number.isFinite(secs) && secs > 0) setCooldown(Math.ceil(secs));
    } else setErrors({ form: err instanceof Error ? err.message : String(err) });
  };

  const send = async () => {
    setBusy(true);
    try {
      setSent(await requestCode(email.trim()));
      setCooldown(RESEND_SECS);
      setErrors({});
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setErrors({ email: '请输入合法的邮箱' }); return; }
    setErrors({});
    await send();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\d{6}$/.test(code.trim())) next.code = '6 位数字验证码';
    if (!orgName.trim()) next.org_name = '组织名不能为空';
    if (!name.trim()) next.name = '显示名不能为空';
    if (password.length < 8) next.password = '至少 8 位';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await register({ org_name: orgName.trim(), email: email.trim(), code: code.trim(), name: name.trim(), password });
      navigate(paths.projects, { replace: true });
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="注册组织" subtitle="注册人即管理员，之后在「组织与用户」页给同事开账号">
      <Steps step={sent ? 2 : 1} />
      {!sent ? (
        <form onSubmit={sendCode} noValidate className="space-y-4">
          {errors.form && <Notice tone="error">{errors.form}</Notice>}
          <Field
            id="reg-email" label="管理员邮箱" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@example.com"
            error={errors.email} helper="会收到一封带 6 位验证码的邮件，15 分钟内有效" autoFocus autoComplete="email"
          />
          <Button type="submit" size="lg" className="h-10 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}发送验证码</Button>
          <Divider>已有账号？</Divider>
          <Button asChild variant="outline" className="h-10 w-full"><RouterLink to={paths.login}>去登录</RouterLink></Button>
        </form>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          {sent.delivery === 'log'
            ? <Notice tone="warning">服务端没有配置 SMTP：验证码打在 Bosun 的服务端日志里（<code>bosun_mailer [log mode]</code>），请到日志里找。</Notice>
            : <Notice tone="success">验证码已发到 <b className="font-medium">{sent.email}</b>，{Math.round(sent.expires_in / 60)} 分钟内有效。</Notice>}
          {errors.form && <Notice tone="error">{errors.form}</Notice>}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reg-code">验证码</Label>
              <span className="text-xs text-muted-foreground">
                <button type="button" className="hover:text-foreground hover:underline" onClick={() => { setSent(null); setCode(''); setErrors({}); }}>换个邮箱</button>
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                <button type="button" className="hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-60" disabled={busy || cooldown > 0} onClick={() => void send()}>
                  {cooldown > 0 ? `${cooldown} 秒后可重发` : '重新发送'}
                </button>
              </span>
            </div>
            <CodeInput id="reg-code" value={code} onChange={setCode} invalid={!!errors.code} autoFocus />
            {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
          </div>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-medium text-muted-foreground">组织信息</legend>
            <Field id="reg-org" label="组织名" icon={Building2} value={orgName} onChange={setOrgName} error={errors.org_name} placeholder="例如：Acme 研发" helper="之后可以在「组织与用户」里改" />
          </fieldset>

          <fieldset className="space-y-4 border-t pt-4">
            <legend className="sr-only">管理员账号</legend>
            <div className="text-xs font-medium text-muted-foreground">管理员账号（{email.trim()}）</div>
            <Field id="reg-name" label="你的显示名" icon={UserRound} value={name} onChange={setName} error={errors.name} helper="创建 / 执行 / Feedback 都用这个名字署名" autoComplete="name" />
            <Field
              id="reg-password" label="密码" icon={Lock} type={showPw ? 'text' : 'password'} value={password} onChange={setPassword}
              error={errors.password} helper={<StrengthMeter password={password} />} autoComplete="new-password"
              trailing={
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? '隐藏密码' : '显示密码'} aria-pressed={showPw}
                  className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              }
            />
          </fieldset>

          <Button type="submit" size="lg" className="h-10 w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}创建组织</Button>
        </form>
      )}
    </AuthShell>
  );
};

export default RegisterPage;
