import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '@/api/auth';
import { Progress } from '@/components/ui/progress';

const AuthGate = () => {
  const { data, error, isLoading } = useMe();
  const { pathname, search } = useLocation();
  if (isLoading || (!data && !error)) {
    return <div className="fixed inset-x-0 top-0 z-50"><Progress aria-label="加载中" /></div>;
  }
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  return <Outlet />;
};
export default AuthGate;
