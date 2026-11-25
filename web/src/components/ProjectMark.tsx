import { cn } from '@/lib/utils';

// 项目首字母方块：颜色由 key 散列，侧栏 / 项目卡片里一眼区分项目
const HUES = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500'];
const hueOf = (key: string) => HUES[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];

const ProjectMark = ({ projectKey, className }: { projectKey: string; className?: string }) => (
  <span aria-hidden className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[10px] font-bold text-white', hueOf(projectKey), className)}>
    {projectKey.slice(0, 1)}
  </span>
);
export default ProjectMark;
