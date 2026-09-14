import useSWR, { mutate } from 'swr';
import { client, fetcher } from './client';
import type { LinkType, Priority, Status, Task, TaskFilter, TaskKind, TaskListResponse, TestEvidence } from './types';

const taskKey = (id: string) => `/tasks/${id.toUpperCase()}`;
const listPrefix = (projectKey: string) => `/projects/${projectKey.toUpperCase()}/tasks`;

export const toQuery = (f: TaskFilter): string => {
  const p = new URLSearchParams();
  if (f.status?.length) p.set('status', f.status.join(','));
  if (f.q) p.set('q', f.q);
  if (f.kind) p.set('kind', f.kind);
  if (f.epic) p.set('epic', f.epic);
  if (f.limit != null) p.set('limit', String(f.limit));
  if (f.offset != null) p.set('offset', String(f.offset));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useTasks = (projectKey: string | undefined, filter: TaskFilter) =>
  useSWR<TaskListResponse>(projectKey ? listPrefix(projectKey) + toQuery(filter) : null, fetcher, {
    keepPreviousData: true,
  });

// 详情页 15s 轮询：Agent 经 MCP 改了任务，开着的页面自己刷新
export const useTask = (id: string | undefined) =>
  useSWR<Task>(id ? taskKey(id) : null, fetcher, { refreshInterval: 15000 });

// 列表缓存全部失效（新建 / 改状态 / 反馈都会影响摘要）
const refreshLists = (projectKey: string) =>
  mutate((k) => typeof k === 'string' && k.startsWith(listPrefix(projectKey)));

const applyTask = async (task: Task) => {
  await mutate(taskKey(task.id), task, false);
  await refreshLists(task.project_key);
  await mutate(`/projects/${task.project_key}`);
  return task;
};

export interface TaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  labels?: string[];
  assignee?: string;
  kind?: TaskKind;
  /** 所属 Epic id；更新时 "" 表示摘掉 */
  epic?: string;
}

// 当前项目的 Epic 列表（挂 Epic 的下拉用）
export const useEpics = (projectKey: string | undefined) =>
  useSWR<TaskListResponse>(projectKey ? listPrefix(projectKey) + toQuery({ kind: 'epic', limit: 500 }) : null, fetcher);

export interface TransitionEvidence {
  comment?: string;
  commits?: string[];
  tests?: TestEvidence;
}

export const createTask = async (projectKey: string, input: TaskInput) => {
  const { data } = await client.post<Task>(listPrefix(projectKey), input);
  return applyTask(data);
};

export const updateTask = async (id: string, input: Partial<TaskInput>) => {
  const { data } = await client.patch<Task>(taskKey(id), input);
  return applyTask(data);
};

export const transitionTask = async (id: string, to: Status, evidence: TransitionEvidence = {}) => {
  const { data } = await client.post<Task>(`${taskKey(id)}/transition`, { to, ...evidence });
  return applyTask(data);
};

// 关联：from replaces / depends_on to；返回 from 的详情。对端也会变（blocked / 被撤销），一并失效
export const addLink = async (from: string, to: string, type: LinkType) => {
  const { data } = await client.post<Task>(`${taskKey(from)}/links`, { to, type });
  await mutate(taskKey(to));
  return applyTask(data);
};

export const removeLink = async (from: string, to: string, type: LinkType) => {
  const { data } = await client.delete<Task>(`${taskKey(from)}/links/${type}/${to.toUpperCase()}`);
  await mutate(taskKey(to));
  return applyTask(data);
};
