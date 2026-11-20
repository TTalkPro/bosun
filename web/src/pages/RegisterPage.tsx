import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router';
import { register, requestCode, useMe, type CodeSent } from '@/api/auth';
import { isApiError, tooManyText } from '@/api/client';
import AuthShell from '@/features/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { paths } from '@/routes/paths';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const Alert = ({ severity, children }: { severity: 'error' | 'success' | 'warning'; children: React.ReactNode }) => (
  <div className={cn('rounded-md border p-3 text-sm',
    severity === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
    severity === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    severity === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
    {children}
  </div>
);

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  helper?: string;
  type?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  inputMode?: 'numeric';
  maxLength?: number;
  className?: string;
}

const Field = ({ id, label, value, onChange, error, helper, type = 'text', autoFocus, autoComplete, inputMode, maxLength, className }: FieldProps) => (
  <div>
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={!!error}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      className={cn(maxLength === 6 && 'font-mono tracking-[4px]', className)}
    />
    <p className={error ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>{error ?? helper}</p>
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
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to={paths.projects} replace />;

  const fail = (err: unknown) => {
    if (isApiError(err) && err.status === 400 && err.field) setErrors({ [err.field]: err.message });
    // 第二步的表单里没有邮箱输入框：冲突要显示在表单级，否则看不到
    else if (isApiError(err) && err.status === 409) setErrors(sent ? { form: '这个邮箱已经注册过了，直接登录即可' } : { email: '这个邮箱已经注册过了' });
    else if (isApiError(err) && err.status === 429) setErrors({ form: tooManyText(err) });
    else setErrors({ form: err instanceof Error ? err.message : String(err) });
  };

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setErrors({ email: '请输入合法的邮箱' }); return; }
    setErrors({});
    setBusy(true);
    try { setSent(await requestCode(email.trim())); } catch (err) { fail(err); } finally { setBusy(false); }
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
    <AuthShell title="注册组织" subtitle="注册人成为组织管理员，之后在「组织」页给同事开账号">
      {!sent ? (
        <form onSubmit={sendCode} noValidate className="space-y-4">
          {errors.form && <Alert severity="error">{errors.form}</Alert>}
          <Field
            id="reg-email" label="管理员邮箱" type="email" value={email} onChange={setEmail}
            error={errors.email} helper="会收到一封带 6 位验证码的邮件" autoFocus autoComplete="email"
          />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>发送验证码</Button>
          <RouterLink to={paths.login} className="mx-auto block w-fit text-sm text-primary hover:underline">已有账号？去登录</RouterLink>
        </form>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {sent.delivery === 'log'
            ? <Alert severity="warning">服务端没有配置 SMTP：验证码打在 Bosun 的服务端日志里（<code>bosun_mailer [log mode]</code>），请到日志里找。</Alert>
            : <Alert severity="success">验证码已发到 {sent.email}，{Math.round(sent.expires_in / 60)} 分钟内有效。</Alert>}
          {errors.form && <Alert severity="error">{errors.form}</Alert>}
          <p className="text-sm text-muted-foreground">
            {sent.email} · <button type="button" className="text-primary hover:underline" onClick={() => { setSent(null); setCode(''); }}>换个邮箱</button>
          </p>
          <Field id="reg-code" label="验证码" value={code} onChange={setCode} error={errors.code} autoFocus inputMode="numeric" maxLength={6} />
          <Field id="reg-org" label="组织名" value={orgName} onChange={setOrgName} error={errors.org_name} />
          <Field id="reg-name" label="你的显示名" value={name} onChange={setName} error={errors.name} helper="创建 / 执行 / Feedback 都用这个名字署名" />
          <Field id="reg-password" label="密码" type="password" value={password} onChange={setPassword} error={errors.password} helper="至少 8 位" autoComplete="new-password" />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>创建组织</Button>
        </form>
      )}
    </AuthShell>
  );
};

export default RegisterPage;
