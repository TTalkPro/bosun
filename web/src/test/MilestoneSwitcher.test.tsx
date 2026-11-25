import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { Milestone } from '@/api/types';
import MilestoneSwitcher from '@/features/milestones/MilestoneSwitcher';
import { renderApp } from './render';
import '@testing-library/jest-dom/vitest';

const ms = (seq: number, status: Milestone['status'], name = `0.${seq}`): Milestone => ({
  id: `BOS-M${seq}`, project_key: 'BOS', seq, name, description: '', status,
  start_date: null, target_date: null, released_at: status === 'released' ? `2026-0${Math.min(9, seq)}-01T00:00:00Z` : null,
  summary: null, created_by: 'david', created_at: '', updated_at: '',
  counts: { total: 0, scope: 0, open: 0, in_progress: 0, done: 0, verified: 0, pending_verify: 0, rejected: 0, cancelled: 0, percent: 0, epics: 0, epics_done: 0 },
});

// 接口的顺序：进行中，规划中，已发布按发布时间倒序
const many: Milestone[] = [
  ms(12, 'active'), ms(13, 'planning'), ms(14, 'planning'),
  ...[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ms(n, 'released')),
];

const open = (props: Partial<Parameters<typeof MilestoneSwitcher>[0]> = {}) => {
  const onChange = vi.fn(); const onCreate = vi.fn(); const onManage = vi.fn();
  renderApp(<MilestoneSwitcher milestones={many} scope={{ kind: 'milestone', id: 'BOS-M12' }} onChange={onChange}
    allowAll onCreate={onCreate} onManage={onManage} {...props} />);
  fireEvent.click(screen.getByLabelText('切换 milestone'));
  return { onChange, onCreate, onManage };
};

// 渲染测试在 jsdom 里很慢（Radix Popover 定位 + cmdk），只留一个看结构；挑哪些已发布的见 milestones.test.ts 的 visibleReleased
// getByRole 要算整棵 Radix DOM 的可访问名，更慢；这里按文字找，再往上找按钮 / 列表
const list = () => document.querySelector('[cmdk-list]') as HTMLElement;
const pinned = (label: string) => screen.queryByText(label)?.closest('button') ?? null;

describe('MilestoneSwitcher', () => {
  it('已发布的只列最近 3 个，多的给「查看全部已发布」；待规划 / 全部 / 新建 / 管理固定在列表外', () => {
    const { onChange } = open();
    expect(within(list()).getByText('0.11')).toBeInTheDocument();
    expect(within(list()).getByText('0.9')).toBeInTheDocument();
    expect(within(list()).queryByText('0.8')).not.toBeInTheDocument();
    expect(within(list()).getByText('查看全部已发布（11）')).toBeInTheDocument();
    for (const label of ['待规划', '全部任务', '新建 milestone', '管理 milestone…']) {
      const el = pinned(label);
      expect(el).not.toBeNull();
      expect(list().contains(el)).toBe(false);
    }
    // 点固定入口：切到待规划
    fireEvent.click(pinned('待规划')!);
    expect(onChange).toHaveBeenCalledWith('backlog');
  });
});
