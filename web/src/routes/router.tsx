import { createBrowserRouter, Navigate } from 'react-router';
import MainLayout from '@/layouts/MainLayout';
import ProjectsPage from '@/pages/ProjectsPage';
import ProjectTasksPage from '@/pages/ProjectTasksPage';
import TaskDetailPage from '@/pages/TaskDetailPage';
import NotFoundPage from '@/pages/NotFoundPage';
import QueryPage from '@/pages/QueryPage';
import DataPage from '@/pages/DataPage';

const router = createBrowserRouter([
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
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export default router;
