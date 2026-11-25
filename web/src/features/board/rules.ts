import type { Priority, Status, TaskSummary } from '@/api/types';
import { nextStatuses } from '@/features/tasks/status';

/** 状态机允许、且被阻塞的任务不能从 NEW 开始（后端同样会拒） */
export const canMove = (task: TaskSummary, to: Status): boolean =>
  task.status !== to && nextStatuses(task.status).includes(to) && !(task.blocked && task.status === 'NEW' && to === 'IN_PROGRESS');

// ---- 看板的排序与筛选（项目页工具条用；只在前端，对已拉回来的任务生效） ----

export type BoardSort = 'priority' | 'updated' | 'created' | 'seq';
export const BOARD_SORTS: BoardSort[] = ['priority', 'updated', 'created', 'seq'];
export const SORT_LABEL: Record<BoardSort, string> = { priority: '优先级', updated: '最近更新', created: '最新创建', seq: '编号' };

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** 列内排序；相等时按编号，顺序稳定 */
export const compareTasks = (sort: BoardSort) => (a: TaskSummary, b: TaskSummary): number => {
  const tie = a.seq - b.seq;
  switch (sort) {
    case 'priority': return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.updated_at.localeCompare(a.updated_at) || tie;
    case 'updated': return b.updated_at.localeCompare(a.updated_at) || tie;
    case 'created': return b.created_at.localeCompare(a.created_at) || tie;
    case 'seq': return tie;
  }
};

/** 执行人筛选里代表「未领取」的值（真名不会以 ~ 开头被当成它：只有这个精确值） */
export const UNASSIGNED = '~none';

export interface BoardFilter {
  /** 执行人名；UNASSIGNED = 未领取。空 = 不筛 */
  who: string[];
  priority: Priority[];
  /** 只看被阻塞或有提问待回答的 */
  attention: boolean;
}

export const EMPTY_BOARD_FILTER: BoardFilter = { who: [], priority: [], attention: false };

export const isBoardFilterActive = (f: BoardFilter): boolean => f.who.length > 0 || f.priority.length > 0 || f.attention;

export const matchesBoardFilter = (t: TaskSummary, f: BoardFilter): boolean =>
  (f.who.length === 0 || f.who.includes(t.assignee ?? UNASSIGNED))
  && (f.priority.length === 0 || f.priority.includes(t.priority))
  && (!f.attention || t.blocked || t.open_question);

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
// 名字里可能有逗号：逐个 encodeURIComponent 再用逗号连
export const readBoardFilter = (sp: URLSearchParams): BoardFilter => ({
  who: (sp.get('who') ?? '').split(',').filter(Boolean).map(decodeURIComponent),
  priority: (sp.get('pri') ?? '').split(',').filter((p): p is Priority => (PRIORITIES as string[]).includes(p)),
  attention: sp.get('attn') === '1',
});

export const writeBoardFilter = (sp: URLSearchParams, f: BoardFilter): URLSearchParams => {
  const next = new URLSearchParams(sp);
  if (f.who.length) next.set('who', f.who.map(encodeURIComponent).join(',')); else next.delete('who');
  if (f.priority.length) next.set('pri', f.priority.join(',')); else next.delete('pri');
  if (f.attention) next.set('attn', '1'); else next.delete('attn');
  return next;
};

/** 工具条上的执行人：按手上任务数从多到少（同数按名字） */
export const assigneesOf = (tasks: TaskSummary[]): { name: string; kind: TaskSummary['assignee_kind']; count: number }[] => {
  const m = new Map<string, { name: string; kind: TaskSummary['assignee_kind']; count: number }>();
  for (const t of tasks) {
    if (!t.assignee) continue;
    const e = m.get(t.assignee) ?? { name: t.assignee, kind: t.assignee_kind, count: 0 };
    e.count += 1;
    m.set(t.assignee, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};
