import dayjs from 'dayjs';
import type { Milestone, MilestoneStatus } from '@/api/types';

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  planning: '规划中',
  active: '进行中',
  released: '已发布',
};

/** 状态徽章的配色（与任务状态的色系对齐：进行中 = 主色，已发布 = 绿） */
export const MILESTONE_STATUS_CLASS: Record<MilestoneStatus, string> = {
  planning: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  active: 'border-primary/30 bg-primary/10 text-primary',
  released: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

/** 看板 / 列表的范围：某个 milestone、待规划、或（只有列表）全部 */
export type Scope = { kind: 'milestone'; id: string } | { kind: 'backlog' } | { kind: 'all' };

export const BACKLOG = 'backlog';
export const ALL = 'all';

/**
 * URL 上的 m 参数 → 范围。写了就听 URL（all / backlog / milestone id）；
 * 没写时：要看板 → 进行中的那个，没有就待规划；要列表 → 全部。
 * 看板只在范围是某个 milestone 时提供（全部 / 待规划只有列表），由页面决定实际视图。
 */
export const resolveScope = (m: string | null, view: 'board' | 'list', activeId: string | undefined): Scope => {
  if (m === BACKLOG) return { kind: 'backlog' };
  if (m === ALL) return { kind: 'all' };
  if (m) return { kind: 'milestone', id: m.toUpperCase() };
  if (view === 'list') return { kind: 'all' };
  return activeId ? { kind: 'milestone', id: activeId } : { kind: 'backlog' };
};

/** 给任务列表接口的 milestone 参数 */
export const scopeQuery = (s: Scope): string | undefined =>
  s.kind === 'milestone' ? s.id : s.kind === 'backlog' ? BACKLOG : undefined;

/** 目标日期 → 「还剩 3 天」「今天到期」「已超期 2 天」；没写 / 已发布 → null */
export const dueText = (m: Pick<Milestone, 'target_date' | 'status'>, today = dayjs()): { text: string; overdue: boolean } | null => {
  if (!m.target_date || m.status === 'released') return null;
  const days = dayjs(m.target_date).startOf('day').diff(today.startOf('day'), 'day');
  if (days > 0) return { text: `还剩 ${days} 天`, overdue: false };
  if (days === 0) return { text: '今天到期', overdue: false };
  return { text: `已超期 ${-days} 天`, overdue: true };
};

/** 「12/01 – 12/20」「目标 12/20」 */
export const dateRange = (m: Pick<Milestone, 'start_date' | 'target_date'>): string | null => {
  const f = (d: string) => dayjs(d).format('MM/DD');
  if (m.start_date && m.target_date) return `${f(m.start_date)} – ${f(m.target_date)}`;
  if (m.target_date) return `目标 ${f(m.target_date)}`;
  if (m.start_date) return `${f(m.start_date)} 开始`;
  return null;
};

/** 可以把任务加进去的（规划中 / 进行中），进行中在前 */
export const assignable = (ms: Milestone[]): Milestone[] =>
  ms.filter((m) => m.status !== 'released').sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0));
