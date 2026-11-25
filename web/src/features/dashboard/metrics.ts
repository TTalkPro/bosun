import type { StatCounts, StatsOverview } from '@/api/stats';
import type { Status } from '@/api/types';

/** 最近 n 天与再往前 n 天的合计（daily 最早在前） */
export const windowSums = (daily: StatsOverview['daily'], key: 'created' | 'completed', n = 7) => {
  const values = daily.map((d) => d[key]);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return { current: sum(values.slice(-n)), previous: sum(values.slice(-2 * n, -n)) };
};

/** 环比；上期为 0 时没有百分比可言 */
export const percentChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

/** 纵轴上限取「好看」的偶数（中线刻度 = 上限 / 2 也是整数），且至少 4（空图也有刻度） */
export const niceMax = (max: number): number => {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 4, 6, 8, 10].find((m) => m * pow >= max && (m * pow) % 2 === 0) ?? 10;
  return step * pow;
};

const EMPTY_STATUS: Record<Status, number> = { NEW: 0, IN_PROGRESS: 0, DONE: 0, VERIFIED: 0, REJECTED: 0, CANCELLED: 0 };

/** 只把看得见的项目加起来（页面上「显示已归档」关着时，卡片数字不该算归档项目） */
export const sumCounts = (list: StatCounts[]): StatCounts => list.reduce<StatCounts>((acc, c) => ({
  by_status: Object.fromEntries(Object.entries(acc.by_status).map(([s, n]) => [s, n + (c.by_status[s as Status] ?? 0)])) as Record<Status, number>,
  total: acc.total + c.total,
  open: acc.open + c.open,
  epics: acc.epics + c.epics,
  blocked: acc.blocked + c.blocked,
  open_questions: acc.open_questions + c.open_questions,
  by_assignee: Object.entries(c.by_assignee ?? {}).reduce((m, [k, n]) => ({ ...m, [k]: (m[k] ?? 0) + n }), acc.by_assignee),
  unassigned: acc.unassigned + (c.unassigned ?? 0),
  open_by_assignee: Object.entries(c.open_by_assignee ?? {}).reduce((m, [k, n]) => ({ ...m, [k]: (m[k] ?? 0) + n }), acc.open_by_assignee),
  open_unassigned: acc.open_unassigned + (c.open_unassigned ?? 0),
  by_priority: {
    high: acc.by_priority.high + (c.by_priority?.high ?? 0),
    medium: acc.by_priority.medium + (c.by_priority?.medium ?? 0),
    low: acc.by_priority.low + (c.by_priority?.low ?? 0),
  },
}), { by_status: { ...EMPTY_STATUS }, total: 0, open: 0, epics: 0, blocked: 0, open_questions: 0, by_assignee: {}, unassigned: 0, by_priority: { high: 0, medium: 0, low: 0 }, open_by_assignee: {}, open_unassigned: 0 });
