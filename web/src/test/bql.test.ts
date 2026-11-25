import { beforeEach, describe, expect, it } from 'vitest';
import type { TaskSummary } from '@/api/types';
import { completionContext, pushRecent, quoteValue, readRecent, refineQuery, toCsv } from '@/features/query/bql';

describe('completion context', () => {
  it('knows when a field name is expected', () => {
    expect(completionContext('')).toEqual({ kind: 'field' });
    expect(completionContext('sta')).toEqual({ kind: 'field' });
    expect(completionContext('status = NEW AND ')).toEqual({ kind: 'field' });
    expect(completionContext('NOT ')).toEqual({ kind: 'field' });
    expect(completionContext('(')).toEqual({ kind: 'field' });
  });
  it('offers values for the field before the operator or inside IN (…)', () => {
    expect(completionContext('status = ')).toEqual({ kind: 'value', field: 'status' });
    expect(completionContext('Priority>=hi')).toEqual({ kind: 'value', field: 'priority' });
    expect(completionContext('status IN (NEW, IN_')).toEqual({ kind: 'value', field: 'status' });
    expect(completionContext('status not in (')).toEqual({ kind: 'value', field: 'status' });
    expect(completionContext('assignee = "keel/fea')).toEqual({ kind: 'value', field: 'assignee' });
  });
  it('offers connectors after a complete condition and fields after ORDER BY', () => {
    expect(completionContext('status = NEW ')).toEqual({ kind: 'connector' });
    expect(completionContext('status IN (NEW) ')).toEqual({ kind: 'connector' });
    expect(completionContext('status = NEW ORDER BY up')).toEqual({ kind: 'order' });
    expect(completionContext('title ~ "order by x" AND ')).toEqual({ kind: 'field' });
  });
});

describe('refine query', () => {
  it('appends before ORDER BY and parenthesises top-level OR', () => {
    expect(refineQuery('', 'status = NEW')).toBe('status = NEW');
    expect(refineQuery('project = BOS', 'status = NEW')).toBe('project = BOS AND status = NEW');
    expect(refineQuery('project = BOS ORDER BY updated DESC', 'priority = high')).toBe('project = BOS AND priority = high ORDER BY updated DESC');
    expect(refineQuery('status = NEW OR status = DONE', 'priority = high')).toBe('(status = NEW OR status = DONE) AND priority = high');
    expect(refineQuery('(a = 1 OR b = 2) AND c = 3', 'd = 4')).toBe('(a = 1 OR b = 2) AND c = 3 AND d = 4');
    expect(refineQuery('ORDER BY created', 'status = NEW')).toBe('status = NEW ORDER BY created');
    expect(refineQuery('title ~ "x or order by y"', 'status = NEW')).toBe('title ~ "x or order by y" AND status = NEW');
  });
  it('quotes values only when needed', () => {
    expect(quoteValue('BOS')).toBe('BOS');
    expect(quoteValue('keel/feature-x')).toBe('keel/feature-x');
    expect(quoteValue('two words')).toBe('"two words"');
    expect(quoteValue('中文')).toBe('"中文"');
  });
});

describe('csv & recent', () => {
  beforeEach(() => localStorage.clear());
  it('escapes cells and starts with a BOM', () => {
    const t = { id: 'BOS-1', project_key: 'BOS', title: 'a, "b"\nc', status: 'NEW', priority: 'high', kind: 'task', labels: ['x', 'y'],
      assignee: null, created_by: 'u', epic: null, blocked: false, open_question: true, feedback_count: 2,
      created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z' } as unknown as TaskSummary;
    const csv = toCsv([t]);
    expect(csv.startsWith('﻿id,project,title,')).toBe(true);
    expect(csv).toContain('BOS-1,BOS,"a, ""b""\nc",NEW,high,task,x y,,u,,false,true,2,');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('keeps the latest 8 distinct queries, newest first', () => {
    for (let i = 0; i < 10; i++) pushRecent(`q${i}`);
    pushRecent('q5');
    pushRecent('   ');
    expect(readRecent()).toEqual(['q5', 'q9', 'q8', 'q7', 'q6', 'q4', 'q3', 'q2']);
  });
});
