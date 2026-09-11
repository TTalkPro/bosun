import { Timeline, TimelineConnector, TimelineContent, TimelineDot, TimelineItem, TimelineOppositeContent, TimelineSeparator } from '@mui/lab';
import { Chip, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { HistoryEntry } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import StatusChip from '@/components/StatusChip';
import ActorChip from '@/components/ActorChip';
import { STATUS_COLOR } from '@/features/tasks/status';

// TimelineDot 的 color 是 'grey' 而不是 'default'
const dotColor = (s: HistoryEntry['to']): 'info' | 'primary' | 'warning' | 'success' | 'error' | 'grey' =>
  STATUS_COLOR[s] === 'default' ? 'grey' : STATUS_COLOR[s];

const HistoryTimeline = ({ history }: { history: HistoryEntry[] }) => (
  <Timeline sx={{ p: 0, m: 0, '& .MuiTimelineOppositeContent-root': { flex: '0 0 auto', pl: 0, pr: 1.5, whiteSpace: 'nowrap' } }}>
    {history.map((h, i) => (
      <TimelineItem key={`${h.at}-${i}`}>
        <TimelineOppositeContent sx={{ pt: 1 }}>
          <RelativeTime value={h.at} />
        </TimelineOppositeContent>
        <TimelineSeparator>
          <TimelineDot color={dotColor(h.to)} variant={h.from ? 'filled' : 'outlined'} />
          {i < history.length - 1 && <TimelineConnector />}
        </TimelineSeparator>
        <TimelineContent sx={{ pb: 2.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            {h.from ? (
              <>
                <StatusChip status={h.from} sx={{ opacity: 0.6 }} />
                <Typography variant="body2" color="text.secondary">→</Typography>
                <StatusChip status={h.to} />
              </>
            ) : (
              <Typography variant="body2">创建</Typography>
            )}
            <ActorChip name={h.actor} size={18} />
          </Stack>
          {h.comment && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{h.comment}</Typography>}
          {h.commits?.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
              {h.commits.map((c) => <Chip key={c} size="small" variant="outlined" label={c.slice(0, 10)} title={c} sx={{ fontFamily: '"JetBrains Mono", Menlo, monospace' }} />)}
            </Stack>
          )}
          {h.tests && (
            <Stack sx={{ mt: 0.5, color: h.tests.passed ? 'success.main' : 'error.main' }}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                {h.tests.passed ? <CheckCircleOutlineIcon sx={{ fontSize: 16 }} /> : <ErrorOutlineIcon sx={{ fontSize: 16 }} />}
                <Typography variant="caption">{h.tests.passed ? '测试通过' : '测试未通过'}{h.tests.summary ? ` · ${h.tests.summary}` : ''}</Typography>
              </Stack>
              {h.tests.command && (
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"JetBrains Mono", Menlo, monospace', wordBreak: 'break-all', pl: 2.5 }}>{h.tests.command}</Typography>
              )}
            </Stack>
          )}
        </TimelineContent>
      </TimelineItem>
    ))}
  </Timeline>
);

export default HistoryTimeline;
