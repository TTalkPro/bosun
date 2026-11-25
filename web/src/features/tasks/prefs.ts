import { BOARD_SORTS, type BoardSort } from '@/features/board/rules';

// 项目页的个人偏好（存 localStorage）：项目页自己会随手记，账户页「外观与偏好」里也能直接改。

export type TasksView = 'board' | 'list';
const VIEW_KEY = 'bosun.tasks.view';
const SORT_KEY = 'bosun.board.sort';

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 隐私模式：只影响下次 */ } };

/** 项目页缺省视图（URL 里没写 view 时） */
export const storedView = (): TasksView => (read(VIEW_KEY) === 'list' ? 'list' : 'board');
export const rememberView = (v: TasksView) => write(VIEW_KEY, v);

/** 看板列内排序 */
export const storedSort = (): BoardSort => {
  const v = read(SORT_KEY);
  return (BOARD_SORTS as string[]).includes(v ?? '') ? (v as BoardSort) : 'priority';
};
export const rememberSort = (s: BoardSort) => write(SORT_KEY, s);
