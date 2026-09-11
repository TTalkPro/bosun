// 与后端 bosun_json 的输出一一对应

export type Status = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'VERIFIED' | 'REJECTED' | 'CANCELLED';
export type Priority = 'low' | 'medium' | 'high';
export type FeedbackKind = 'comment' | 'review' | 'question' | 'answer';
export type TaskKind = 'task' | 'epic';
export type LinkType = 'replaces' | 'depends_on';

/** 任务关联的一端（详情里，两个方向都列） */
export interface TaskLink {
  type: LinkType;
  /** out：本任务 → 对方（我依赖 / 我替代）；in：对方 → 本任务（被依赖 / 被替代） */
  direction: 'out' | 'in';
  task: string;
  title: string | null;
  status: Status | null;
  kind: TaskKind | null;
  actor: string;
  created_at: string;
}

/** Epic 进度：由子任务派生 */
export interface EpicProgress {
  total: number;
  /** 已验收数 */
  done: number;
  by_status: Partial<Record<Status, number>>;
}

export interface Project {
  key: string;
  name: string;
  description: string;
  task_count: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestEvidence {
  command: string;
  passed: boolean;
  summary: string;
}

export interface HistoryEntry {
  from: Status | null;
  to: Status;
  actor: string;
  comment: string | null;
  /** 本次迁移附带的 git 提交 hash */
  commits: string[];
  /** 测试证据（DONE / 自验收时给） */
  tests: TestEvidence | null;
  at: string;
}

export interface Feedback {
  id: string;
  task_id: string;
  seq: number;
  author: string;
  kind: FeedbackKind;
  content: string;
  created_at: string;
  /** 本条修订自哪一条 */
  supersedes: string | null;
  /** 本条已被哪一条替代（作废） */
  superseded_by: string | null;
  status: 'active' | 'superseded';
}

export interface TaskSummary {
  id: string;
  project_key: string;
  seq: number;
  title: string;
  status: Status;
  priority: Priority;
  labels: string[];
  created_by: string;
  created_by_kind: 'human' | 'agent' | null;
  /** 执行方：领取（→ IN_PROGRESS）的人；建单可预派 */
  assignee: string | null;
  assignee_kind: 'human' | 'agent' | null;
  /** 全部历史条目里的提交 hash（去重、按时间） */
  commits: string[];
  kind: TaskKind;
  /** 所属 Epic 的任务 id（可跨项目） */
  epic: string | null;
  /** 仅 Epic 有 */
  progress: EpicProgress | null;
  /** 有未完成（非 DONE / VERIFIED）的 depends_on 目标 */
  blocked: boolean;
  feedback_count: number;
  open_question: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task extends TaskSummary {
  description: string;
  history: HistoryEntry[];
  feedback: Feedback[];
  /** Epic 的步骤（仅 kind = epic） */
  children?: TaskSummary[];
  /** 所属 Epic 的标题（仅普通任务且已挂 Epic） */
  epic_title?: string | null;
  links: TaskLink[];
}

export interface TaskListResponse {
  tasks: TaskSummary[];
  total: number;
}

export interface TaskFilter {
  status?: Status[];
  q?: string;
  kind?: TaskKind;
  epic?: string;
  limit?: number;
  offset?: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  field?: string;
  detail?: Record<string, unknown>;
}
