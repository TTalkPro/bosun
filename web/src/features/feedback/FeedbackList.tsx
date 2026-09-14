import { type ReactElement, useState } from 'react';
import { Box, Button, Card, CardContent, Collapse, Link, Stack, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import HistoryIcon from '@mui/icons-material/History';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Feedback, FeedbackKind } from '@/api/types';
import MarkdownView from '@/components/markdown/MarkdownView';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import { ActorAvatar } from '@/components/ActorChip';
import { useMe } from '@/api/auth';
import { KIND_LABEL } from './kinds';

const ICON: Record<FeedbackKind, ReactElement> = {
  comment: <ChatBubbleOutlineIcon />,
  review: <RateReviewOutlinedIcon />,
  question: <HelpOutlineIcon />,
  answer: <QuestionAnswerOutlinedIcon />,
};

const KIND_TONE: Record<FeedbackKind, 'default' | 'secondary' | 'warning' | 'success'> = {
  comment: 'default',
  review: 'secondary',
  question: 'warning',
  answer: 'success',
};


const short = (id: string) => `#${id.split('#')[1] ?? id}`;
const MONO = '"JetBrains Mono", Menlo, Consolas, monospace';

const Header = ({ f, open, onEdit, dimmed }: { f: Feedback; open: boolean; onEdit?: (f: Feedback) => void; dimmed?: boolean }) => {
  // 只有当前身份写的条目能修订（后端也会按 author 校验）
  const me = useMe().data?.user.name;
  return (
  <Stack direction="row" alignItems="center" sx={{ minHeight: 28, opacity: dimmed ? 0.6 : 1 }} useFlexGap flexWrap="wrap" rowGap={0.5}>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mr: 'auto' }}>
      <ActorAvatar name={f.author} />
      <Typography variant="subtitle2" sx={{ lineHeight: 1 }}>{f.author}</Typography>
      <SoftChip icon={ICON[f.kind]} label={KIND_LABEL[f.kind]} tone={KIND_TONE[f.kind]} />
      {open && <SoftChip label="待回答" tone="warning" sx={{ fontWeight: 700 }} />}
      {f.supersedes && (
        <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <HistoryIcon sx={{ fontSize: 14 }} /> 修订自 <Link href={`#fb-${f.supersedes}`} underline="hover" sx={{ fontFamily: MONO }}>{short(f.supersedes)}</Link>
        </Typography>
      )}
    </Stack>
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: MONO, lineHeight: 1 }}>{f.id}</Typography>
      <RelativeTime value={f.created_at} sx={{ lineHeight: 1 }} />
      {f.status === 'active' && f.author === me && onEdit && (
        <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => onEdit(f)} sx={{ py: 0, minHeight: 24 }}>修订</Button>
      )}
    </Stack>
  </Stack>
  );
};

// 作废的版本：折叠成一行，点开才看内容（线索完整但不占地方）
const SupersededCard = ({ f }: { f: Feedback }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card id={`fb-${f.id}`} variant="outlined" sx={{ borderStyle: 'dashed', bgcolor: 'transparent' }}>
      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer', color: 'text.secondary' }} onClick={() => setExpanded((v) => !v)}>
          <ExpandMoreIcon fontSize="small" sx={{ transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
          <SoftChip label="作废" tone="default" />
          <Typography variant="caption" sx={{ fontFamily: MONO }}>{f.id}</Typography>
          <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0, textDecoration: 'line-through' }}>{f.content.replace(/\s+/g, ' ').slice(0, 80)}</Typography>
          <Typography variant="caption">已被 <Link href={`#fb-${f.superseded_by}`} underline="hover" sx={{ fontFamily: MONO }} onClick={(e) => e.stopPropagation()}>{short(f.superseded_by!)}</Link> 替代</Typography>
        </Stack>
        <Collapse in={expanded}>
          <Box sx={{ mt: 1, pl: 3.5, opacity: 0.7 }}>
            <Header f={f} open={false} dimmed />
            <Box sx={{ mt: 1 }}><MarkdownView markdown={f.content} /></Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

const FeedbackCard = ({ f, open, onEdit }: { f: Feedback; open: boolean; onEdit?: (f: Feedback) => void }) => (
  <Card
    id={`fb-${f.id}`}
    variant="outlined"
    sx={{
      bgcolor: open ? 'rgba(255, 193, 7, 0.08)' : undefined,
      borderColor: open ? 'warning.main' : undefined,
    }}
  >
    <CardContent sx={{ '&:last-child': { pb: 2 } }}>
      <Box sx={{ mb: 1.25 }}><Header f={f} open={open} onEdit={onEdit} /></Box>
      <MarkdownView markdown={f.content} />
    </CardContent>
  </Card>
);

const FeedbackList = ({ feedback, onEdit }: { feedback: Feedback[]; onEdit?: (f: Feedback) => void }) => {
  if (!feedback.length) {
    return <Typography variant="body2" color="text.disabled">还没有 Feedback</Typography>;
  }
  const active = feedback.filter((f) => f.status === 'active');
  const last = active[active.length - 1];
  return (
    <Stack spacing={1.5}>
      {feedback.map((f) =>
        f.status === 'superseded'
          ? <SupersededCard key={f.id} f={f} />
          : <FeedbackCard key={f.id} f={f} open={f === last && f.kind === 'question'} onEdit={onEdit} />,
      )}
    </Stack>
  );
};

export default FeedbackList;
