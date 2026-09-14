import { createBrowserRouter, Navigate } from 'react-router';
import AuthGate from '@/components/AuthGate';
import MainLayout from '@/layouts/MainLayout';
import ProjectsPage from '@/pages/ProjectsPage';
import ProjectTasksPage from '@/pages/ProjectTasksPage';
import TaskDetailPage from '@/pages/TaskDetailPage';
import NotFoundPage from '@/pages/NotFoundPage';
import QueryPage from '@/pages/QueryPage';
import DataPage from '@/pages/DataPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import AccountPage from '@/pages/AccountPage';
import OrgPage from '@/pages/OrgPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    // 其余全部要登录
    element: <AuthGate />,
    children: [
      {
        path: '/',
        element: <MainLayout />,
        children: [
          { index: true, element: <Navigate to="/projects" replace /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:key', element: <ProjectTasksPage /> },
          { path: 'tasks/:id', element: <TaskDetailPage /> },
          { path: 'query', element: <QueryPage /> },
          { path: 'data', element: <DataPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'org', element: <OrgPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export default router;
