import { describe, expect, it } from 'vitest';
import type { Status, TaskSummary } from '@/api/types';
import { assigneesOf, canMove, compareTasks, EMPTY_BOARD_FILTER, isBoardFilterActive, matchesBoardFilter, readBoardFilter, UNASSIGNED, writeBoardFilter } from '@/features/board/rules';
import { ALL_STATUSES, nextStatuses } from '@/features/tasks/status';

const task = (status: Status, blocked = false): TaskSummary => ({
  id: 'BOS-1', project_key: 'BOS', seq: 1, title: 't', status, priority: 'medium', labels: [],
  created_by: 'user', created_by_kind: 'human', assignee: null, assignee_kind: null, commits: [],
  kind: 'task', epic: null, progress: null, blocked, feedback_count: 0, open_question: false,
  created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z',
});

describe('kanban drop rules', () => {
  it('allows exactly the state-machine targets', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(canMove(task(from), to)).toBe(nextStatuses(from).includes(to));
      }
    }
  });

  it('blocked tasks cannot be started but can still be rejected or cancelled', () => {
    expect(canMove(task('NEW', true), 'IN_PROGRESS')).toBe(false);
    expect(canMove(task('NEW', true), 'REJECTED')).toBe(true);
    expect(canMove(task('NEW', true), 'CANCELLED')).toBe(true);
    // 已经在做的被阻塞任务照常流转
    expect(canMove(task('IN_PROGRESS', true), 'DONE')).toBe(true);
  });
});


const t2 = (over: Partial<TaskSummary>): TaskSummary => ({ ...task('NEW'), ...over });

describe('kanban sort', () => {
  const a = t2({ id: 'A', seq: 1, priority: 'low', updated_at: '2026-11-25T03:00:00Z', created_at: '2026-11-20T00:00:00Z' });
  const b = t2({ id: 'B', seq: 2, priority: 'high', updated_at: '2026-11-24T00:00:00Z', created_at: '2026-11-22T00:00:00Z' });
  const c = t2({ id: 'C', seq: 3, priority: 'high', updated_at: '2026-11-25T01:00:00Z', created_at: '2026-11-21T00:00:00Z' });
  const ids = (sort: Parameters<typeof compareTasks>[0]) => [a, b, c].sort(compareTasks(sort)).map((x) => x.id);
  it('orders by each key', () => {
    expect(ids('priority')).toEqual(['C', 'B', 'A']);   // 高优先级在前，同级按最近更新
    expect(ids('updated')).toEqual(['A', 'C', 'B']);
    expect(ids('created')).toEqual(['B', 'C', 'A']);
    expect(ids('seq')).toEqual(['A', 'B', 'C']);
  });
});

describe('kanban filter', () => {
  const mine = t2({ assignee: 'alice', priority: 'high' });
  const free = t2({ assignee: null, priority: 'low', blocked: true });
  it('matches assignee (incl. unassigned), priority and attention', () => {
    expect(matchesBoardFilter(mine, EMPTY_BOARD_FILTER)).toBe(true);
    expect(matchesBoardFilter(mine, { ...EMPTY_BOARD_FILTER, who: ['alice'] })).toBe(true);
    expect(matchesBoardFilter(free, { ...EMPTY_BOARD_FILTER, who: ['alice'] })).toBe(false);
    expect(matchesBoardFilter(free, { ...EMPTY_BOARD_FILTER, who: [UNASSIGNED] })).toBe(true);
    expect(matchesBoardFilter(mine, { ...EMPTY_BOARD_FILTER, priority: ['low'] })).toBe(false);
    expect(matchesBoardFilter(mine, { ...EMPTY_BOARD_FILTER, attention: true })).toBe(false);
    expect(matchesBoardFilter(free, { ...EMPTY_BOARD_FILTER, attention: true })).toBe(true);
    expect(isBoardFilterActive(EMPTY_BOARD_FILTER)).toBe(false);
  });

  it('round-trips through the URL, keeping other params and odd names', () => {
    const sp = new URLSearchParams('view=board&status=NEW');
    const f = { who: ['a,b', UNASSIGNED], priority: ['high' as const], attention: true };
    const out = writeBoardFilter(sp, f);
    expect(out.get('view')).toBe('board');
    expect(out.get('status')).toBe('NEW');
    expect(readBoardFilter(new URLSearchParams(out.toString()))).toEqual(f);
    expect(writeBoardFilter(out, EMPTY_BOARD_FILTER).toString()).toBe('view=board&status=NEW');
    expect(readBoardFilter(new URLSearchParams('pri=high,bogus')).priority).toEqual(['high']);
  });

  it('lists assignees by workload', () => {
    const list = assigneesOf([t2({ assignee: 'bob' }), t2({ assignee: 'alice' }), t2({ assignee: 'bob' }), t2({ assignee: null })]);
    expect(list.map((x) => [x.name, x.count])).toEqual([['bob', 2], ['alice', 1]]);
  });
});
