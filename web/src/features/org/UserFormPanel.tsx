import { useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { createUser, updateUser, useMe, type Role, type User } from '@/api/auth';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import FormField from '@/components/FormField';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface Props {
  /** 传入则为编辑 */
  user?: User;
  onClose: () => void;
}

// 管理员建 / 改用户：新建要 email + 显示名 + 初始密码；编辑可改名 / 角色 / 停用 / 重置密码
const UserFormPanel = ({ user, onClose }: Props) => {
  const editing = !!user;
  const { data: me } = useMe();
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'member');
  const [active, setActive] = useState(user?.status !== 'disabled');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const isSelf = !!user && user.id === me?.user.id;

  const submit = async () => {
    const errs: typeof errors = {};
    if (!editing && !EMAIL_RE.test(email.trim())) errs.email = '请输入合法的邮箱';
    if (!name.trim()) errs.name = '显示名不能为空';
    if ((!editing || password) && password.length < 8) errs.password = '至少 8 位';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (editing) {
        await updateUser(user.id, { name: name.trim(), role, status: active ? 'active' : 'disabled', ...(password ? { password } : {}) });
        enqueueSnackbar('已保存', { variant: 'success' });
      } else {
        await createUser({ email: email.trim(), name: name.trim(), password, role });
        enqueueSnackbar(`已创建 ${name.trim()}，把初始密码告诉对方`, { variant: 'success' });
      }
      onClose();
    } catch (e) {
      const { field, message } = handleError(e, ['email', 'name', 'role', 'password']);
      if (field) setErrors({ [field]: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel size="md" title={editing ? `编辑用户 ${user.name}` : '新建用户'} onClose={onClose} busy={busy}
      actions={<><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={submit} disabled={busy}>{editing ? '保存' : '创建'}</Button></>}>
      <div className="space-y-5">
        <FormField label="邮箱" htmlFor="user-email" error={errors.email} hint={editing ? '登录用，不可修改' : '登录用'}>
          <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={editing} aria-invalid={!!errors.email} autoFocus={!editing} autoComplete="off" />
        </FormField>
        <FormField label="显示名" htmlFor="user-name" error={errors.name} hint="任务历史 / Feedback 的署名，组织内唯一">
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} autoFocus={editing} />
        </FormField>
        <FormField label="角色" htmlFor="user-role" error={errors.role}
          hint={isSelf ? '不能把自己降级为成员，除非组织里还有别的管理员' : '管理员可以管用户、组织信息与导入导出'}>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id="user-role" aria-invalid={!!errors.role} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="member">成员</SelectItem>
              <SelectItem value="admin">管理员</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={editing ? '重置密码' : '初始密码'} htmlFor="user-password" error={errors.password}
          hint={editing ? '留空不改；填了就重置为这个' : '至少 8 位，线下告诉对方，登录后可自行修改'}>
          <Input id="user-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} autoComplete="new-password" />
        </FormField>
        {editing && (
          <div className="flex items-center gap-2">
            <Switch id="user-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="user-active">启用（停用后不能登录，会话与 API key 立即失效）</Label>
          </div>
        )}
        {!editing && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            系统不发邀请邮件：创建后请把邮箱和初始密码告诉对方。
          </div>
        )}
      </div>
    </SidePanel>
  );
};

export default UserFormPanel;
