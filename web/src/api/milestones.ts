import useSWR, { mutate } from 'swr';
import { client, fetcher } from './client';
import { refreshStats } from './stats';
import type { Milestone } from './types';

// Milestone（designs/14）：一次发布的任务范围
const listKey = (projectKey: string) => `/projects/${projectKey.toUpperCase()}/milestones`;
const itemKey = (id: string) => `/milestones/${id.toUpperCase()}`;

export const useMilestones = (projectKey: string | undefined) =>
  useSWR<{ milestones: Milestone[] }>(projectKey ? listKey(projectKey) : null, fetcher);

/** 详情带 changes（范围变更） */
export const useMilestone = (id: string | undefined) =>
  useSWR<Milestone>(id ? itemKey(id) : null, fetcher);

export interface MilestoneInput {
  name?: string;
  description?: string;
  /** YYYY-MM-DD；"" 清空 */
  start_date?: string;
  target_date?: string;
}

// milestone 变了：它自己、项目的 milestone 列表、项目（侧栏的 active_milestone）、任务列表（归属 / 结转）都要跟上
const refresh = async (projectKey: string) => {
  const key = projectKey.toUpperCase();
  await mutate((k) => typeof k === 'string' && (
    k.startsWith('/milestones/') || k.startsWith(listKey(key)) || k.startsWith(`/projects/${key}/tasks`)
    || k === `/projects/${key}` || k.startsWith('/projects?') || k === '/projects' || k.startsWith('/tasks/')));
  void refreshStats();
};

export const createMilestone = async (projectKey: string, input: MilestoneInput) => {
  const { data } = await client.post<Milestone>(listKey(projectKey), input);
  await refresh(projectKey);
  return data;
};

export const updateMilestone = async (m: Pick<Milestone, 'id' | 'project_key'>, input: MilestoneInput) => {
  const { data } = await client.patch<Milestone>(itemKey(m.id), input);
  await refresh(m.project_key);
  return data;
};

export const deleteMilestone = async (m: Pick<Milestone, 'id' | 'project_key'>) => {
  await client.delete(itemKey(m.id));
  await refresh(m.project_key);
};

export type MilestoneAction = 'activate' | 'pause' | 'reopen' | 'release';

export const milestoneAction = async (m: Pick<Milestone, 'id' | 'project_key'>, action: MilestoneAction, body: Record<string, unknown> = {}) => {
  const { data } = await client.post<Milestone>(`${itemKey(m.id)}/${action}`, body);
  await refresh(m.project_key);
  return data;
};

export interface AssignResult {
  updated: string[];
  failed: { id: string; reason: string }[];
}

/** 批量设置归属；milestone = "" 移出到待规划 */
export const assignMilestone = async (projectKey: string, ids: string[], milestone: string, comment?: string) => {
  const { data } = await client.post<AssignResult>(`/projects/${projectKey.toUpperCase()}/tasks/milestone`, { ids, milestone, comment: comment || undefined });
  await refresh(projectKey);
  return data;
};
