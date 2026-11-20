import useSWR from 'swr';
import { fetcher } from './client';

// 出现过的操作者（人 / Agent）。人的署名由服务端按登录用户决定（见 api/auth.ts 的 useMe），
// Agent 在 MCP 会话里 identify；前端不再自报名字。

export interface Actor {
  name: string;
  kind: 'human' | 'agent';
  project: string | null;
  worktree: string | null;
  /** 人 = 用户本人；Agent = 它用的 API key 的主人 */
  user_id: string | null;
  first_seen: string;
  last_seen: string;
}

export const useActors = () => useSWR<{ actors: Actor[] }>('/actors', fetcher, { refreshInterval: 30000 });

export const useActorKinds = (): Record<string, Actor['kind']> => {
  const { data } = useActors();
  const map: Record<string, Actor['kind']> = {};
  for (const a of data?.actors ?? []) map[a.name] = a.kind;
  return map;
};
