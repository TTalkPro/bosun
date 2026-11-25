import type { ReactNode } from 'react';
import { Anchor, Bot, Columns3, Moon, SearchCheck, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const FEATURES = [
  { icon: Columns3, title: '看板即状态机', desc: '拖动卡片就是状态迁移；完成时附上提交与测试，打回时写明原因' },
  { icon: Bot, title: 'Agent 直接接入', desc: 'Claude Code 等通过 MCP 领任务、提反馈、交付提交与测试' },
  { icon: SearchCheck, title: 'BQL 跨项目查询', desc: '常用条件存成筛选器，侧栏一点即达' },
];

// 右侧装饰：一块缩小的看板（固定色，不跟主题；纯装饰，读屏跳过）
const BoardPreview = () => {
  const cols = [
    { title: '新建', bar: 'bg-sky-400', cards: [['w-4/5', 'w-1/2'], ['w-3/5']] },
    { title: '进行中', bar: 'bg-white', cards: [['w-full', 'w-2/3'], ['w-3/4'], ['w-1/2']] },
    { title: '已完成', bar: 'bg-amber-300', cards: [['w-2/3']] },
  ];
  return (
    <div aria-hidden className="grid grid-cols-3 gap-3 rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm">
      {cols.map((c) => (
        <div key={c.title} className="relative overflow-hidden rounded-lg bg-white/10 p-2">
          <span className={cn('absolute inset-x-0 top-0 h-0.5', c.bar)} />
          <div className="mb-2 text-[11px] font-medium text-white/80">{c.title}</div>
          <div className="space-y-1.5">
            {c.cards.map((lines, i) => (
              <div key={i} className="space-y-1 rounded-md bg-white/90 p-2 shadow-sm">
                {lines.map((w, j) => <div key={j} className={cn('h-1.5 rounded-full', j === 0 ? 'bg-slate-400' : 'bg-slate-200', w)} />)}
                <div className="flex items-center justify-between pt-0.5">
                  <div className="h-1.5 w-6 rounded-full bg-slate-200" />
                  <div className={cn('size-3 rounded-full', i % 2 ? 'bg-violet-400' : 'bg-sky-400')} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 登录 / 注册的外壳（参照 dashboard 的分栏登录页）：左边表单，右边产品介绍 + 看板缩略图；
 * 窄屏只留左边。右上角可切主题（还没登录也能选）。
 */
const AuthShell = ({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) => {
  const { mode, toggle } = useTheme();
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="relative flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Anchor className="size-4.5" /></span>
            <span className="text-base font-bold tracking-wide">Bosun</span>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="切换主题">{mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">Bosun · 人与 Agent 协作的任务管理</p>
      </div>

      <div className="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white lg:flex lg:flex-col lg:justify-center lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative mx-auto w-full max-w-lg space-y-10">
          <div className="space-y-3">
            <h2 className="text-3xl leading-tight font-bold tracking-tight">人和 Agent，<br />在同一块看板上协作</h2>
            <p className="text-white/75">任务、状态、反馈和交付证据都在一处；Agent 做了什么，一目了然。</p>
          </div>
          <BoardPreview />
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15"><f.icon className="size-4.5" /></span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-sm text-white/70">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
export default AuthShell;
