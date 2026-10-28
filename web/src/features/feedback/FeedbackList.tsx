import { useState, type ReactNode } from 'react';
import { MessageCircle, ChevronDown, CircleHelp, History, MessageSquareText, Pencil, CircleCheck } from 'lucide-react';
import type { Feedback, FeedbackKind } from '@/api/types';
import MarkdownView from '@/components/markdown/MarkdownView';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import { ActorAvatar } from '@/components/ActorChip';
import { useMe } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { KIND_LABEL } from './kinds';

const ICON: Record<FeedbackKind, ReactNode> = {
  comment: <MessageCircle />,
  review: <MessageSquareText />,
  question: <CircleHelp />,
  answer: <CircleCheck />,
};

const KIND_TONE: Record<FeedbackKind, 'default' | 'secondary' | 'warning' | 'success'> = {
  comment: 'default',
  review: 'secondary',
  question: 'warning',
  answer: 'success',
};


const short = (id: string) => `#${id.split('#')[1] ?? id}`;
const Header = ({ f, open, onEdit, dimmed }: { f: Feedback; open: boolean; onEdit?: (f: Feedback) => void; dimmed?: boolean }) => {
  // 只有当前身份写的条目能修订（后端也会按 author 校验）
  const me = useMe().data?.user.name;
  return (
  <div className={cn('flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1.5', dimmed && 'opacity-60')}>
    <div className="mr-auto flex flex-wrap items-center gap-2">
      <ActorAvatar name={f.author} />
      <span className="text-sm font-semibold leading-none">{f.author}</span>
      <SoftChip icon={ICON[f.kind]} label={KIND_LABEL[f.kind]} tone={KIND_TONE[f.kind]} />
      {open && <SoftChip label="待回答" tone="warning" className="font-bold" />}
      {f.supersedes && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <History className="size-3.5" /> 修订自 <a className="font-mono hover:underline" href={`#fb-${f.supersedes}`}>{short(f.supersedes)}</a>
        </span>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-xs leading-none text-muted-foreground">{f.id}</span>
      <RelativeTime value={f.created_at} className="leading-none" />
      {f.status === 'active' && f.author === me && onEdit && (
        <Button variant="ghost" size="sm" className="h-6 px-2 py-0" onClick={() => onEdit(f)}><Pencil />修订</Button>
      )}
    </div>
  </div>
  );
};

// 作废的版本：折叠成一行，点开才看内容（线索完整但不占地方）
const SupersededCard = ({ f }: { f: Feedback }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card id={`fb-${f.id}`} className="gap-0 border-dashed bg-transparent p-3 py-3">
      <CardContent className="p-0">
        <div className="flex min-w-0 cursor-pointer items-center gap-2 text-muted-foreground" onClick={() => setExpanded((v) => !v)}>
          <ChevronDown className={cn('size-4 shrink-0 transition-transform', !expanded && '-rotate-90')} />
          <SoftChip label="作废" tone="default" />
          <span className="font-mono text-xs">{f.id}</span>
          <span className="min-w-0 flex-1 truncate text-xs line-through">{f.content.replace(/\s+/g, ' ').slice(0, 80)}</span>
          <span className="text-xs">已被 <a className="font-mono hover:underline" href={`#fb-${f.superseded_by}`} onClick={(e) => e.stopPropagation()}>{short(f.superseded_by!)}</a> 替代</span>
        </div>
        {expanded && (
          <div className="mt-2 pl-4 opacity-70">
            <Header f={f} open={false} dimmed />
            <div className="mt-2"><MarkdownView markdown={f.content} /></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const FeedbackCard = ({ f, open, onEdit }: { f: Feedback; open: boolean; onEdit?: (f: Feedback) => void }) => (
  <Card
    id={`fb-${f.id}`}
    className={cn('gap-0 border p-3 py-3', open && 'border-amber-500/60 bg-amber-500/8')}
  >
    <CardContent className="p-0">
      <div className="mb-2"><Header f={f} open={open} onEdit={onEdit} /></div>
      <MarkdownView markdown={f.content} />
    </CardContent>
  </Card>
);

const FeedbackList = ({ feedback, onEdit }: { feedback: Feedback[]; onEdit?: (f: Feedback) => void }) => {
  if (!feedback.length) {
    return <p className="text-sm text-muted-foreground/70">还没有 Feedback</p>;
  }
  const active = feedback.filter((f) => f.status === 'active');
  const last = active[active.length - 1];
  return (
    <div className="space-y-3">
      {feedback.map((f) =>
        f.status === 'superseded'
          ? <SupersededCard key={f.id} f={f} />
          : <FeedbackCard key={f.id} f={f} open={f === last && f.kind === 'question'} onEdit={onEdit} />,
      )}
    </div>
  );
};

export default FeedbackList;
