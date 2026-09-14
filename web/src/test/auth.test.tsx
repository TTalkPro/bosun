import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { MemoryRouter, Route, Routes } from 'react-router';
import theme from '@/theme';
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
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthGate />}>
            <Route path="/projects" element={<div>projects page</div>} />
            <Route path="/tasks/:id" element={<div>task page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
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
