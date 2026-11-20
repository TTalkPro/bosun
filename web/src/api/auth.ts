import useSWR, { mutate } from 'swr';
import { client, fetcher } from './client';

// 组织 / 用户 / 会话 / API key（designs/13-org-auth.md）

export type Role = 'admin' | 'member';
export type UserStatus = 'active' | 'disabled';

export interface User {
  id: string;
  org_id: string;
  email: string;
  /** 显示名 = 写操作的署名 */
  name: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface Org {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Me {
  user: User;
  org: Org;
  via: 'session' | 'api_key';
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  /** 展示用前缀 bsk_xxxxxx */
  prefix: string;
  scopes: string[] | null;
  /** 项目白名单；null / 空数组表示组织内全部项目 */
  project_keys: string[] | null;
  expires_at: string | null;
  created_at: string;
  rotated_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  status: 'active' | 'revoked';
}

/** 新建 key 的返回：`key` 是明文，只此一次 */
export interface CreatedApiKey extends ApiKey { key: string }

export interface ApiKeyInput {
  name: string;
  /** read / write / manage；不传默认 read */
  scopes: string[];
  /** 不传或空数组表示组织内全部项目 */
  project_keys?: string[];
  /** 未来 Unix 毫秒时间戳；不传表示不过期 */
  expires_at?: number;
}

export interface CodeSent {
  email: string;
  /** smtp：真发了邮件；log：打在服务端日志里（未配置 SMTP） */
  delivery: 'smtp' | 'log';
  expires_in: number;
}

const ME = '/auth/me';

// 当前登录用户；401 → error（AuthGate 据此跳登录页）
export const useMe = () => useSWR<Me>(ME, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });

export const useIsAdmin = () => useMe().data?.user.role === 'admin';

export const requestCode = async (email: string) => {
  const { data } = await client.post<CodeSent>('/auth/register/code', { email });
  return data;
};

export const register = async (input: { org_name: string; email: string; code: string; name: string; password: string }) => {
  const { data } = await client.post<{ org: Org; user: User }>('/auth/register', input);
  await mutate(ME);
  return data;
};

export const login = async (email: string, password: string) => {
  const { data } = await client.post<{ org: Org; user: User }>('/auth/login', { email, password });
  await mutate(ME);
  return data;
};

export const logout = async () => {
  await client.post('/auth/logout');
  await mutate(() => true, undefined, { revalidate: false }); // 清掉所有缓存
};

export const changePassword = async (current: string, next: string) => {
  await client.post('/auth/password', { current, new: next });
};

// 组织
export const useOrg = () => useSWR<Org>('/org', fetcher);
export const updateOrg = async (input: { name: string }) => {
  const { data } = await client.patch<Org>('/org', input);
  await mutate('/org', data, false);
  await mutate(ME);
  return data;
};

// 用户（admin）
const USERS = '/users';
// 只有 admin 能列；成员传 false 不发请求（免得 403）
export const useUsers = (enabled = true) => useSWR<{ users: User[] }>(enabled ? USERS : null, fetcher);
export const createUser = async (input: { email: string; name: string; password: string; role: Role }) => {
  const { data } = await client.post<User>(USERS, input);
  await mutate(USERS);
  return data;
};
export const updateUser = async (id: string, input: Partial<{ name: string; role: Role; status: UserStatus; password: string }>) => {
  const { data } = await client.patch<User>(`${USERS}/${id}`, input);
  await mutate(USERS);
  return data;
};

// 自己的 API key
const KEYS = '/keys';
export const useKeys = () => useSWR<{ keys: ApiKey[] }>(KEYS, fetcher);
export const createKey = async (input: ApiKeyInput) => {
  const { data } = await client.post<CreatedApiKey>(KEYS, input);
  await mutate(KEYS);
  return data;
};
export const rotateKey = async (id: string) => {
  const { data } = await client.post<CreatedApiKey>(`${KEYS}/${id}/rotate`);
  await mutate(KEYS);
  return data;
};
export const revokeKey = async (id: string) => {
  await client.delete(`${KEYS}/${id}`);
  await mutate(KEYS);
};
