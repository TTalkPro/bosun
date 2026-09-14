import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';

// 登录 / 注册页的居中卡片
const AuthShell = ({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) => (
  <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>⚓ Bosun</Typography>
        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Stack>
      {children}
    </Paper>
  </Box>
);

export default AuthShell;
