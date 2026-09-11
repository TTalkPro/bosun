import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/routes/paths';

const NotFoundPage = ({ message = '页面不存在' }: { message?: string }) => (
  <Stack alignItems="center" spacing={2} sx={{ py: 10 }}>
    <Typography variant="h4">404</Typography>
    <Typography color="text.secondary">{message}</Typography>
    <Button component={RouterLink} to={paths.projects} variant="outlined">返回项目列表</Button>
  </Stack>
);

export default NotFoundPage;
