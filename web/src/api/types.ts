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
  /** 已撤销数；完成率的分母不含它 */
  cancelled: number;
  /** total - cancelled；全部撤销时完成率按 100% */
  active_total: number;
  /** 0-100，分母排除 CANCELLED */
  percent: number;
  by_status: Partial<Record<Status, number>>;
}

export interface Project {
  key: string;
  name: string;
  description: string;
  task_count: number;
  archived: boolean;
  /** 当前进行中的 milestone（14）；没有为 null */
  active_milestone: { id: string; name: string; percent: number; target_date: string | null } | null;
  created_at: string;
  updated_at: string;
}

export type MilestoneStatus = 'planning' | 'active' | 'released';

/** 进度口径（14 §3）：scope 不含 Epic 与已拒绝 / 已撤销；done = 已完成 + 已验收 */
export interface MilestoneCounts {
  total: number;
  scope: number;
  open: number;
  in_progress: number;
  done: number;
  verified: number;
  pending_verify: number;
  rejected: number;
  cancelled: number;
  percent: number;
  epics: number;
  epics_done: number;
}

export interface MilestoneSummary {
  released_by: string;
  counts: Record<'delivered' | 'verified' | 'pending_verify' | 'rejected' | 'cancelled' | 'carried_over', number>;
  delivered: string[];
  epics: string[];
  pending_verify: string[];
  carried_over: string[];
  carried_to: string;
  /** 发布时目标 milestone 的名称（快照） */
  carried_to_name?: string | null;
  notes: string | null;
}

export interface MilestoneChange {
  task: string;
  title: string;
  kind: TaskKind;
  status: Status;
  direction: 'in' | 'out';
  from: string | null;
  to: string | null;
  from_name: string | null;
  to_name: string | null;
  actor: string;
  comment: string | null;
  at: string;
}

export interface Milestone {
  id: string;
  project_key: string;
  seq: number;
  name: string;
  description: string;
  status: MilestoneStatus;
  start_date: string | null;
  target_date: string | null;
  released_at: string | null;
  summary: MilestoneSummary | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  counts: MilestoneCounts;
  /** 只有详情接口带 */
  changes?: MilestoneChange[];
}

/** 任务的 milestone 归属变更（14 D7） */
export interface MilestoneLogEntry {
  from: string | null;
  from_name: string | null;
  to: string | null;
  to_name: string | null;
  actor: string;
  comment: string | null;
  at: string;
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
  /** 所属 milestone（14）；null = 待规划 */
  milestone: string | null;
  milestone_name: string | null;
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
  milestone_log: MilestoneLogEntry[];
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
  priority?: Priority[];
  /** 执行人名；'~none' = 未领取 */
  assignee?: string[];
  /** 只要被阻塞或有提问待回答的 */
  attention?: boolean;
  /** milestone id / 名称 / active / backlog（未排期） */
  milestone?: string;
  /** field[:asc|desc]；field ∈ id / title / status / priority / assignee / feedback / updated / created */
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  field?: string;
  detail?: Record<string, unknown>;
}
