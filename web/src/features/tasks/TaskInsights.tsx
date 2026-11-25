import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import dayjs from 'dayjs';
import { Check, CircleCheck, CircleHelp, CircleX, Copy, FlaskConical, GitCommitVertical, Lock, RotateCcw } from 'lucide-react';
import type { HistoryEntry, Status, Task } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import { openQuestionOf } from '@/features/feedback/kinds';
import Section from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';
import { StatusIcon } from './StatusIcon';
import { STATUS_LABEL } from './status';

/* 任务详情页的几块「看一眼就懂」的概览：进度条步骤、需要注意的事、交付证据。 */

const MAIN: Status[] = ['NEW', 'IN_PROGRESS', 'DONE', 'VERIFIED'];

// 接口给的 history 是新的在前；先倒成时间顺序再按时间稳定排序：同一毫秒里的「开始」「完成」两条，排完仍是完成在后
const chrono = (history: HistoryEntry[]) => [...history].reverse().sort((a, b) => a.at.localeCompare(b.at));

const lastTo = (history: HistoryEntry[], to: Status) => {
  for (let i = history.length - 1; i >= 0; i--) if (history[i].to === to) return history[i];
  return undefined;
};

/** 已在当前状态多久：「3 天」「2 小时」 */
const since = (at: string) => dayjs(at).fromNow(true);

/**
 * 状态进度：新建 → 进行中 → 已完成 → 已验收 四步，每步写上最近一次到达的时间和人；
 * 当前步高亮并写「已持续 X」；拒绝 / 撤销时在末尾加一个终止步，主线没走到的步变灰。
 */
