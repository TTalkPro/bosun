import useSWR, { mutate } from 'swr';
import { fetcher } from './client';
import type { Priority, Status } from './types';

export interface StatCounts {
  /** 六个状态都有，没有就是 0 */
  by_status: Record<Status, number>;
  total: number;
  /** NEW + IN_PROGRESS + DONE */
  open: number;
  epics: number;
  /** 未结任务里被依赖挡住的 */
  blocked: number;
  /** 未结任务里最新一条有效反馈是提问的 */
  open_questions: number;
  /** 执行人 → 任务数（不含未领取） */
  by_assignee: Record<string, number>;
  unassigned: number;
  by_priority: Record<Priority, number>;
  /** 只数未结（NEW / IN_PROGRESS / DONE）的执行人 → 任务数 */
  open_by_assignee: Record<string, number>;
  open_unassigned: number;
}

export interface StatsOverview {
  days: number;
  tz_offset: number;
  /** 按项目 key；含归档项目 */
  projects: Record<string, StatCounts>;
  totals: StatCounts;
  /** 最早一天在前；completed = 迁移到 DONE 的次数 */
  daily: { date: string; created: number; completed: number }[];
}

// 按浏览器时区分天；一分钟刷一次（统计不需要实时）。给了 project 只统计该项目（daily 也是）。
// 不用 keepPreviousData：切项目时不能先显示上一个项目的数字
export const useStats = (days = 14, project?: string) =>
  useSWR<StatsOverview>(
    `/stats?days=${days}&tz=${-new Date().getTimezoneOffset()}${project ? `&project=${encodeURIComponent(project)}` : ''}`,
    fetcher,
    { refreshInterval: 60000 },
  );

/** 拖动 / 迁移后让统计跟上，不等一分钟 */
export const refreshStats = () => mutate((k) => typeof k === 'string' && k.startsWith('/stats?'));
