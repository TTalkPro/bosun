import { CheckCircle, XCircle } from 'lucide-react';
import type { HistoryEntry } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import StatusChip from '@/components/StatusChip';
import ActorChip from '@/components/ActorChip';
import { Badge } from '@/components/ui/badge';

const dotClass: Record<HistoryEntry['to'], string> = {
  NEW: 'border-sky-600 text-sky-600',
  IN_PROGRESS: 'border-primary bg-primary text-primary-foreground',
  DONE: 'border-amber-600 bg-amber-600 text-white',
  VERIFIED: 'border-emerald-600 bg-emerald-600 text-white',
  REJECTED: 'border-destructive bg-destructive text-white',
  CANCELLED: 'border-muted-foreground text-muted-foreground',
};

const HistoryTimeline = ({ history }: { history: HistoryEntry[] }) => (
  <ol className="m-0 list-none p-0">
    {history.map((h, i) => (
      <li key={`${h.at}-${i}`} className="flex gap-3">
        <div className="w-16 shrink-0 whitespace-nowrap pt-1">
          <RelativeTime value={h.at} />
        </div>
        <div className="flex flex-col items-center">
          <span className={`flex size-4 items-center justify-center rounded-full border-2 ${dotClass[h.to]}`} />
          {i < history.length - 1 && <span className="w-px flex-1 bg-border" />}
        </div>
        <div className="min-w-0 flex-1 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            {h.from ? (
              <>
                <span className="opacity-60"><StatusChip status={h.from} /></span>
                <span className="text-sm text-muted-foreground">→</span>
                <StatusChip status={h.to} />
              </>
            ) : (
              <span className="text-sm">创建</span>
            )}
            <ActorChip name={h.actor} size={18} />
          </div>
          {h.comment && <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{h.comment}</p>}
          {h.commits?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {h.commits.map((c) => <Badge key={c} variant="outline" className="font-mono" title={c}>{c.slice(0, 10)}</Badge>)}
            </div>
          )}
          {h.tests && (
            <div className={`mt-1.5 ${h.tests.passed ? 'text-emerald-600' : 'text-destructive'}`}>
              <div className="flex items-center gap-1.5">
                {h.tests.passed ? <CheckCircle className="size-4" /> : <XCircle className="size-4" />}
                <p className="text-xs">{h.tests.passed ? '测试通过' : '测试未通过'}{h.tests.summary ? ` · ${h.tests.summary}` : ''}</p>
              </div>
              {h.tests.command && (
                <p className="mt-0.5 break-all pl-5 font-mono text-xs text-muted-foreground">{h.tests.command}</p>
              )}
            </div>
          )}
        </div>
      </li>
    ))}
  </ol>
);

export default HistoryTimeline;
