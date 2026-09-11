import { createTheme } from '@mui/material/styles';

// 参考 aurora 的观感（圆角卡片、柔和分隔线、Inter 字体族），用 MUI CSS
// variables 模式做明暗切换：<html data-mui-color-scheme="dark">
const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#3b6ef5' },
        background: { default: '#f5f7fb', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#7aa2ff' },
        background: { default: '#0f1218', paper: '#171b23' },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'].join(','),
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { styleOverrides: { root: ({ theme: t }) => ({ border: `1px solid ${t.vars.palette.divider}` }) } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    // 小号 chip 统一成「标签」观感：方一点的圆角、更矮、图标缩小并留出左边距，
    // 避免图标顶着圆角像被切掉
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
        sizeSmall: {
          height: 22,
          borderRadius: 6,
          fontSize: 12,
          '& .MuiChip-label': { paddingLeft: 8, paddingRight: 8 },
          '& .MuiChip-icon': { fontSize: 14, marginLeft: 7, marginRight: -3 },
          '& .MuiChip-deleteIcon': { fontSize: 15, marginRight: 4 },
        },
      },
    },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: 'md' } },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});

export default theme;
