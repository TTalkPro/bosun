import { useSyncExternalStore } from 'react';
import useSWR from 'swr';
import { fetcher } from './client';

// 前端的操作者身份：一个名字，存 localStorage；kind 恒为 human（浏览器里坐着的是人）
const KEY = 'bosun.actor';
const DEFAULT = 'user';
const listeners = new Set<() => void>();

const read = (): string => {
  try { return localStorage.getItem(KEY)?.trim() || DEFAULT; } catch { return DEFAULT; }
};

export const getActor = read;

export const setActor = (name: string) => {
  try { localStorage.setItem(KEY, name.trim() || DEFAULT); } catch { /* ignore */ }
  listeners.forEach((l) => l());
};

export const useActor = () =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, read);

// 写请求统一带上：谁、是人
export const actorFields = () => ({ actor: read(), actor_kind: 'human' as const });
export const authorFields = () => ({ author: read(), author_kind: 'human' as const });

export interface Actor {
  name: string;
  kind: 'human' | 'agent';
  project: string | null;
  worktree: string | null;
  first_seen: string;
  last_seen: string;
}

// 出现过的操作者（人 / Agent），给图标与筛选用
export const useActors = () => useSWR<{ actors: Actor[] }>('/actors', fetcher, { refreshInterval: 30000 });

export const useActorKinds = (): Record<string, Actor['kind']> => {
  const { data } = useActors();
  const map: Record<string, Actor['kind']> = {};
  for (const a of data?.actors ?? []) map[a.name] = a.kind;
  return map;
};
