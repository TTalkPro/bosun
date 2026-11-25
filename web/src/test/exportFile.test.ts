import { describe, expect, it } from 'vitest';
import { inspectExport } from '@/features/data/exportFile';

describe('export file inspection', () => {
  it('summarises a valid export', () => {
    const r = inspectExport(JSON.stringify({
      format: 'bosun-export', version: 2, exported_at: '2026-11-25T01:00:00.000Z',
      projects: [{}, {}], tasks: [{}, {}, {}], feedback: [{}], filters: [], links: [{}], actors: [{}, {}],
    }));
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.summary).toEqual({ version: 2, exportedAt: '2026-11-25T01:00:00.000Z', projects: 2, tasks: 3, feedback: 1, filters: 0, links: 1, actors: 2 });
  });

  it('accepts version 1 files without the newer sections', () => {
    const r = inspectExport(JSON.stringify({ format: 'bosun-export', version: 1, projects: [], tasks: [] }));
    expect(r.kind === 'ok' && r.summary.links).toBe(0);
  });

  it('rejects anything that is not a bosun export before uploading', () => {
    expect(inspectExport('{oops')).toEqual({ kind: 'error', error: '不是合法的 JSON 文件' });
    expect(inspectExport('[1,2]').kind).toBe('error');
    expect(inspectExport(JSON.stringify({ format: 'other', version: 2 })).kind).toBe('error');
    const v = inspectExport(JSON.stringify({ format: 'bosun-export', version: 9 }));
    expect(v.kind).toBe('error');
    if (v.kind === 'error') expect(v.error).toContain('9');
  });
});
