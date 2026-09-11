import type { Feedback, FeedbackKind } from '@/api/types';

export const KIND_LABEL: Record<FeedbackKind, string> = {
  comment: '说明',
  review: '评审',
  question: '提问',
  answer: '回答',
};

export const ALL_KINDS: FeedbackKind[] = ['comment', 'review', 'question', 'answer'];

// 最新一条**有效**记录是 question → 缺省回答它（作废的不算）
export const defaultKind = (feedback: Feedback[]): FeedbackKind => {
  const active = feedback.filter((f) => f.status !== 'superseded');
  return active.length && active[active.length - 1].kind === 'question' ? 'answer' : 'comment';
};
