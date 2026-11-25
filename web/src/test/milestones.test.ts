import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import type { Milestone } from '@/api/types';
import { assignable, dateRange, dueText, resolveScope, scopeQuery, visibleReleased } from '@/features/milestones/meta';

const ms = (over: Partial<Milestone>): Milestone => ({
  id: 'BOS-M1', project_key: 'BOS', seq: 1, name: '0.1', description: '', status: 'planning',
  start_date: null, target_date: null, released_at: null, summary: null, created_by: 'david',
  created_at: '', updated_at: '',
  counts: { total: 0, scope: 0, open: 0, in_progress: 0, done: 0, verified: 0, pending_verify: 0, rejected: 0, cancelled: 0, percent: 0, epics: 0, epics_done: 0 },
  ...over,
});

describe('milestone scope', () => {
  it('看板默认看进行中的，没有就看待规划；列表默认全部', () => {
    expect(resolveScope(null, 'board', 'BOS-M2')).toEqual({ kind: 'milestone', id: 'BOS-M2' });
    expect(resolveScope(null, 'board', undefined)).toEqual({ kind: 'backlog' });
    expect(resolveScope(null, 'list', 'BOS-M2')).toEqual({ kind: 'all' });
  });
  it('URL 上写了就听 URL（不管要的是看板还是列表）', () => {
    expect(resolveScope('bos-m3', 'board', 'BOS-M2')).toEqual({ kind: 'milestone', id: 'BOS-M3' });
    expect(resolveScope('backlog', 'list', 'BOS-M2')).toEqual({ kind: 'backlog' });
    expect(resolveScope('backlog', 'board', 'BOS-M2')).toEqual({ kind: 'backlog' });
    expect(resolveScope('all', 'list', 'BOS-M2')).toEqual({ kind: 'all' });
    expect(resolveScope('all', 'board', 'BOS-M2')).toEqual({ kind: 'all' });
  });
  it('范围 → 接口参数', () => {
    expect(scopeQuery({ kind: 'milestone', id: 'BOS-M1' })).toBe('BOS-M1');
    expect(scopeQuery({ kind: 'backlog' })).toBe('backlog');
    expect(scopeQuery({ kind: 'all' })).toBeUndefined();
  });
});

describe('milestone dates', () => {
  const today = dayjs('2026-12-10T15:00:00');
  it('剩余天数按自然日算', () => {
    expect(dueText(ms({ target_date: '2026-12-13' }), today)).toEqual({ text: '还剩 3 天', overdue: false });
    expect(dueText(ms({ target_date: '2026-12-10' }), today)).toEqual({ text: '今天到期', overdue: false });
    expect(dueText(ms({ target_date: '2026-12-08' }), today)).toEqual({ text: '已超期 2 天', overdue: true });
  });
  it('没写日期或已发布不显示', () => {
    expect(dueText(ms({}), today)).toBeNull();
    expect(dueText(ms({ target_date: '2026-12-08', status: 'released' }), today)).toBeNull();
  });
  it('日期范围', () => {
    expect(dateRange(ms({ start_date: '2026-12-01', target_date: '2026-12-20' }))).toBe('12/01 – 12/20');
    expect(dateRange(ms({ target_date: '2026-12-20' }))).toBe('目标 12/20');
    expect(dateRange(ms({}))).toBeNull();
  });
});

describe('assignable', () => {
  it('只列规划中 / 进行中，进行中在前', () => {
    const list = assignable([
      ms({ id: 'A', status: 'planning' }), ms({ id: 'B', status: 'released' }), ms({ id: 'C', status: 'active' }),
    ]);
    expect(list.map((m) => m.id)).toEqual(['C', 'A']);
  });
});

