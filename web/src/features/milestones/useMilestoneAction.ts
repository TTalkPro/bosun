import { useState } from 'react';
import { milestoneAction, type MilestoneAction } from '@/api/milestones';
import type { Milestone } from '@/api/types';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';

const ACTION_DONE: Record<MilestoneAction, string> = { activate: '已开始', pause: '已暂停，回到规划中', reopen: '已重新打开', release: '已发布' };

/** 状态迁移按钮共用的调用（active_exists 之类的错误交给 useApiError 提示） */
export const useMilestoneAction = () => {
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const [busy, setBusy] = useState(false);
  const run = async (m: Milestone, action: MilestoneAction) => {
    setBusy(true);
    try {
      await milestoneAction(m, action);
      enqueueSnackbar(`${m.name} ${ACTION_DONE[action]}`, { variant: 'success' });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
};
