import type { TaskSummary } from '@/api/types';

// BQL 的前端辅助：补全上下文、在查询上追加条件、导出 CSV、最近查询。语法本身以后端 bosun_bql 为准。

export const BQL_KEYWORDS = ['AND', 'OR', 'NOT', 'IN', 'IS', 'EMPTY', 'ORDER', 'BY', 'ASC', 'DESC'];

/** 字段的中文说明（补全列表里显示）；后端字段表里有、这里没有的照样能补全，只是没说明 */
export const FIELD_INFO: Record<string, string> = {
  project: '项目 key', id: '任务 ID', status: '状态', priority: '优先级', labels: '标签', assignee: '执行人',
  reporter: '提出人', created_by: '提出人', kind: '任务 / Epic', epic: '所属 Epic', blocked: '被阻塞',
  depends_on: '依赖', blocks: '被依赖', replaces: '替代', replaced_by: '被替代',
  title: '标题', description: '描述', text: '全文', feedback: '只搜反馈', created: '创建时间', updated: '更新时间',
  question: '有提问待回答', feedback_count: '反馈数',
  milestone: 'Milestone（名称 / active）', fixversion: 'Milestone', milestone_status: 'Milestone 状态',
};

export type CompletionCtx =
  | { kind: 'field' }                    // 一个条件的开头：字段名 / NOT / ORDER BY
  | { kind: 'value'; field: string }     // 运算符之后，或 IN ( … 里
  | { kind: 'connector' }                // 一个完整条件之后：AND / OR / ORDER BY
  | { kind: 'order' };                   // ORDER BY 之后：字段名 / ASC / DESC

/**
 * 光标前的文本 → 该补什么。光标所在的半个词不算（交给补全过滤）。
 * 只做够用的判断，不是完整解析：字符串里的内容不参与（引号未闭合时视为在值里）。
 */
export const completionContext = (before: string): CompletionCtx => {
  // 去掉正在输入的半个词
  const head = before.replace(/[\w./-]*$/, '');
  // 引号没闭合：正在写字符串值
  const quotes = (head.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) {
    const m = head.match(/([A-Za-z_]\w*)\s*(?:!=|>=|<=|!~|=|>|<|~)\s*"[^"]*$/);
    return m ? { kind: 'value', field: m[1].toLowerCase() } : { kind: 'field' };
  }
  if (/\bORDER\s+BY\b[^"]*$/i.test(head)) return { kind: 'order' };
  const inList = head.match(/([A-Za-z_]\w*)\s+(?:NOT\s+)?IN\s*\(([^)]*)$/i);
  if (inList) return { kind: 'value', field: inList[1].toLowerCase() };
  const op = head.match(/([A-Za-z_]\w*)\s*(?:!=|>=|<=|!~|=|>|<|~)\s*$/);
  if (op) return { kind: 'value', field: op[1].toLowerCase() };
  const trimmed = head.trimEnd();
  if (trimmed === '' || /\b(AND|OR|NOT)$/i.test(trimmed) || trimmed.endsWith('(')) return { kind: 'field' };
  // IS [NOT] → EMPTY 也算连接词一类（关键字补全）
  return { kind: 'connector' };
};

// 在引号外找 ORDER BY 的位置（没有就 -1）
const orderByIndex = (q: string): number => {
  let inStr = false;
  for (let i = 0; i < q.length; i++) {
    if (q[i] === '"') inStr = !inStr;
    if (!inStr && /^ORDER\s+BY\b/i.test(q.slice(i)) && (i === 0 || /\s|\)/.test(q[i - 1]))) return i;
  }
  return -1;
};

// 引号与括号之外有没有 OR（有的话追加 AND 之前要先给原条件加括号）
const hasTopLevelOr = (where: string): boolean => {
  let inStr = false;
  let depth = 0;
  for (let i = 0; i < where.length; i++) {
    const c = where[i];
    if (c === '"') inStr = !inStr;
    else if (!inStr && c === '(') depth++;
    else if (!inStr && c === ')') depth--;
    else if (!inStr && depth === 0 && /^OR\b/i.test(where.slice(i)) && (i === 0 || /\s/.test(where[i - 1]))) return true;
  }
  return false;
};

/** 在查询上追加一个条件（结果概览里点「只看某状态」用）：放在 ORDER BY 之前，原条件含 OR 时加括号 */
export const refineQuery = (q: string, clause: string): string => {
  const at = orderByIndex(q);
  const where = (at < 0 ? q : q.slice(0, at)).trim();
  const order = at < 0 ? '' : q.slice(at).trim();
  const combined = !where ? clause : hasTopLevelOr(where) ? `(${where}) AND ${clause}` : `${where} AND ${clause}`;
  return order ? `${combined} ${order}` : combined;
};

/** 值需不需要加引号（含空白、括号、逗号、引号或非 ASCII 字母数字时加） */
export const quoteValue = (v: string): string => (/^[\w./-]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`);

const CSV_COLUMNS: [string, (t: TaskSummary) => string | number][] = [
  ['id', (t) => t.id], ['project', (t) => t.project_key], ['title', (t) => t.title], ['status', (t) => t.status],
  ['priority', (t) => t.priority], ['kind', (t) => t.kind], ['labels', (t) => t.labels.join(' ')],
  ['assignee', (t) => t.assignee ?? ''], ['created_by', (t) => t.created_by], ['epic', (t) => t.epic ?? ''],
  ['blocked', (t) => (t.blocked ? 'true' : 'false')], ['open_question', (t) => (t.open_question ? 'true' : 'false')],
  ['feedback_count', (t) => t.feedback_count], ['created_at', (t) => t.created_at], ['updated_at', (t) => t.updated_at],
];

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 风格的 CSV（\r\n 换行）；前面加 BOM，Excel 打开中文不乱码 */
export const toCsv = (tasks: TaskSummary[]): string =>
  '﻿' + [CSV_COLUMNS.map(([h]) => h).join(','), ...tasks.map((t) => CSV_COLUMNS.map(([, f]) => csvCell(f(t))).join(','))].join('\r\n') + '\r\n';

const RECENT_KEY = 'bosun.query.recent';
const RECENT_MAX = 8;

export const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
};

/** 记一条刚运行的查询：去重、最新在前、最多 8 条；空查询不记 */
export const pushRecent = (q: string): string[] => {
  const t = q.trim();
  if (!t) return readRecent();
  const next = [t, ...readRecent().filter((x) => x !== t)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
};
