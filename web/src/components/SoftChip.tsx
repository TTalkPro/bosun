import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
export type Tone = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
const TONE: Record<Tone, string> = { default:'bg-muted text-foreground', primary:'bg-primary/15 text-primary', secondary:'bg-secondary text-secondary-foreground', success:'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400', warning:'bg-amber-500/15 text-amber-700 dark:text-amber-400', error:'bg-destructive/12 text-destructive', info:'bg-sky-500/12 text-sky-700 dark:text-sky-400' };
type SoftChipProps = ComponentProps<'span'> & { tone?: Tone; label?: ReactNode; icon?: ReactNode };
const SoftChip = ({ className, tone = 'default', label, icon, children, ...rest }: SoftChipProps) => (<span className={cn('inline-flex h-5.5 max-w-full items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap [&_svg]:size-3', TONE[tone], className)} {...rest}>{icon}{label ?? children}</span>);
export default SoftChip;
