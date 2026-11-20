import { useNavigate } from 'react-router';
import { CircleHelp, Flag } from 'lucide-react';
import EpicChip from '@/components/EpicChip';
import EpicProgressBar from '@/components/EpicProgressBar';
import BlockedChip from '@/components/BlockedChip';
import type { TaskSummary } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import StatusChip from '@/components/StatusChip';
import TaskIdChip from '@/components/TaskIdChip';
import ActorChip from '@/components/ActorChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { paths } from '@/routes/paths';
import { PRIORITY_COLOR, PRIORITY_LABEL } from './status';

interface Props {
  rows: TaskSummary[];
  total: number;
  loading?: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** 跨项目列表显示项目列 */
  showProject?: boolean;
  /** 紧凑：嵌在卡片里（Epic 的步骤表）；去掉标签 / 提出人 / 反馈 / 更新列和所属 Epic chip */
  compact?: boolean;
}

// 任务表格：项目页与查询页共用；分页由调用方维护，这里只发出页码变化
const TaskTable = ({ rows, total, loading, page, pageSize, onPageChange, showProject = false, compact = false }: Props) => {
  const navigate = useNavigate();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFooter = !(compact && total <= pageSize);

  return (
    <Card className={cn('gap-0 overflow-hidden p-0 py-0', compact ? 'border-0 shadow-none' : 'border')}>
      <div className={cn(loading && 'pointer-events-none opacity-60')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-30">ID</TableHead>
              {showProject && <TableHead className="w-22">项目</TableHead>}
              <TableHead className="min-w-60">标题</TableHead>
              <TableHead className="w-28">状态</TableHead>
              <TableHead className="w-22">优先级</TableHead>
              {!compact && <TableHead className="w-45">标签</TableHead>}
              {!compact && <TableHead className="w-35">提出人</TableHead>}
              <TableHead className="w-35">执行人</TableHead>
              {!compact && <TableHead className="w-18 text-center">反馈</TableHead>}
              {!compact && <TableHead className="w-30">更新</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(paths.task(row.id))}>
                <TableCell><TaskIdChip id={row.id} /></TableCell>
                {showProject && <TableCell className="font-mono text-xs">{row.project_key}</TableCell>}
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    {row.kind === 'epic' && (
                      <Tooltip><TooltipTrigger asChild><Flag className="size-4 shrink-0 text-primary" /></TooltipTrigger><TooltipContent>Epic</TooltipContent></Tooltip>
                    )}
                    {row.open_question && (
                      <Tooltip><TooltipTrigger asChild><CircleHelp className="size-4 shrink-0 text-amber-600" /></TooltipTrigger><TooltipContent>Agent 有提问待回答</TooltipContent></Tooltip>
                    )}
                    {row.blocked && <BlockedChip />}
                    <span className={cn('min-w-0 truncate', row.kind === 'epic' ? 'font-bold' : 'font-medium')}>{row.title}</span>
                    {row.kind === 'epic' && row.progress && <EpicProgressBar progress={row.progress} width={140} />}
                    {!compact && row.epic && <EpicChip id={row.epic} />}
                  </div>
                </TableCell>
                <TableCell><StatusChip status={row.status} /></TableCell>
                <TableCell><SoftChip label={PRIORITY_LABEL[row.priority]} tone={PRIORITY_COLOR[row.priority]} /></TableCell>
                {!compact && (
                  <TableCell>
                    <div className="flex max-w-44 gap-1 overflow-hidden">
                      {row.labels.map((label) => <Badge key={label} variant="secondary" className="shrink-0">{label}</Badge>)}
                    </div>
                  </TableCell>
                )}
                {!compact && <TableCell><ActorChip name={row.created_by} kind={row.created_by_kind} /></TableCell>}
                <TableCell>{row.assignee ? <ActorChip name={row.assignee} kind={row.assignee_kind} /> : <span className="text-xs text-muted-foreground/70">—</span>}</TableCell>
                {!compact && <TableCell className="text-center">{row.feedback_count}</TableCell>}
                {!compact && <TableCell><RelativeTime value={row.updated_at} /></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-muted-foreground">没有任务</div>}
        {loading && rows.length === 0 && (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}
      </div>
      {showFooter && (
        <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
          <span>{total} 个任务 · 第 {page + 1} / {totalPages} 页</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 0 || loading} onClick={() => onPageChange(page - 1)}>上一页</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || loading} onClick={() => onPageChange(page + 1)}>下一页</Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default TaskTable;
