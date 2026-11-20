import useSWR, { mutate } from 'swr';
import { client, fetcher } from './client';
import type { Feedback, FeedbackKind } from './types';

const feedbackKey = (taskId: string) => `/tasks/${taskId.toUpperCase()}/feedback`;

export const useFeedback = (taskId: string | undefined) =>
  useSWR<{ feedback: Feedback[] }>(taskId ? feedbackKey(taskId) : null, fetcher, {
    refreshInterval: 15000,
  });

const refreshTask = async (taskId: string) => {
  await mutate(feedbackKey(taskId));
  await mutate(`/tasks/${taskId.toUpperCase()}`);
  await mutate((k) => typeof k === 'string' && k.includes('/tasks?') || (typeof k === 'string' && k.endsWith('/tasks')));
};

// 修订：后端追加一条新的并把旧条标记作废，返回新条。只能改自己（author=user）写的（其他作者 403）
export const reviseFeedback = async (taskId: string, seq: number, input: { content?: string; kind?: FeedbackKind }) => {
  const { data } = await client.patch<Feedback>(`${feedbackKey(taskId)}/${seq}`, input);
  await refreshTask(taskId);
  return data;
};

export const addFeedback = async (taskId: string, input: { content: string; kind: FeedbackKind }) => {
  const { data } = await client.post<Feedback>(feedbackKey(taskId), input);
  await refreshTask(taskId);
  return data;
};
