import { Toaster as Sonner } from 'sonner';
import { useThemeMode } from '@/hooks/use-theme';
const Toaster = (props: React.ComponentProps<typeof Sonner>) => (<Sonner theme={useThemeMode()} className="toaster group" style={{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)' } as React.CSSProperties} {...props} />);
export { Toaster };
