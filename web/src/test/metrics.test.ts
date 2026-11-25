import { describe, expect, it } from 'vitest';
import type { StatCounts } from '@/api/stats';
import { niceMax, percentChange, sumCounts, windowSums } from '@/features/dashboard/metrics';

const day = (created: number, completed: number, i: number) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, created, completed });

describe('dashboard metrics', () => {
  it('splits the last two weeks into current and previous windows', () => {
    const daily = Array.from({ length: 14 }, (_, i) => day(i < 7 ? 1 : 2, i < 7 ? 0 : 3, i));
    expect(windowSums(daily, 'created')).toEqual({ current: 14, previous: 7 });
    expect(windowSums(daily, 'completed')).toEqual({ current: 21, previous: 0 });
  });

  it('has no percentage when the previous window is empty', () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
  });

  it('rounds the axis to an even ceiling so the midline tick is an integer', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(5)).toBe(6);
    expect(niceMax(9)).toBe(10);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(37)).toBe(40);
    expect(niceMax(130)).toBe(200);
    for (let n = 0; n < 2000; n += 7) {
      const m = niceMax(n);
      expect(m).toBeGreaterThanOrEqual(n);
      expect(Number.isInteger(m / 2)).toBe(true);
    }
  });

  it('sums only the projects passed in', () => {
    const c = (open: number, verified: number): StatCounts => ({
      by_status: { NEW: open, IN_PROGRESS: 0, DONE: 0, VERIFIED: verified, REJECTED: 0, CANCELLED: 0 },
      total: open + verified, open, epics: 0, blocked: 1, open_questions: 0,
      by_assignee: { alice: open }, unassigned: verified, by_priority: { high: open, medium: 0, low: verified },
      open_by_assignee: { alice: open }, open_unassigned: 0,
    });
    const sum = sumCounts([c(2, 1), c(3, 0)]);
    expect(sum.open).toBe(5);
    expect(sum.by_status.NEW).toBe(5);
    expect(sum.by_status.VERIFIED).toBe(1);
    expect(sum.blocked).toBe(2);
    expect(sum.by_assignee).toEqual({ alice: 5 });
    expect(sum.unassigned).toBe(1);
    expect(sum.by_priority).toEqual({ high: 5, medium: 0, low: 1 });
    expect(sum.open_by_assignee).toEqual({ alice: 5 });
    expect(sumCounts([]).total).toBe(0);
  });
});
