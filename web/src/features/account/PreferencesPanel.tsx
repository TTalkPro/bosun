import { useState } from 'react';
import { Check } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import Section from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BOARD_SORTS, SORT_LABEL, type BoardSort } from '@/features/board/rules';
import { PAGE_SIZES, rememberPageSize, storedPageSize } from '@/features/tasks/columns';
import { rememberSort, rememberView, storedSort, storedView, type TasksView } from '@/features/tasks/prefs';
import { ACCENTS, setAccent, useAccent } from '@/hooks/use-accent';
import { cn } from '@/lib/utils';

const Row = ({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3 px-5 py-3">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
    {children}
  </div>
);

/** 主题色 + 项目页偏好（都只存在这个浏览器里） */
const PreferencesPanel = () => {
  const accent = useAccent();
  const { enqueueSnackbar } = useSnackbar();
  const [view, setView] = useState<TasksView>(storedView);
  const [size, setSize] = useState<number>(storedPageSize);
  const [sort, setSort] = useState<BoardSort>(storedSort);
  const saved = () => enqueueSnackbar('已保存', { variant: 'success', autoHideDuration: 1000 });

  return (
    <>
      <Section title="主题色" description="按钮、选中项等处的强调色；「进行中」状态也跟着它，其余状态色与图表色不变">
        <div className="flex flex-wrap items-center gap-3">
          {ACCENTS.map((a) => (
            <button key={a.key} type="button" onClick={() => setAccent(a.key)} aria-pressed={accent === a.key} aria-label={`主题色：${a.label}`}
              className={cn('flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-xs transition-colors',
                accent === a.key ? 'border-primary' : 'border-transparent hover:border-border')}>
              <span className="flex size-8 items-center justify-center rounded-full text-white shadow-sm" style={{ background: a.swatch }}>
                {accent === a.key && <Check className="size-4" />}
              </span>
              {a.label}
            </button>
          ))}
          <div className="ml-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2">
            <span className="text-xs text-muted-foreground">预览</span>
            <Button size="sm" className="h-7">主要按钮</Button>
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">选中</span>
          </div>
        </div>
      </Section>

      <Section title="偏好" description="项目页平时会记住你最后一次的选择；这里可以直接改" bodyClassName="divide-y p-0">
        <Row label="项目页默认视图" hint="打开项目时先看看板还是列表（链接里写了 view 的以链接为准）">
          <Select value={view} onValueChange={(v) => { setView(v as TasksView); rememberView(v as TasksView); saved(); }}>
            <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="board">看板</SelectItem><SelectItem value="list">列表</SelectItem></SelectContent>
          </Select>
        </Row>
        <Row label="列表每页行数" hint="项目列表与 BQL 查询结果">
          <Select value={String(size)} onValueChange={(v) => { setSize(Number(v)); rememberPageSize(Number(v)); saved(); }}>
            <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} 行</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="看板列内排序" hint="每一列里卡片的先后">
          <Select value={sort} onValueChange={(v) => { setSort(v as BoardSort); rememberSort(v as BoardSort); saved(); }}>
            <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{BOARD_SORTS.map((s) => <SelectItem key={s} value={s}>{SORT_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
      </Section>
    </>
  );
};

export default PreferencesPanel;