describe('release helpers', () => {
  const task = (over: Partial<import('@/api/types').TaskSummary>): import('@/api/types').TaskSummary => ({
    id: 'BOS-1', project_key: 'BOS', seq: 1, title: 't', status: 'NEW', priority: 'medium', labels: [],
    created_by: 'david', created_by_kind: 'human', assignee: null, assignee_kind: null, commits: [], kind: 'task',
    epic: null, milestone: 'BOS-M2', milestone_name: '0.1.4', progress: null, blocked: false, feedback_count: 0,
    open_question: false, created_at: '', updated_at: '', ...over,
  });

  it('燃尽：理想线从第一天的剩余降到目标日 0，之后没有；今天以后没有实际值', async () => {
    const { burndownSeries } = await import('@/features/milestones/release');
    const daily = ['12-01', '12-02', '12-03', '12-04', '12-05'].map((d, i) => ({ date: `2026-${d}`, created: 0, completed: 0, remaining: i < 3 ? 4 - i : null }));
    const { actual, ideal } = burndownSeries(daily, '2026-12-04');
    expect(actual).toEqual([4, 3, 2, null, null]);
    expect(ideal[4]).toBeNull();
    [4, 8 / 3, 4 / 3, 0].forEach((v, i) => expect(ideal[i]).toBeCloseTo(v));
    expect(burndownSeries(daily, null).ideal.every((v) => v === null)).toBe(true);
    expect(burndownSeries(daily, '2026-11-30').ideal.every((v) => v === null)).toBe(true);
  });

  it('结转缺省去向：目标日期最近的规划中；没有就待规划', async () => {
    const { defaultCarryTarget } = await import('@/features/milestones/release');
    const cur = ms({ id: 'BOS-M2', status: 'active' });
    expect(defaultCarryTarget([cur, ms({ id: 'BOS-M3', seq: 3, target_date: '2027-01-31' }), ms({ id: 'BOS-M4', seq: 4, target_date: '2026-12-31' })], cur)).toBe('BOS-M4');
    expect(defaultCarryTarget([cur, ms({ id: 'BOS-M1', status: 'released' })], cur)).toBe('backlog');
  });

  it('发布说明：按 Epic 分组，Epic 外的归其它，没做完的不列', async () => {
    const { releaseNotes } = await import('@/features/milestones/release');
    const notes = releaseNotes(ms({ name: '0.1.4' }), [
      task({ id: 'BOS-2', seq: 2, title: '发布范围', kind: 'epic', status: 'IN_PROGRESS' }),
      task({ id: 'BOS-3', seq: 3, title: '后端', epic: 'BOS-2', status: 'VERIFIED' }),
      task({ id: 'BOS-4', seq: 4, title: '前端', epic: 'BOS-2', status: 'IN_PROGRESS' }),
      task({ id: 'BOS-6', seq: 6, title: '大写锁定', status: 'DONE' }),
    ], { 'BOS-2': '发布范围' }, dayjs('2026-12-05'));
    expect(notes).toBe([
      '## 0.1.4（2026-12-05）', '', '交付 2 项。',
      '', '### 发布范围（BOS-2）', '', '- 后端（BOS-3）',
      '', '### 其它', '', '- 大写锁定（BOS-6）', '',
    ].join('\n'));
  });
});

describe('visibleReleased（切换器里的已发布）', () => {
  // 接口顺序：已发布按发布时间倒序
  const rel = [9, 8, 7, 6, 5].map((n) => ms({ id: `BOS-M${n}`, seq: n, status: 'released' }));
  const all = [ms({ id: 'BOS-M10', seq: 10, status: 'active' }), ...rel];
  const ids = (xs: Milestone[]) => xs.map((m) => m.id);
  it('不搜索只要最近 3 个', () => {
    expect(ids(visibleReleased(all, { kind: 'milestone', id: 'BOS-M10' }, false))).toEqual(['BOS-M9', 'BOS-M8', 'BOS-M7']);
  });
  it('当前选中的老版本也列出来', () => {
    expect(ids(visibleReleased(all, { kind: 'milestone', id: 'BOS-M5' }, false))).toEqual(['BOS-M9', 'BOS-M8', 'BOS-M7', 'BOS-M5']);
  });
  it('搜索时全部参与匹配', () => {
    expect(ids(visibleReleased(all, { kind: 'backlog' }, true))).toHaveLength(5);
  });
});
