import { Link } from 'react-router';
import { Bot, UserRound } from 'lucide-react';
import Section from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { openTasksQuery } from './queries';

const MAX_ROWS = 8;

interface Props {
  /** 执行人 → 未结任务数（全组织） */
  open: Record<string, number> | undefined;
  unassigned: number | undefined;
  kindOf: Record<string, 'human' | 'agent'>;
}

const Row = ({ name, n, max, icon, muted }: { name: string | null; n: number; max: number; icon: React.ReactNode; muted?: boolean }) => (
  <Link to={openTasksQuery(name)} className="group flex items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-accent/50">
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
    <span className={cn('w-28 shrink-0 truncate', muted && 'text-muted-foreground')} title={name ?? '未领取'}>{name ?? '未领取'}</span>
    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
      <span className={cn('block h-full rounded-full', muted ? 'bg-muted-foreground/40' : 'bg-primary')} style={{ width: `${(n / max) * 100}%` }} />
    </span>
    <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground group-hover:text-foreground">{n}</span>
  </Link>
);


/**
 * 团队负载（dashboard 的 Team 卡片）：人和 Agent 手上的未结任务数，从多到少，横条按最多的那个归一；
 * 「未领取」单独一行放最后。每行点进去是该执行人的未结任务查询。
 */
const TeamLoad = ({ open, unassigned, kindOf }: Props) => {
  const rows = Object.entries(open ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...rows.map(([, n]) => n), unassigned ?? 0);
  const shown = rows.slice(0, MAX_ROWS);
  const rest = rows.slice(MAX_ROWS);
  const total = rows.reduce((n, [, c]) => n + c, 0) + (unassigned ?? 0);

  return (
    <Section title="团队负载" description={open ? `全组织未结任务 ${total} 个（新建 / 进行中 / 待验收）` : ' '} bodyClassName="space-y-0.5 py-3">
      {!open ? <Skeleton className="h-40 w-full" /> : (
        <>
          {shown.map(([name, n]) => (
            <Row key={name} name={name} n={n} max={max} icon={kindOf[name] === 'agent' ? <Bot className="size-3.5" /> : <UserRound className="size-3.5" />} />
          ))}
          {rest.length > 0 && <p className="px-1 py-1 text-xs text-muted-foreground">另有 {rest.length} 位，共 {rest.reduce((n, [, c]) => n + c, 0)} 个</p>}
          {(unassigned ?? 0) > 0 && <Row name={null} n={unassigned ?? 0} max={max} icon={<UserRound className="size-3.5 opacity-50" />} muted />}
          {rows.length === 0 && !unassigned && <p className="py-4 text-center text-sm text-muted-foreground">没有未结任务</p>}
        </>
      )}
    </Section>
  );
};

export default TeamLoad;
