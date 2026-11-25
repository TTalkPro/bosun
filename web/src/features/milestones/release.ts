import dayjs from 'dayjs';
import type { StatsOverview } from '@/api/stats';
import type { Milestone, TaskSummary } from '@/api/types';

/**
 * 燃尽两条线：actual = 每天结束时的剩余（今天以后 null）；ideal = 从第一天的剩余线性降到目标日的 0，
 * 目标日之后 null；目标日不在范围里（没写 / 在开始之前）就没有理想线。
 */
export const burndownSeries = (daily: StatsOverview['daily'], targetDate: string | null) => {
  const actual = daily.map((d) => (d.remaining === undefined ? null : d.remaining));
  const start = actual.find((v) => v != null) ?? 0;
  const t = targetDate ? daily.findIndex((d) => d.date === targetDate) : -1;
  const ideal = daily.map((_, i) => (t <= 0 || i > t ? null : start * (1 - i / t)));
  return { actual, ideal };
};

/** 未完成任务的缺省去向：目标日期最近的规划中 milestone；没有就待规划 */
export const defaultCarryTarget = (milestones: Milestone[], releasing: Milestone): string => {
  const planning = milestones.filter((m) => m.status === 'planning' && m.id !== releasing.id)
    .sort((a, b) => (a.target_date ?? '9999').localeCompare(b.target_date ?? '9999') || a.seq - b.seq);
  return planning[0]?.id ?? 'backlog';
};

export const isFinished = (t: TaskSummary) => t.status === 'DONE' || t.status === 'VERIFIED';
export const isUnfinished = (t: TaskSummary) => t.status === 'NEW' || t.status === 'IN_PROGRESS';

/**
 * 发布说明草稿（Markdown）：按 Epic 分组列出交付的任务，Epic 外的归「其它」；已完成未验收的标「待验收」。
 * epicTitles：Epic id → 标题（Epic 本身可能不在这个 milestone 里，标题从项目的 Epic 列表取）。
 */
export const releaseNotes = (m: Milestone, tasks: TaskSummary[], epicTitles: Record<string, string>, today = dayjs()): string => {
  const delivered = tasks.filter((t) => t.kind !== 'epic' && isFinished(t)).sort((a, b) => a.seq - b.seq);
  const groups = new Map<string, TaskSummary[]>();
  delivered.forEach((t) => {
    const k = t.epic ?? '';
    groups.set(k, [...(groups.get(k) ?? []), t]);
  });
  const line = (t: TaskSummary) => `- ${t.title}（${t.id}）${t.status === 'DONE' ? ' — 待验收' : ''}`;
  const out = [`## ${m.name}（${today.format('YYYY-MM-DD')}）`, '', `交付 ${delivered.length} 项。`];
  [...groups.keys()].filter((k) => k).sort().forEach((k) => {
    out.push('', `### ${epicTitles[k] ?? k}（${k}）`, '', ...groups.get(k)!.map(line));
  });
  const rest = groups.get('');
  if (rest?.length) out.push('', groups.size > 1 ? '### 其它' : '### 任务', '', ...rest.map(line));
  return out.join('\n') + '\n';
};