export const StatusStepper = ({ task }: { task: Task }) => {
  const { status } = task;
  const history = chrono(task.history);
  const terminal = status === 'REJECTED' || status === 'CANCELLED';
  const terminalEntry = terminal ? lastTo(history, status) : undefined;
  // 终止时：主线走到了哪一步 = 终止前的那个状态
  const cur = terminal ? MAIN.indexOf(terminalEntry?.from ?? 'NEW') : MAIN.indexOf(status);
  const reworks = history.filter((h) => h.from === 'DONE' && h.to === 'IN_PROGRESS').length
    + history.filter((h) => h.from === 'VERIFIED' && h.to === 'IN_PROGRESS').length;
  const currentEntry = lastTo(history, status);

  const steps = MAIN.map((s, i) => ({ s, i, entry: i <= cur ? lastTo(history, s) : undefined }));

  return (
    <Section
      title="进度"
      description={
        <>
          当前「{STATUS_LABEL[status]}」{currentEntry && <>，已持续 {since(currentEntry.at)}</>}
          {history.length > 0 && <>；共 {history.length} 次状态变更</>}
        </>
      }
      action={reworks > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <RotateCcw className="size-3.5" />打回 {reworks} 次
        </span>
      ) : undefined}
      bodyClassName="px-5 py-5"
    >
      <ol className={cn('grid gap-3', terminal ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
        {steps.map(({ s, i, entry }) => {
          const done = !terminal ? i < cur : i <= cur;
          const current = !terminal && i === cur;
          return (
            <li key={s} className="relative min-w-0">
              {/* 连接线 */}
              <div className={cn('mb-3 h-1 rounded-full', done || current ? (current ? 'bg-primary' : 'bg-emerald-500') : 'bg-muted')} />
              <div className={cn('flex items-center gap-1.5 text-sm font-medium', !(done || current) && 'text-muted-foreground')}>
                {done
                  ? <span className="flex size-4.5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="size-3" strokeWidth={3} /></span>
                  : <StatusIcon status={s} className={cn('size-4.5', !current && 'opacity-50')} />}
                {STATUS_LABEL[s]}
                {current && <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">当前</span>}
              </div>
              <div className="mt-1 min-h-8 text-xs text-muted-foreground">
                {entry ? (
                  <>
                    <div className="truncate"><span className="text-foreground">{entry.actor}</span></div>
                    <RelativeTime value={entry.at} />
                  </>
                ) : <span className="opacity-60">—</span>}
              </div>
            </li>
          );
        })}
        {terminal && (
          <li className="relative min-w-0">
            <div className={cn('mb-3 h-1 rounded-full', status === 'REJECTED' ? 'bg-destructive' : 'bg-muted-foreground/50')} />
            <div className={cn('flex items-center gap-1.5 text-sm font-medium', status === 'REJECTED' ? 'text-destructive' : 'text-muted-foreground')}>
              <StatusIcon status={status} className="size-4.5" />{STATUS_LABEL[status]}
            </div>
            <div className="mt-1 min-h-8 text-xs text-muted-foreground">
              {terminalEntry ? (
                <>
                  <div className="truncate"><span className="text-foreground">{terminalEntry.actor}</span>{terminalEntry.comment && <>：{terminalEntry.comment}</>}</div>
                  <RelativeTime value={terminalEntry.at} />
                </>
              ) : '—'}
            </div>
          </li>
        )}
      </ol>
    </Section>
  );
};

/**
 * 需要注意的事：被依赖挡住（列出挡路的任务，解释为什么「开始」按不了）、有提问待回答（一键跳过去回答）。
 * 都没有就不渲染。
 */
export const AttentionBanners = ({ task, onAnswer }: { task: Task; onAnswer: (feedbackId: string) => void }) => {
  const blockers = task.blocked
    ? task.links.filter((l) => l.type === 'depends_on' && l.direction === 'out' && l.status !== 'DONE' && l.status !== 'VERIFIED')
    : [];
  const question = task.open_question ? openQuestionOf(task.feedback) : undefined;
  if (!blockers.length && !question) return null;

  return (
    <div className={cn('grid gap-3', blockers.length > 0 && question && 'md:grid-cols-2')}>
      {blockers.length > 0 && (
        <div role="status" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Lock className="size-4" /></span>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-sm font-semibold">被依赖挡住，暂时不能开始</div>
              <p className="text-xs text-muted-foreground">下面的任务完成（已完成或已验收）后才能开始这个任务</p>
            </div>
            <ul className="space-y-1">
              {blockers.map((l) => (
                <li key={l.task}>
                  <RouterLink to={paths.task(l.task)} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-background/70">
                    {l.status && <StatusIcon status={l.status} className="size-3.5 shrink-0" />}
                    <span className="font-mono text-xs">{l.task}</span>
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    {l.status && <span className="text-xs text-muted-foreground">{STATUS_LABEL[l.status]}</span>}
                  </RouterLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {question && (
        <div role="status" className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400"><CircleHelp className="size-4" /></span>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-sm font-semibold">有提问待回答</div>
              <p className="text-xs text-muted-foreground"><span className="text-foreground">{question.author}</span> 提问 · <RelativeTime value={question.created_at} /></p>
            </div>
            <p className="line-clamp-2 rounded-md bg-background/70 px-2.5 py-1.5 text-sm">{question.content}</p>
            <Button size="sm" variant="outline" className="h-7" onClick={() => onAnswer(question.id)}>去回答</Button>
          </div>
        </div>
      )}
    </div>
  );
};

const CopyHash = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip><TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="复制提交 hash"
        onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </TooltipTrigger><TooltipContent>{copied ? '已复制' : '复制'}</TooltipContent></Tooltip>
  );
};

/** 交付：最近一次测试证据 + 全部提交。都没有就不渲染 */
export const DeliveryCard = ({ task }: { task: Task }) => {
  const history = chrono(task.history);
  let tested: HistoryEntry | undefined;
  for (let i = history.length - 1; i >= 0; i--) if (history[i].tests) { tested = history[i]; break; }
  if (!tested && task.commits.length === 0) return null;
  const tests = tested?.tests;

  return (
    <Section title="交付" count={task.commits.length || undefined} description="完成 / 验收时记录的证据" bodyClassName="space-y-4 py-4">
      {tests && tested && (
        <div className={cn('rounded-lg border p-3', tests.passed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5')}>
          <div className={cn('flex items-center gap-1.5 text-sm font-medium', tests.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
            {tests.passed ? <CircleCheck className="size-4" /> : <CircleX className="size-4" />}
            {tests.passed ? '测试通过' : '测试未通过'}
            {tests.summary && <span className="font-normal text-muted-foreground">· {tests.summary}</span>}
          </div>
          {tests.command && (
            <code className="mt-2 flex items-center gap-1.5 truncate rounded bg-background/80 px-2 py-1 font-mono text-xs" title={tests.command}>
              <FlaskConical className="size-3.5 shrink-0 text-muted-foreground" />{tests.command}
            </code>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="text-foreground">{tested.actor}</span> 在「{STATUS_LABEL[tested.to]}」时记录 · <RelativeTime value={tested.at} />
          </div>
        </div>
      )}
      {task.commits.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">提交</div>
          {task.commits.map((c) => (
            <div key={c} className="flex items-center gap-2 text-sm">
              <GitCommitVertical className="size-4 shrink-0 text-muted-foreground" />
              <code className="min-w-0 flex-1 truncate font-mono text-xs" title={c}>{c}</code>
              <CopyHash value={c} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};
