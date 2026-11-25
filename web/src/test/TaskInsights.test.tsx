import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { HistoryEntry, Task } from '@/api/types';
import { AttentionBanners, DeliveryCard, StatusStepper } from '@/features/tasks/TaskInsights';
import { renderApp } from './render';
import '@testing-library/jest-dom/vitest';

const h = (from: HistoryEntry['from'], to: HistoryEntry['to'], at: string, extra: Partial<HistoryEntry> = {}): HistoryEntry =>
  ({ from, to, actor: 'david', comment: null, commits: [], tests: null, at, ...extra });

// 接口给的是新的在前
const history: HistoryEntry[] = [
  h('IN_PROGRESS', 'DONE', '2026-11-25T06:05:00Z', { tests: { command: 'pnpm test', passed: true, summary: '13 passed' } }),
  h('DONE', 'IN_PROGRESS', '2026-11-25T06:04:00Z', { comment: '按钮没恢复' }),
  h('IN_PROGRESS', 'DONE', '2026-11-25T06:03:00Z', { tests: { command: 'pnpm test', passed: true, summary: '12 passed' } }),
  h('NEW', 'IN_PROGRESS', '2026-11-25T06:02:00Z'),
  h(null, 'NEW', '2026-11-25T06:01:00Z'),
];

const task = (over: Partial<Task> = {}): Task => ({
  id: 'BOS-3', project_key: 'BOS', seq: 3, title: 't', status: 'DONE', priority: 'medium', labels: [],
  created_by: 'david', created_by_kind: 'human', assignee: 'david', assignee_kind: 'human',
  commits: ['9a8b7c6d', '1f2e3d4c'], kind: 'task', epic: null, milestone: null, milestone_name: null, progress: null, blocked: false,
  feedback_count: 0, open_question: false, created_at: '2026-11-25T06:01:00Z', updated_at: '2026-11-25T06:05:00Z',
  description: '', history, feedback: [], links: [], milestone_log: [], ...over,
});

describe('TaskInsights', () => {
  it('交付卡片取时间上最近的一次测试证据（不管接口顺序）', () => {
    renderApp(<DeliveryCard task={task()} />);
    expect(screen.getByText(/13 passed/)).toBeInTheDocument();
    expect(screen.queryByText(/12 passed/)).not.toBeInTheDocument();
  });

  it('进度：数出打回次数，当前步标「当前」', () => {
    renderApp(<StatusStepper task={task()} />);
    expect(screen.getByText(/打回 1 次/)).toBeInTheDocument();
    expect(screen.getByText('当前')).toBeInTheDocument();
  });

  it('撤销时末尾多一个终止步并带上说明', () => {
    renderApp(<StatusStepper task={task({ status: 'CANCELLED', history: [h('NEW', 'CANCELLED', '2026-11-25T06:02:00Z', { comment: '不做了' }), h(null, 'NEW', '2026-11-25T06:01:00Z')] })} />);
    expect(screen.getAllByText('已撤销').length).toBeGreaterThan(0);
    expect(screen.getByText(/不做了/)).toBeInTheDocument();
    expect(screen.queryByText('当前')).not.toBeInTheDocument();
  });

  it('被阻塞时列出挡路的任务；没事就不渲染', () => {
    const blocked = task({
      blocked: true,
      links: [
        { type: 'depends_on', direction: 'out', task: 'BOS-4', title: '限流后端', status: 'NEW', kind: 'task', actor: 'david', created_at: '' },
        { type: 'depends_on', direction: 'out', task: 'BOS-9', title: '已经好了', status: 'VERIFIED', kind: 'task', actor: 'david', created_at: '' },
      ],
    });
    const { unmount } = renderApp(<AttentionBanners task={blocked} onAnswer={() => {}} />);
    expect(screen.getByText('限流后端')).toBeInTheDocument();
    expect(screen.queryByText('已经好了')).not.toBeInTheDocument();
    unmount();
    const { container } = renderApp(<AttentionBanners task={task()} onAnswer={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
