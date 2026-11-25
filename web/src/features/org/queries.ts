import { quoteValue } from '@/features/query/bql';
import { paths } from '@/routes/paths';

const OPEN = 'status IN (NEW, IN_PROGRESS, DONE)';

/** 某人（null = 未领取）手上未结任务的 BQL 查询页链接；组织页各处点数字都去这里 */
export const openTasksQuery = (name: string | null) =>
  `${paths.query}?q=${encodeURIComponent(`${name === null ? 'assignee IS EMPTY' : `assignee = ${quoteValue(name)}`} AND ${OPEN} ORDER BY priority DESC`)}`;
