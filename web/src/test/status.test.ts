import { describe, expect, it } from 'vitest';
import { ALL_STATUSES, isForward, isTaskId, nextStatuses, normalizeId, transitionLabel } from '@/features/tasks/status';
import { defaultKind } from '@/features/feedback/kinds';
import type { Feedback } from '@/api/types';

describe('status table (mirrors bosun_task_status:allowed/2)', () => {
  it('matches the backend transition table', () => {
    expect(nextStatuses('NEW')).toEqual(['IN_PROGRESS', 'REJECTED', 'CANCELLED']);
    expect(nextStatuses('IN_PROGRESS')).toEqual(['DONE', 'REJECTED', 'CANCELLED']);
    expect(nextStatuses('CANCELLED')).toEqual(['NEW']);
    expect(nextStatuses('DONE')).toEqual(['IN_PROGRESS', 'VERIFIED']);
    expect(nextStatuses('VERIFIED')).toEqual(['IN_PROGRESS']);
    expect(nextStatuses('REJECTED')).toEqual(['NEW']);
  });

  it('never allows self transitions', () => {
    for (const s of ALL_STATUSES) expect(nextStatuses(s)).not.toContain(s);
  });

  it('classifies forward vs backward', () => {
    expect(isForward('NEW', 'IN_PROGRESS')).toBe(true);
    expect(isForward('DONE', 'VERIFIED')).toBe(true);
    expect(isForward('DONE', 'IN_PROGRESS')).toBe(false);
    expect(isForward('VERIFIED', 'IN_PROGRESS')).toBe(false);
    expect(transitionLabel('DONE', 'IN_PROGRESS')).toBe('打回');
    expect(isForward('IN_PROGRESS', 'REJECTED')).toBe(false);
    expect(transitionLabel('IN_PROGRESS', 'REJECTED')).toBe('拒绝');
    expect(transitionLabel('REJECTED', 'NEW')).toBe('重新提交');
    expect(transitionLabel('NEW', 'CANCELLED')).toBe('撤销');
    expect(transitionLabel('CANCELLED', 'NEW')).toBe('恢复');
  });
});

describe('id helpers', () => {
  it('normalizes and validates task ids', () => {
    expect(normalizeId(' bos-12 ')).toBe('BOS-12');
    expect(isTaskId('bos-12')).toBe(true);
    expect(isTaskId('BOS-012')).toBe(false);
    expect(isTaskId('BOS-12#1')).toBe(false);
    expect(isTaskId('1BOS-1')).toBe(false);
  });
});

describe('feedback default kind', () => {
  const fb = (kind: Feedback['kind'], status: Feedback['status'] = 'active'): Feedback =>
    ({ id: 'X-1#1', task_id: 'X-1', seq: 1, author: 'agent', kind, content: '', created_at: '', supersedes: null, superseded_by: null, status });
  it('answers an open question', () => {
    expect(defaultKind([])).toBe('comment');
    expect(defaultKind([fb('question')])).toBe('answer');
    expect(defaultKind([fb('question'), fb('answer')])).toBe('comment');
    expect(defaultKind([fb('question'), fb('review')])).toBe('comment');
    // 作废的 question 不算
    expect(defaultKind([fb('comment'), fb('question', 'superseded')])).toBe('comment');
  });
});
