import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { changePassword } from '@/api/auth';
import { isApiError } from '@/api/client';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  helper?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}

const PasswordField = ({ id, label, value, onChange, error, helper, autoComplete, autoFocus }: FieldProps) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
    <Input
      id={id}
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      aria-invalid={!!error}
    />
    <p className={cn('mt-1 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? helper}</p>
  </div>
);

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
      actions={<><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={submit} disabled={busy}>保存</Button></>}>
      <div className="space-y-4">
        <PasswordField id="pw-current" label="当前密码" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" autoFocus />
        <PasswordField id="pw-next" label="新密码" value={next} onChange={setNext} error={errors.next} helper="至少 8 位" autoComplete="new-password" />
        <PasswordField id="pw-again" label="再输一次" value={again} onChange={setAgain} error={errors.again} autoComplete="new-password" />
      </div>
    </SidePanel>
  );
};

export default PasswordPanel;
