import { useState } from 'react';
import { MoreHorizontal, Pencil, ShieldCheck, UserCheck, UserRound, UserX } from 'lucide-react';
import { updateUser, type User } from '@/api/auth';
import { isApiError } from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface Props {
  user: User;
  isSelf: boolean;
  onEdit: () => void;
}

/**
 * 用户行菜单：编辑（原面板）+ 直接改角色 / 停用启用。后端保证组织里至少留一个启用的管理员（409 last_admin），
 * 这里把这种拒绝翻成中文；停用要确认（会踢掉对方全部会话）；不给自己停用（去面板里改）。
 */
const UserRowMenu = ({ user, isSelf, onEdit }: Props) => {
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (input: Parameters<typeof updateUser>[1], done: string) => {
    setBusy(true);
    try {
      await updateUser(user.id, input);
      enqueueSnackbar(done, { variant: 'success', autoHideDuration: 1500 });
    } catch (e) {
      if (isApiError(e) && e.error === 'last_admin') enqueueSnackbar('组织里至少要留一个启用的管理员', { variant: 'warning' });
      else handleError(e);
    } finally {
      setBusy(false);
      setConfirmDisable(false);
    }
  };

  const active = user.status === 'active';
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`${user.name} 操作`} disabled={busy}><MoreHorizontal className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onEdit}><Pencil className="size-4" />编辑 / 重置密码…</DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.role === 'member'
            ? <DropdownMenuItem onSelect={() => void apply({ role: 'admin' }, `${user.name} 已设为管理员`)}><ShieldCheck className="size-4" />设为管理员</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => void apply({ role: 'member' }, `${user.name} 已设为成员`)}><UserRound className="size-4" />设为成员</DropdownMenuItem>}
          {active
            ? !isSelf && <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDisable(true)}><UserX className="size-4" />停用</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => void apply({ status: 'active' }, `${user.name} 已启用`)}><UserCheck className="size-4" />启用</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDisable}
        title={`停用 ${user.name}？`}
        message={<>停用后 {user.email} 立刻被登出、不能再登录；任务、Feedback 与署名都保留，随时可以再启用。</>}
        confirmText="停用"
        danger
        busy={busy}
        onConfirm={() => void apply({ status: 'disabled' }, `${user.name} 已停用`)}
        onClose={() => setConfirmDisable(false)}
      />
    </>
  );
};

export default UserRowMenu;
