import { CheckCircle, GitCommitVertical, XCircle } from 'lucide-react';
import type { HistoryEntry } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import { ActorAvatar } from '@/components/ActorChip';
import { StatusIcon } from '@/features/tasks/StatusIcon';
import { STATUS_LABEL, STATUS_TEXT, transitionLabel } from '@/features/tasks/status';
import { cn } from '@/lib/utils';

const StatusName = ({ status }: { status: HistoryEntry['to'] }) => (
  <span className="inline-flex items-center gap-1 font-medium text-foreground"><StatusIcon status={status} className="size-3.5" />{STATUS_LABEL[status]}</span>
);

/** 一条状态历史的正文（谁 做了什么 · 何时 + 备注 / 提交 / 测试）；合并动态流也用它 */
export const HistoryBody = ({ h }: { h: HistoryEntry }) => (
  <>
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{h.actor}</span>
      {h.from ? (
        <>
          <span className={cn('font-medium', STATUS_TEXT[h.to])}>{transitionLabel(h.from, h.to)}</span>
          <span>了任务：</span>
          <StatusName status={h.from} />
          <span>→</span>
          <StatusName status={h.to} />
        </>
      ) : (
        <span>创建了任务</span>
      )}
      <span className="text-muted-foreground/50">·</span>
      <RelativeTime value={h.at} />
    </div>
    {h.comment && <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm">{h.comment}</p>}
    {h.commits?.length > 0 && (
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {h.commits.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs" title={c}><GitCommitVertical className="size-3.5 text-muted-foreground" />{c.slice(0, 10)}</span>
        ))}
      </div>
    )}
    {h.tests && (
      <div className="mt-1.5 rounded-md border px-3 py-2">
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', h.tests.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
          {h.tests.passed ? <CheckCircle className="size-3.5" /> : <XCircle className="size-3.5" />}
          {h.tests.passed ? '测试通过' : '测试未通过'}
          {h.tests.summary && <span className="font-normal text-muted-foreground">· {h.tests.summary}</span>}
        </div>
        {h.tests.command && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">$ {h.tests.command}</p>}
      </div>
    )}
  </>
);

// 状态历史（dashboard 活动流的写法）：左侧头像串成一条竖线，右侧「谁 做了什么 · 何时」，
// 备注 / 提交 / 测试证据缩进在下面。最新的在上（history 本来就是倒序）
const HistoryTimeline = ({ history }: { history: HistoryEntry[] }) => (
  <ol className="m-0 list-none p-0">
    {history.map((h, i) => (
      <li key={`${h.at}-${i}`} className="flex gap-3">
        <div className="flex flex-col items-center">
          <ActorAvatar name={h.actor} size={28} />
          {i < history.length - 1 && <span className="my-1 w-px flex-1 bg-border" />}
        </div>
        <div className="min-w-0 flex-1 pb-6 pt-1"><HistoryBody h={h} /></div>
      </li>
    ))}
  </ol>
);

export default HistoryTimeline;
