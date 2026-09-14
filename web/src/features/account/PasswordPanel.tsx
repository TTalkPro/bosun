import { useState } from 'react';
import { Button, Stack, TextField } from '@mui/material';
import { useSnackbar } from 'notistack';
import { changePassword } from '@/api/auth';
import { isApiError } from '@/api/client';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';

const PasswordPanel = ({ onClose }: { onClose: () => void }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; again?: string }>({});
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const submit = async () => {
    const errs: typeof errors = {};
    if (!current) errs.current = '请输入当前密码';
    if (next.length < 8) errs.next = '至少 8 位';
    if (again !== next) errs.again = '两次输入不一致';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await changePassword(current, next);
      enqueueSnackbar('密码已修改', { variant: 'success' });
      onClose();
    } catch (e) {
      if (isApiError(e) && e.status === 401) setErrors({ current: '当前密码不对' });
      else { const { field, message } = handleError(e); if (field === 'password') setErrors({ next: message }); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel title="修改密码" onClose={onClose} busy={busy}
      actions={<><Button onClick={onClose} disabled={busy}>取消</Button><Button variant="contained" onClick={submit} disabled={busy}>保存</Button></>}>
      <Stack spacing={2}>
        <TextField label="当前密码" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} error={!!errors.current} helperText={errors.current} autoFocus autoComplete="current-password" />
        <TextField label="新密码" type="password" value={next} onChange={(e) => setNext(e.target.value)} error={!!errors.next} helperText={errors.next ?? '至少 8 位'} autoComplete="new-password" />
        <TextField label="再输一次" type="password" value={again} onChange={(e) => setAgain(e.target.value)} error={!!errors.again} helperText={errors.again} autoComplete="new-password" />
      </Stack>
    </SidePanel>
  );
};

export default PasswordPanel;
