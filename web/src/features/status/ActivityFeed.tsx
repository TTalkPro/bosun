import type { ReactNode } from 'react';
import { ArrowRightLeft, Milestone as MilestoneIcon } from 'lucide-react';
import type { Feedback, HistoryEntry, MilestoneLogEntry } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import { ActorAvatar } from '@/components/ActorChip';
import { FeedbackEntry } from '@/features/feedback/FeedbackList';
import { openQuestionOf } from '@/features/feedback/kinds';
import { HistoryBody } from './HistoryTimeline';

type Item = { kind: 'history'; at: string; h: HistoryEntry } | { kind: 'feedback'; at: string; f: Feedback }
  | { kind: 'milestone'; at: string; m: MilestoneLogEntry };

// 一条归属变更：「david 把任务从 0.1.4 移到 0.2」+ 原因
const MilestoneBody = ({ m }: { m: MilestoneLogEntry }) => (
  <div className="text-sm">
    <span className="font-medium">{m.actor}</span>
    <span className="text-muted-foreground">
      {!m.from ? <> 排进了 </> : !m.to ? <> 把任务移出 <b className="font-medium text-foreground">{m.from_name ?? m.from}</b>，放回</> : <> 把任务从 <b className="font-medium text-foreground">{m.from_name ?? m.from}</b> 移到 </>}
    </span>
    <b className="font-medium">{m.to ? m.to_name ?? m.to : '待规划'}</b>
    <span className="mx-1.5 text-muted-foreground/50">·</span><RelativeTime value={m.at} />
    {m.comment && <p className="mt-1.5 rounded-md bg-muted/50 px-3 py-1.5 text-sm">{m.comment}</p>}
  </div>
);

interface Props {
  history: HistoryEntry[];
  feedback: Feedback[];
  /** milestone 归属变更（14 D7）；不传就不显示 */
  milestoneLog?: MilestoneLogEntry[];
  onEditFeedback?: (f: Feedback) => void;
  /** 接在最后的输入框 */
  footer?: ReactNode;
}

/**
 * 合并动态流（dashboard 任务详情的 Activity）：状态变化与 Feedback 按时间先后交错，像一段对话从上往下读，
 * 输入框接在最后。状态变化是一行系统消息（小图标），Feedback 是卡片（带作者头像）。
 */
const ActivityFeed = ({ history, feedback, milestoneLog = [], onEditFeedback, footer }: Props) => {
  const open = openQuestionOf(feedback);
  const items: Item[] = [
    ...history.map((h) => ({ kind: 'history' as const, at: h.at, h })),
    ...feedback.map((f) => ({ kind: 'feedback' as const, at: f.created_at, f })),
    ...milestoneLog.map((m) => ({ kind: 'milestone' as const, at: m.at, m })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === b.kind ? 0 : a.kind === 'feedback' ? 1 : b.kind === 'feedback' ? -1 : 0));

  return (
    <ol className="m-0 list-none p-0">
      {items.map((it, i) => (
        <li key={it.kind === 'feedback' ? `f-${it.f.id}` : `${it.kind}-${it.at}-${i}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            {it.kind === 'history'
              ? <span className="flex size-7 items-center justify-center rounded-full border bg-muted"><ArrowRightLeft className="size-3.5 text-muted-foreground" /></span>
              : it.kind === 'milestone'
                ? <span className="flex size-7 items-center justify-center rounded-full border bg-muted"><MilestoneIcon className="size-3.5 text-muted-foreground" /></span>
                : <ActorAvatar name={it.f.author} size={28} />}
            {(i < items.length - 1 || footer) && <span className="my-1 w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pb-5 pt-1">
            {it.kind === 'history'
              ? <HistoryBody h={it.h} />
              : it.kind === 'milestone'
                ? <MilestoneBody m={it.m} />
                : <div className="-mt-1"><FeedbackEntry f={it.f} open={it.f === open} onEdit={onEditFeedback} /></div>}
          </div>
        </li>
      ))}
      {footer && <li className="flex gap-3"><div className="w-7 shrink-0" /><div className="min-w-0 flex-1">{footer}</div></li>}
    </ol>
  );
};

export default ActivityFeed;
