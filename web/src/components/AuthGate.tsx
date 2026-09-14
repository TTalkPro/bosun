import { Box, LinearProgress } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '@/api/auth';

// 未登录 → /login?next=当前路径；加载中显示进度条。登录后的子路由由 Outlet 渲染
const AuthGate = () => {
  const { data, error, isLoading } = useMe();
  const { pathname, search } = useLocation();
  if (isLoading || (!data && !error)) {
    return <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0 }}><LinearProgress /></Box>;
  }
  if (!data) {
    return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  }
  return <Outlet />;
};

export default AuthGate;
