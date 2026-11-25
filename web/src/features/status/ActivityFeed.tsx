import type { ReactNode } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import type { Feedback, HistoryEntry } from '@/api/types';
import { ActorAvatar } from '@/components/ActorChip';
import { FeedbackEntry } from '@/features/feedback/FeedbackList';
import { openQuestionOf } from '@/features/feedback/kinds';
import { HistoryBody } from './HistoryTimeline';

type Item = { kind: 'history'; at: string; h: HistoryEntry } | { kind: 'feedback'; at: string; f: Feedback };

interface Props {
  history: HistoryEntry[];
  feedback: Feedback[];
  onEditFeedback?: (f: Feedback) => void;
  /** 接在最后的输入框 */
  footer?: ReactNode;
}

/**
 * 合并动态流（dashboard 任务详情的 Activity）：状态变化与 Feedback 按时间先后交错，像一段对话从上往下读，
 * 输入框接在最后。状态变化是一行系统消息（小图标），Feedback 是卡片（带作者头像）。
 */
const ActivityFeed = ({ history, feedback, onEditFeedback, footer }: Props) => {
  const open = openQuestionOf(feedback);
  const items: Item[] = [
    ...history.map((h) => ({ kind: 'history' as const, at: h.at, h })),
    ...feedback.map((f) => ({ kind: 'feedback' as const, at: f.created_at, f })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === b.kind ? 0 : a.kind === 'history' ? -1 : 1));

  return (
    <ol className="m-0 list-none p-0">
      {items.map((it, i) => (
        <li key={it.kind === 'history' ? `h-${it.at}-${i}` : `f-${it.f.id}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            {it.kind === 'history'
              ? <span className="flex size-7 items-center justify-center rounded-full border bg-muted"><ArrowRightLeft className="size-3.5 text-muted-foreground" /></span>
              : <ActorAvatar name={it.f.author} size={28} />}
            {(i < items.length - 1 || footer) && <span className="my-1 w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pb-5 pt-1">
            {it.kind === 'history'
              ? <HistoryBody h={it.h} />
              : <div className="-mt-1"><FeedbackEntry f={it.f} open={it.f === open} onEdit={onEditFeedback} /></div>}
          </div>
        </li>
      ))}
      {footer && <li className="flex gap-3"><div className="w-7 shrink-0" /><div className="min-w-0 flex-1">{footer}</div></li>}
    </ol>
  );
};

export default ActivityFeed;
