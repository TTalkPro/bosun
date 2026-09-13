import { Box, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import type { EpicProgress } from '@/api/types';
import { STATUS_LABEL } from '@/features/tasks/status';

// Epic 进度条：已完成 / 总数（DONE、VERIFIED 都算完成）；tooltip 列各状态数量
const EpicProgressBar = ({ progress, width = 120, showText = true }: { progress: EpicProgress; width?: number | string; showText?: boolean }) => {
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const detail = Object.entries(progress.by_status).map(([s, n]) => `${STATUS_LABEL[s as keyof typeof STATUS_LABEL]} ${n}`).join(' · ') || '还没有步骤';
  return (
    <Tooltip title={detail}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ width, minWidth: 0 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress variant="determinate" value={pct} color={pct === 100 ? 'success' : 'primary'} sx={{ height: 6, borderRadius: 3 }} />
        </Box>
        {showText && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{progress.done}/{progress.total}</Typography>}
      </Stack>
    </Tooltip>
  );
};

export default EpicProgressBar;
