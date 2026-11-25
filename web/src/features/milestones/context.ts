import { createContext, useContext } from 'react';
import type { Milestone, TaskSummary } from '@/api/types';

/**
 * 项目页往下传的 milestone 上下文：看板卡片 / 列表行的「Milestone」子菜单用。
 * 没有 Provider（查询页、Epic 详情里的看板）就不显示那个子菜单。
 */
export interface MilestoneCtx {
  milestones: Milestone[];
  /** toId = '' 移到待规划；由页面决定要不要先弹原因框 */
  requestMove: (tasks: TaskSummary[], toId: string) => void;
}

export const MilestoneContext = createContext<MilestoneCtx | null>(null);

export const useMilestoneCtx = () => useContext(MilestoneContext);
