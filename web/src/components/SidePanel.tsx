import type { ReactNode } from 'react';
import { Box, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  title: ReactNode;
  /** 标题行右侧（如类型选择） */
  headerExtra?: ReactNode;
  /** 底部操作按钮 */
  actions?: ReactNode;
  onClose: () => void;
  /** 提交中：禁止关闭 */
  busy?: boolean;
  children: ReactNode;
}

// 右侧铺满高度的编辑面板：桌面占 2/3 宽，左边 1/3 仍能看到正在处理的任务 / 项目
const SidePanel = ({ title, headerExtra, actions, onClose, busy = false, children }: Props) => (
  <Drawer
    anchor="right"
    open
    onClose={busy ? undefined : onClose}
    // 顶栏是 drawer+1（压住左侧常驻导航），编辑面板要再高一级才能盖住顶栏
    sx={{ zIndex: (t) => t.zIndex.modal }}
    slotProps={{ backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.2)' } } }}
    PaperProps={{ sx: { width: { xs: '100%', md: '66.67vw' }, display: 'flex', flexDirection: 'column', boxShadow: 8 } }}
  >
    <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 3, py: 1.5, minHeight: 64 }}>
      <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }} noWrap>{title}</Typography>
      {headerExtra}
      <IconButton onClick={onClose} disabled={busy} aria-label="关闭" edge="end"><CloseIcon /></IconButton>
    </Stack>
    <Divider />
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2, display: 'flex', flexDirection: 'column' }}>
      {children}
    </Box>
    {actions && (
      <>
        <Divider />
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 3, py: 1.5 }}>{actions}</Stack>
      </>
    )}
  </Drawer>
);

export default SidePanel;
