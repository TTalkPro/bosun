import useSWR, { mutate } from 'swr';
import { client, fetcher } from './client';
import type { Priority, Status, TaskSummary } from './types';

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  created_at: string;
  updated_at: string;
}

/** 整个结果集（不只是这一页）的分布 */
export interface QueryFacets {
  by_status: Partial<Record<Status, number>>;
  by_priority: Partial<Record<Priority, number>>;
  by_project: Record<string, number>;
}

export interface QueryResult {
  tasks: TaskSummary[];
  total: number;
  facets?: QueryFacets;
  order: { field: string; dir: 'asc' | 'desc' }[];
  filter?: SavedFilter;
}

const FILTERS = '/filters';

export const useFilters = () => useSWR<{ filters: SavedFilter[]; fields: string[] }>(FILTERS, fetcher);

// BQL 查询；空串 = 全部任务
export const useQuery = (bql: string | null, limit: number, offset: number) =>
  useSWR<QueryResult>(bql === null ? null : `/query?q=${encodeURIComponent(bql)}&limit=${limit}&offset=${offset}`, fetcher, {
    keepPreviousData: true,
    shouldRetryOnError: false,
  });

export const createFilter = async (input: { name: string; query: string }) => {
  const { data } = await client.post<SavedFilter>(FILTERS, input);
  await mutate(FILTERS);
  return data;
};

export const updateFilter = async (id: string, input: Partial<{ name: string; query: string }>) => {
  const { data } = await client.patch<SavedFilter>(`${FILTERS}/${id}`, input);
  await mutate(FILTERS);
  return data;
};

export const deleteFilter = async (id: string) => {
  await client.delete(`${FILTERS}/${id}`);
  await mutate(FILTERS);
};
