import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Props {
  label: ReactNode;
  /** 关联的控件 id（点标签聚焦） */
  htmlFor?: string;
  /** 控件下方的说明；有 error 时显示 error */
  hint?: ReactNode;
  error?: ReactNode;
  /** 标签右侧的附加信息（如字数、示例） */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * 表单项：标签 / 控件 / 说明或错误，上下各隔 8px。
 * shadcn 的 Label 自己没有外边距，直接把 Label 和 Input 叠在一起时，输入框获得焦点后 3px 的
 * focus ring 会压到标签文字上（「新建项目」的 Key 就是这样）。各面板统一用这个，不再各写各的间距。
 */
const FormField = ({ label, htmlFor, hint, error, aside, className, children }: Props) => (
  <div className={cn('grid gap-2', className)}>
    <div className="flex items-baseline justify-between gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
    </div>
    {children}
    {(error || hint) && (
      <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
        {error ?? hint}
      </p>
    )}
  </div>
);

export default FormField;
