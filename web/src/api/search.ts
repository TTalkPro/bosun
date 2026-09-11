import { client } from './client';
import type { Feedback, TaskSummary } from './types';

export interface SearchHit {
  task: TaskSummary;
  score: number;
  matched: 'task' | 'feedback';
  feedback: (Pick<Feedback, 'id' | 'author' | 'kind' | 'created_at'> & { snippet: string }) | null;
}

// 跨项目全文检索（BM25：标题 / 正文 / 标签 / feedback）
export const searchTasks = async (q: string, opts: { project?: string; limit?: number } = {}) => {
  const params: Record<string, string> = { q };
  if (opts.project) params.project = opts.project;
  if (opts.limit) params.limit = String(opts.limit);
  const { data } = await client.get<{ hits: SearchHit[] }>('/search', { params });
  return data.hits;
};
