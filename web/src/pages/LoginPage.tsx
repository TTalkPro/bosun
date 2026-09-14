import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Link, Stack, TextField } from '@mui/material';
import { login, useMe } from '@/api/auth';
import { isApiError } from '@/api/client';
import AuthShell from '@/features/auth/AuthShell';
import { paths } from '@/routes/paths';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 登录成功回 ?next=（只接受站内相对路径），缺省项目页
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : paths.projects);

const LoginPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to={safeNext(params.get('next'))} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = '请输入合法的邮箱';
    if (!password) next.password = '请输入密码';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      if (isApiError(err) && err.status === 401) setErrors({ form: '邮箱或密码不对' });
      else if (isApiError(err) && err.status === 403) setErrors({ form: '这个账号已被停用，请联系组织管理员' });
      else setErrors({ form: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="登录" subtitle="用组织管理员分配给你的邮箱和密码登录">
      <form onSubmit={submit} noValidate>
        <Stack spacing={2}>
          {errors.form && <Alert severity="error">{errors.form}</Alert>}
          <TextField label="邮箱" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={!!errors.email} helperText={errors.email} autoFocus autoComplete="email" />
          <TextField label="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={!!errors.password} helperText={errors.password} autoComplete="current-password" />
          <Button type="submit" variant="contained" size="large" disabled={busy}>登录</Button>
          <Link component={RouterLink} to={paths.register} variant="body2" sx={{ alignSelf: 'center' }}>还没有组织？注册一个</Link>
        </Stack>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
