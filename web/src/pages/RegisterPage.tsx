import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router';
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { register, requestCode, useMe, type CodeSent } from '@/api/auth';
import { isApiError } from '@/api/client';
import AuthShell from '@/features/auth/AuthShell';
import { paths } from '@/routes/paths';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    else if (isApiError(err) && err.status === 409) setErrors({ email: '这个邮箱已经注册过了' });
    else if (isApiError(err) && err.status === 429) setErrors({ form: '验证码刚发过，稍等一分钟再试' });
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
        <form onSubmit={sendCode} noValidate>
          <Stack spacing={2}>
            {errors.form && <Alert severity="error">{errors.form}</Alert>}
            <TextField label="管理员邮箱" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={!!errors.email} helperText={errors.email ?? '会收到一封带 6 位验证码的邮件'} autoFocus autoComplete="email" />
            <Button type="submit" variant="contained" size="large" disabled={busy}>发送验证码</Button>
            <Link component={RouterLink} to={paths.login} variant="body2" sx={{ alignSelf: 'center' }}>已有账号？去登录</Link>
          </Stack>
        </form>
      ) : (
        <form onSubmit={submit} noValidate>
          <Stack spacing={2}>
            {sent.delivery === 'log'
              ? <Alert severity="warning">服务端没有配置 SMTP：验证码打在 Bosun 的服务端日志里（<code>bosun_mailer [log mode]</code>），请到日志里找。</Alert>
              : <Alert severity="success">验证码已发到 {sent.email}，{Math.round(sent.expires_in / 60)} 分钟内有效。</Alert>}
            {errors.form && <Alert severity="error">{errors.form}</Alert>}
            <Typography variant="body2" color="text.secondary">
              {sent.email} · <Link component="button" type="button" onClick={() => { setSent(null); setCode(''); }}>换个邮箱</Link>
            </Typography>
            <TextField label="验证码" value={code} onChange={(e) => setCode(e.target.value)} error={!!errors.code} helperText={errors.code} autoFocus inputProps={{ inputMode: 'numeric', maxLength: 6, style: { fontFamily: 'monospace', letterSpacing: 4 } }} />
            <TextField label="组织名" value={orgName} onChange={(e) => setOrgName(e.target.value)} error={!!errors.org_name} helperText={errors.org_name} />
            <TextField label="你的显示名" value={name} onChange={(e) => setName(e.target.value)} error={!!errors.name} helperText={errors.name ?? '创建 / 执行 / Feedback 都用这个名字署名'} />
            <TextField label="密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={!!errors.password} helperText={errors.password ?? '至少 8 位'} autoComplete="new-password" />
            <Button type="submit" variant="contained" size="large" disabled={busy}>创建组织</Button>
          </Stack>
        </form>
      )}
    </AuthShell>
  );
};

export default RegisterPage;
