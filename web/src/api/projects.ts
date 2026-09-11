import useSWR, { mutate } from 'swr';
import { client, fetcher } from './client';
import type { Project } from './types';

const KEY = '/projects';
const projectKey = (key: string) => `/projects/${key.toUpperCase()}`;

export const useProjects = (includeArchived = false) =>
  useSWR<{ projects: Project[] }>(includeArchived ? `${KEY}?archived=1` : KEY, fetcher);

export const useProject = (key: string | undefined) =>
  useSWR<Project>(key ? projectKey(key) : null, fetcher);

const refreshLists = () => mutate((k) => typeof k === 'string' && k.startsWith(KEY + '?') || k === KEY);

export const createProject = async (input: { key: string; name: string; description?: string }) => {
  const { data } = await client.post<Project>(KEY, input);
  await refreshLists();
  return data;
};

export const updateProject = async (
  key: string,
  input: Partial<Pick<Project, 'name' | 'description' | 'archived'>>,
) => {
  const { data } = await client.patch<Project>(projectKey(key), input);
  await mutate(projectKey(key), data, false);
  await refreshLists();
  return data;
};
