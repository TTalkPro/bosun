import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import AuthGate from '@/components/AuthGate';
import LoginPage from '@/pages/LoginPage';
import { ApiError } from '@/api/client';
import type { Me } from '@/api/auth';

const me: Me = {
  user: { id: 'u1', org_id: 'o1', email: 'alice@acme.io', name: 'Alice', role: 'admin', status: 'active', created_at: '', updated_at: '', last_login_at: null },
  org: { id: 'o1', name: 'Acme', created_by: 'u1', created_at: '', updated_at: '' },
  via: 'session',
};

const mocks = vi.hoisted(() => ({
  useMe: vi.fn(),
  login: vi.fn(),
}));
vi.mock('@/api/auth', () => ({ useMe: mocks.useMe, login: mocks.login }));

const renderAt = (path: string) =>
  render(
    <>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthGate />}>
            <Route path="/projects" element={<div>projects page</div>} />
            <Route path="/tasks/:id" element={<div>task page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </>,
  );

describe('AuthGate', () => {
  beforeEach(() => { mocks.useMe.mockReset(); mocks.login.mockReset(); });

  it('shows progress while loading', () => {
    mocks.useMe.mockReturnValue({ data: undefined, error: undefined, isLoading: true });
    renderAt('/projects');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('redirects to /login with next when not logged in', () => {
    mocks.useMe.mockReturnValue({ data: undefined, error: new ApiError(401, undefined, 'x'), isLoading: false });
    renderAt('/tasks/BOS-1?x=1');
    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
  });

  it('renders the protected route when logged in', () => {
    mocks.useMe.mockReturnValue({ data: me, error: undefined, isLoading: false });
    renderAt('/projects');
    expect(screen.getByText('projects page')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  beforeEach(() => { mocks.useMe.mockReset(); mocks.login.mockReset(); });

  it('validates email and password before calling the API', async () => {
    mocks.useMe.mockReturnValue({ data: undefined, error: new ApiError(401, undefined, 'x'), isLoading: false });
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(screen.getByText('请输入合法的邮箱')).toBeInTheDocument();
    expect(screen.getByText('请输入密码')).toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('shows a message on wrong credentials', async () => {
    mocks.useMe.mockReturnValue({ data: undefined, error: new ApiError(401, undefined, 'x'), isLoading: false });
    mocks.login.mockRejectedValue(new ApiError(401, { error: 'invalid_credentials', message: 'wrong' }, 'x'));
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@acme.io' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(screen.getByText('邮箱或密码不对')).toBeInTheDocument());
    expect(mocks.login).toHaveBeenCalledWith('alice@acme.io', 'secret123');
  });

  it('goes to ?next= after login (site-relative only)', async () => {
    mocks.useMe.mockReturnValue({ data: undefined, error: new ApiError(401, undefined, 'x'), isLoading: false });
    mocks.login.mockImplementation(async () => { mocks.useMe.mockReturnValue({ data: me, error: undefined, isLoading: false }); return { org: me.org, user: me.user }; });
    renderAt('/login?next=%2Ftasks%2FBOS-1');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@acme.io' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(screen.getByText('task page')).toBeInTheDocument());
  });
});

describe('LoginPage extras', () => {
  beforeEach(() => {
    mocks.useMe.mockReset(); mocks.login.mockReset(); localStorage.clear();
    mocks.useMe.mockReturnValue({ data: undefined, error: new ApiError(401, undefined, 'x'), isLoading: false });
  });

  it('prefills a remembered email and forgets it when unchecked', async () => {
    localStorage.setItem('bosun.login.email', 'alice@acme.io');
    renderAt('/login');
    expect((screen.getByLabelText('邮箱') as HTMLInputElement).value).toBe('alice@acme.io');
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(localStorage.getItem('bosun.login.email')).toBeNull();
  });

  it('remembers the email after a successful login when checked', async () => {
    mocks.login.mockImplementation(async () => { mocks.useMe.mockReturnValue({ data: me, error: undefined, isLoading: false }); return { org: me.org, user: me.user }; });
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@acme.io' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(screen.getByText('projects page')).toBeInTheDocument());
    expect(localStorage.getItem('bosun.login.email')).toBe('alice@acme.io');
  });

  it('counts down after being rate limited', async () => {
    mocks.login.mockRejectedValue(new ApiError(429, { error: 'too_many_requests', message: 'slow down', detail: { retry_after: 30 } }, 'x'));
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@acme.io' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    const btn = await screen.findByRole('button', { name: '30 秒后可再试' });
    expect(btn).toBeDisabled();
    expect(screen.getByText('尝试次数太多，请 30 秒后再试')).toBeInTheDocument();
  });

  it('shows long lockouts as minutes:seconds', async () => {
    mocks.login.mockRejectedValue(new ApiError(429, { error: 'too_many_requests', message: 'slow down', detail: { retry_after: 895 } }, 'x'));
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'alice@acme.io' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('button', { name: '14:55 后可再试' })).toBeDisabled();
  });

  it('explains why you are here and warns about caps lock', () => {
    renderAt('/login?next=%2Ftasks%2FBOS-1');
    expect(screen.getByText('/tasks/BOS-1')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('密码'), { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('大写锁定已打开')).toBeInTheDocument();
  });

  it('confirms a sign-out', () => {
    renderAt('/login?signedout=1');
    expect(screen.getByText('已退出登录')).toBeInTheDocument();
  });
});
