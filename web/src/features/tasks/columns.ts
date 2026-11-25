import { useCallback, useSyncExternalStore } from 'react';

// 任务表格的可选列（ID、标题始终显示）。顺序 = 表格里的顺序
export type ColumnKey = 'project' | 'status' | 'priority' | 'milestone' | 'labels' | 'created_by' | 'assignee' | 'feedback' | 'updated';

export const COLUMN_LABEL: Record<ColumnKey, string> = {
  project: '项目',
  status: '状态',
  priority: '优先级',
  milestone: 'Milestone',
  labels: '标签',
  created_by: '提出人',
  assignee: '执行人',
  feedback: '反馈',
  updated: '更新',
};

/** 这张表实际可切换的列：页面据此渲染 ColumnsMenu */
export const tableColumns = ({ showProject = false, compact = false }: { showProject?: boolean; compact?: boolean }): ColumnKey[] =>
  compact
    ? [...(showProject ? ['project' as const] : []), 'status', 'priority', 'assignee']
    : [...(showProject ? ['project' as const] : []), 'status', 'priority', 'milestone', 'labels', 'created_by', 'assignee', 'feedback', 'updated'];

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_KEY = 'bosun.tasks.pageSize';

// localStorage 上的小 store：同一个键的多个组件、别的标签页改了都能跟上
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener('storage', l);
  return () => { listeners.delete(l); window.removeEventListener('storage', l); };
};
const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* 隐私模式：只影响下次 */ } emit(); };

const parseHidden = (raw: string | null): ColumnKey[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((k): k is ColumnKey => k in COLUMN_LABEL) : [];
  } catch {
    return [];
  }
};

/** 隐藏的列（存 localStorage[storageKey]，缺省全显示） */
export const useHiddenColumns = (storageKey: string) => {
  // 快照用原始字符串，引用稳定；解析放在外面
  const raw = useSyncExternalStore(subscribe, () => read(storageKey));
  const hidden = parseHidden(raw);
  const setHidden = useCallback((next: ColumnKey[]) => write(storageKey, JSON.stringify(next)), [storageKey]);
  return [hidden, setHidden] as const;
};

export const normalizePageSize = (n: number): number =>
  (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;

/** 记住的每页行数（URL 上没写 size 时用） */
export const storedPageSize = (): number => normalizePageSize(Number(read(PAGE_SIZE_KEY)));
export const rememberPageSize = (n: number) => write(PAGE_SIZE_KEY, String(normalizePageSize(n)));

/** 分页按钮上要显示的页码（0 起），省略处为 null：1 … 4 5 6 … 20 */
export const pageWindow = (page: number, totalPages: number): (number | null)[] => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const set = new Set([0, totalPages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < totalPages));
  if (page <= 2) [1, 2, 3].forEach((p) => set.add(p));
  if (page >= totalPages - 3) [totalPages - 4, totalPages - 3, totalPages - 2].forEach((p) => set.add(p));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    const gap = i > 0 ? p - sorted[i - 1] : 1;
    // 只差一页时直接列出来：「1 … 3」里的省略号只藏了一个 2，不如不省
    if (gap === 2) out.push(p - 1);
    else if (gap > 2) out.push(null);
    out.push(p);
  });
  return out;
};
