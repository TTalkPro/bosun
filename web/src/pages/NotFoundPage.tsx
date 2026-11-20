import { Link as RouterLink } from 'react-router';
import { Button } from '@/components/ui/button';

const NotFoundPage = ({ message = '页面不存在' }: { message?: string }) => (
  <div className="flex flex-col items-center gap-4 py-16"><h1 className="text-4xl font-bold">404</h1><p className="text-muted-foreground">{message}</p><Button variant="outline" asChild><RouterLink to="/projects">返回项目列表</RouterLink></Button></div>
);
export default NotFoundPage;
