import { describe, expect, it } from 'vitest';
import { normalizePageSize, pageWindow, tableColumns } from '@/features/tasks/columns';

describe('pagination window', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(0, 1)).toEqual([0]);
    expect(pageWindow(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('keeps first / last / neighbours and elides the rest', () => {
    expect(pageWindow(0, 20)).toEqual([0, 1, 2, 3, null, 19]);
    expect(pageWindow(10, 20)).toEqual([0, null, 9, 10, 11, null, 19]);
    expect(pageWindow(19, 20)).toEqual([0, null, 16, 17, 18, 19]);
  });

  it('never elides a single page', () => {
    // 0 … 2 会把 1 藏进省略号，等于没省；应直接列出
    for (let total = 1; total < 30; total++) {
      for (let page = 0; page < total; page++) {
        const w = pageWindow(page, total);
        w.forEach((p, i) => { if (p === null) expect((w[i + 1] as number) - (w[i - 1] as number)).toBeGreaterThan(2); });
        expect(w).toContain(page);
      }
    }
  });
});

describe('table columns', () => {
  it('only offers the project column on cross-project tables', () => {
    expect(tableColumns({})).not.toContain('project');
    expect(tableColumns({ showProject: true })[0]).toBe('project');
  });

  it('falls back to the default page size for unknown values', () => {
    expect(normalizePageSize(50)).toBe(50);
    expect(normalizePageSize(37)).toBe(25);
    expect(normalizePageSize(NaN)).toBe(25);
  });
});
