import { useMilestones } from '@/api/milestones';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { MILESTONE_STATUS_LABEL, assignable } from './meta';

const NONE = '__none__';

interface Props {
  projectKey: string;
  /** milestone id；null / '' = 待规划 */
  value: string | null;
  onChange: (id: string) => void;
  id?: string;
  /** 详情卡片里用的无边框样式 */
  ghost?: boolean;
  disabled?: boolean;
}

/** 任务归属的下拉：只列规划中 / 进行中；当前值若是已发布的也显示出来（只读，可以改走） */
const MilestoneSelect = ({ projectKey, value, onChange, id, ghost, disabled }: Props) => {
  const { data } = useMilestones(projectKey);
  const all = data?.milestones ?? [];
  const options = assignable(all);
  const current = value ? all.find((m) => m.id === value) : undefined;
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)} disabled={disabled}>
      <SelectTrigger id={id} size={ghost ? 'sm' : 'default'}
        className={cn('w-full', ghost ? '-ml-2 h-7 max-w-60 border-transparent shadow-none hover:bg-accent dark:bg-transparent' : 'bg-background')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}><span className="text-muted-foreground">（待规划）</span></SelectItem>
        {(['active', 'planning'] as const).map((st) => {
          const items = options.filter((m) => m.status === st);
          return items.length ? (
            <SelectGroup key={st}>
              <SelectLabel className="text-xs">{MILESTONE_STATUS_LABEL[st]}</SelectLabel>
              {items.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectGroup>
          ) : null;
        })}
        {current?.status === 'released' && (
          <SelectGroup>
            <SelectLabel className="text-xs">已发布</SelectLabel>
            <SelectItem value={current.id} disabled>{current.name}</SelectItem>
          </SelectGroup>
        )}
        {value && !current && <SelectItem value={value} disabled>{value}</SelectItem>}
      </SelectContent>
    </Select>
  );
};

export default MilestoneSelect;
