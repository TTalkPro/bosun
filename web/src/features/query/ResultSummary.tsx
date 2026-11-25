import type { Priority, Status } from '@/api/types';
import ProjectMark from '@/components/ProjectMark';
import StatusBar from '@/features/dashboard/StatusBar';
import { PriorityIcon, StatusIcon } from '@/features/tasks/StatusIcon';
import { ALL_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from '@/features/tasks/status';
import type { QueryFacets } from '@/api/query';

interface Props {
  facets: QueryFacets;
  total: number;
  /** 点一项：在查询上追加该条件并运行 */
  onRefine: (clause: string) => void;
}

const Chip = ({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title: string }) => (
  <button type="button" onClick={onClick} title={title}
    className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs transition-colors hover:border-foreground/20 hover:bg-accent">
    {children}
  </button>
);

/**
 * 结果概览（整个结果集，不只是这一页）：状态分布条 + 状态 / 优先级 / 项目的计数。点一项 = 在查询上加
 * `AND 字段 = 值` 再运行（加在 ORDER BY 前，原条件含 OR 时加括号）。
 */
const ResultSummary = ({ facets, total, onRefine }: Props) => {
  const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, facets.by_status[s] ?? 0])) as Record<Status, number>;
  const statuses = ALL_STATUSES.filter((s) => byStatus[s] > 0);
  const priorities = (['high', 'medium', 'low'] as Priority[]).filter((p) => (facets.by_priority[p] ?? 0) > 0);
  const projects = Object.entries(facets.by_project).sort((a, b) => b[1] - a[1]);
  if (total === 0) return null;
  return (
    <div className="space-y-3 rounded-xl border bg-card px-4 py-3 shadow-xs">
      <StatusBar counts={byStatus} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">状态</span>
          {statuses.map((s) => (
            <Chip key={s} onClick={() => onRefine(`status = ${s}`)} title={`只看「${STATUS_LABEL[s]}」`}>
              <StatusIcon status={s} className="size-3.5" />{STATUS_LABEL[s]}<span className="tabular-nums text-muted-foreground">{byStatus[s]}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">优先级</span>
          {priorities.map((p) => (
            <Chip key={p} onClick={() => onRefine(`priority = ${p}`)} title={`只看${PRIORITY_LABEL[p]}优先级`}>
              <PriorityIcon priority={p} />{PRIORITY_LABEL[p]}<span className="tabular-nums text-muted-foreground">{facets.by_priority[p]}</span>
            </Chip>
          ))}
        </div>
        {projects.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs text-muted-foreground">项目</span>
            {projects.slice(0, 6).map(([k, n]) => (
              <Chip key={k} onClick={() => onRefine(`project = ${k}`)} title={`只看 ${k}`}>
                <ProjectMark projectKey={k} className="size-4 text-[9px]" /><span className="font-mono">{k}</span><span className="tabular-nums text-muted-foreground">{n}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultSummary;
