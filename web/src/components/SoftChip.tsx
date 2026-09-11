import { Chip, type ChipProps, alpha, useTheme } from '@mui/material';

type Tone = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

// 淡底色标签：底色 = 主色 12%，文字 / 图标 = 主色深一档；比描边 chip 更轻，比实心 chip 更安静
const SoftChip = ({ tone = 'default', sx, ...rest }: Omit<ChipProps, 'color' | 'variant'> & { tone?: Tone }) => {
  const theme = useTheme();
  const main = tone === 'default' ? theme.palette.text.secondary : theme.palette[tone].main;
  const fg = tone === 'default' ? theme.palette.text.primary : theme.palette[tone].dark;
  return (
    <Chip
      size="small"
      {...rest}
      sx={{
        bgcolor: alpha(main, 0.12),
        color: fg,
        border: 'none',
        '& .MuiChip-icon': { color: fg },
        ...(theme.applyStyles('dark', { color: main, '& .MuiChip-icon': { color: main } }) as object),
        ...sx,
      }}
    />
  );
};

export default SoftChip;
