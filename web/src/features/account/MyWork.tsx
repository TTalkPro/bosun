import { Link, useNavigate } from 'react-router';
import { CircleCheckBig, CircleHelp, Inbox, Send, type LucideIcon } from 'lucide-react';
import { useQuery } from '@/api/query';
import RelativeTime from '@/components/RelativeTime';
import Section from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { quoteValue } from '@/features/query/bql';
import { PriorityIcon, StatusIcon } from '@/features/tasks/StatusIcon';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';

const OPEN = 'status IN (NEW, IN_PROGRESS, DONE)';
const toQuery = (q: string) => `${paths.query}?q=${encodeURIComponent(q)}`;

const Tile = ({ label, icon: Icon, value, hint, q, warn }: { label: string; icon: LucideIcon; value: number | undefined; hint: string; q: string; warn?: boolean }) => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(toQuery(q))} title="在 BQL 查询里查看"
      className={cn('rounded-lg border bg-card px-4 py-3 text-left shadow-xs transition-colors hover:border-foreground/15 hover:bg-accent/40',
        warn && !!value && 'border-amber-500/50 bg-amber-500/5')}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}<Icon className={cn('size-4', warn && !!value && 'text-amber-600 dark:text-amber-400')} />
      </div>
      {value === undefined ? <Skeleton className="mt-1 h-7 w-10" /> : <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>}
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
};

/**
 * 「我的工作」（dashboard 个人主页的概览）：四个数字 + 我负责的未结任务前 5 条。
 * 全是 BQL 查询（按显示名匹配执行人 / 提出人，跨项目），点一下就带着同样的查询去查询页。
 */
const MyWork = ({ name }: { name: string }) => {
  const who = quoteValue(name);
  const mineQ = `assignee = ${who} AND ${OPEN} ORDER BY priority DESC, updated DESC`;
  const reportedQ = `reporter = ${who} AND ${OPEN}`;
  const waitingQ = `reporter = ${who} AND question = true`;
  const doneQ = `assignee = ${who} AND status IN (DONE, VERIFIED) AND updated >= -30d`;
  const { data: mine } = useQuery(mineQ, 5, 0);
  const { data: reported } = useQuery(reportedQ, 1, 0);
  const { data: waiting } = useQuery(waitingQ, 1, 0);
  const { data: done } = useQuery(doneQ, 1, 0);

  return (
    <Section title="我的工作" description="跨项目，按你的显示名匹配执行人 / 提出人；点数字去查询页看全部"
      action={<Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link to={toQuery(mineQ)}>全部我负责的</Link></Button>}
      bodyClassName="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="我负责的未结" icon={Inbox} value={mine?.total} hint="新建 / 进行中 / 待验收" q={mineQ} />
        <Tile label="我提出的未结" icon={Send} value={reported?.total} hint="等别人做完、等我验收" q={reportedQ} />
        <Tile label="等我回答" icon={CircleHelp} value={waiting?.total} hint="我提的任务上有提问" q={waitingQ} warn />
        <Tile label="近 30 天完成" icon={CircleCheckBig} value={done?.total} hint="我负责、已完成或已验收" q={doneQ} />
      </div>
      {mine && mine.tasks.length > 0 && (
        <div className="divide-y rounded-lg border">
          {mine.tasks.map((t) => (
            <Link key={t.id} to={paths.task(t.id)} className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent/50">
              <StatusIcon status={t.status} />
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{t.id}</span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <PriorityIcon priority={t.priority} />
              <RelativeTime value={t.updated_at} className="w-16 shrink-0 text-right text-xs text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
      {mine && mine.tasks.length === 0 && <p className="text-sm text-muted-foreground">手上没有未结的任务。</p>}
    </Section>
  );
};

export default MyWork;
