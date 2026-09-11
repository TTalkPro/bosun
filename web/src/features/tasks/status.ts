import type { Priority, Status } from '@/api/types';

// 与 designs/03-task-status.md 的迁移表保持一致（后端 bosun_task_status:allowed/2）
const TRANSITIONS: Record<Status, Status[]> = {
  NEW: ['IN_PROGRESS', 'REJECTED', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'REJECTED', 'CANCELLED'],
  DONE: ['IN_PROGRESS', 'VERIFIED'],
  VERIFIED: ['IN_PROGRESS'],
  REJECTED: ['NEW'],
  CANCELLED: ['NEW'],
};

export const ALL_STATUSES: Status[] = ['NEW', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'REJECTED', 'CANCELLED'];

export const nextStatuses = (from: Status): Status[] => TRANSITIONS[from];

// 主路径（向前）实心按钮；其余（打回 / 重开 / 拒绝 / 重新提交）描边并要求说明
export const isForward = (from: Status, to: Status): boolean =>
  (from === 'NEW' && to === 'IN_PROGRESS') ||
  (from === 'IN_PROGRESS' && to === 'DONE') ||
  (from === 'DONE' && to === 'VERIFIED');

export const STATUS_LABEL: Record<Status, string> = {
  NEW: '新建',
  IN_PROGRESS: '进行中',
  DONE: '已完成',
  VERIFIED: '已验收',
  REJECTED: '已拒绝',
  CANCELLED: '已撤销',
};

export type StatusColor = 'info' | 'primary' | 'warning' | 'success' | 'error' | 'default';
export const STATUS_COLOR: Record<Status, StatusColor> = {
  NEW: 'info',
  IN_PROGRESS: 'primary',
  DONE: 'warning',
  VERIFIED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
};

export const transitionLabel = (from: Status, to: Status): string => {
  if (from === 'NEW' && to === 'IN_PROGRESS') return '开始';
  if (from === 'IN_PROGRESS' && to === 'DONE') return '完成';
  if (from === 'DONE' && to === 'VERIFIED') return '验收';
  if (from === 'DONE' && to === 'IN_PROGRESS') return '打回';
  if (from === 'VERIFIED' && to === 'IN_PROGRESS') return '重新打开';
  if (to === 'REJECTED') return '拒绝';
  if (from === 'REJECTED' && to === 'NEW') return '重新提交';
  if (to === 'CANCELLED') return '撤销';
  if (from === 'CANCELLED' && to === 'NEW') return '恢复';
  return `→ ${STATUS_LABEL[to]}`;
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: '低', medium: '中', high: '高' };
export const PRIORITY_COLOR: Record<Priority, 'default' | 'info' | 'error'> = {
  low: 'default',
  medium: 'info',
  high: 'error',
};

// 路由参数 / 搜索框输入归一：bos-12 → BOS-12
export const normalizeId = (raw: string): string => raw.trim().toUpperCase();
export const isTaskId = (raw: string): boolean => /^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$/.test(normalizeId(raw));
