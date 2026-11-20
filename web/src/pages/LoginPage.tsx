import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login, useMe } from '@/api/auth';
import { isApiError, tooManyText } from '@/api/client';
import AuthShell from '@/features/auth/AuthShell';
import { paths } from '@/routes/paths';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : paths.projects);

const LoginPage = () => {
  const [params] = useSearchParams(); const navigate = useNavigate(); const { data: me } = useMe();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({}); const [busy, setBusy] = useState(false);
  if (me) return <Navigate to={safeNext(params.get('next'))} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = '请输入合法的邮箱';
    if (!password) next.password = '请输入密码';
    setErrors(next); if (Object.keys(next).length) return;
    setBusy(true);
    try { await login(email.trim(), password); navigate(safeNext(params.get('next')), { replace: true }); }
    catch (err) {
      if (isApiError(err) && err.status === 401) setErrors({ form: '邮箱或密码不对' });
      else if (isApiError(err) && err.status === 429) setErrors({ form: tooManyText(err) });
      else if (isApiError(err) && err.status === 403) setErrors({ form: '这个账号已被停用，请联系组织管理员' });
      else setErrors({ form: err instanceof Error ? err.message : String(err) });
    } finally { setBusy(false); }
  };
  return (<AuthShell title="登录" subtitle="用组织管理员分配给你的邮箱和密码登录">
    <form onSubmit={submit} noValidate className="space-y-4">
      {errors.form && <Alert variant="destructive"><AlertDescription>{errors.form}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="email">邮箱</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} autoFocus autoComplete="email" />{errors.email && <p className="text-sm text-destructive">{errors.email}</p>}</div>
      <div className="space-y-2"><Label htmlFor="password">密码</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} autoComplete="current-password" />{errors.password && <p className="text-sm text-destructive">{errors.password}</p>}</div>
      <Button type="submit" className="w-full" disabled={busy}>登录</Button>
      <RouterLink to={paths.register} className="block text-center text-sm text-muted-foreground hover:text-foreground">还没有组织？注册一个</RouterLink>
    </form>
  </AuthShell>);
};
export default LoginPage;
