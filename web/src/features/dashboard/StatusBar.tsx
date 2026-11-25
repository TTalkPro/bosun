import type { Status } from '@/api/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusIcon } from '@/features/tasks/StatusIcon';
import { ALL_STATUSES, STATUS_BAR, STATUS_LABEL } from '@/features/tasks/status';

/**
 * 项目卡片上的状态分布条：一个整体按状态切段，宽度与数量成比例，数量为 0 的段不画；
 * 段与段之间 2px 空隙分开（不描边）。颜色只是辅助，具体数字在悬停提示里，带图标和文字。
 */
const StatusBar = ({ counts }: { counts: Record<Status, number> }) => {
  const total = ALL_STATUSES.reduce((n, s) => n + counts[s], 0);
  const parts = ALL_STATUSES.filter((s) => counts[s] > 0);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img"
          aria-label={total ? parts.map((s) => `${STATUS_LABEL[s]} ${counts[s]}`).join('，') : '没有任务'}>
          {parts.map((s) => (
            <span key={s} className={STATUS_BAR[s]} style={{ flexGrow: counts[s], flexBasis: 0 }} />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent className="min-w-36">
        {total === 0 ? '没有任务' : (
          <div className="space-y-1 py-0.5">
            {parts.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <StatusIcon status={s} className="size-3.5" />
                <span className="flex-1">{STATUS_LABEL[s]}</span>
                <span className="tabular-nums">{counts[s]}</span>
              </div>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export default StatusBar;
