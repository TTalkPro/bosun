import { Toaster as Sonner } from 'sonner';
const Toaster = (props: React.ComponentProps<typeof Sonner>) => (<Sonner theme={(localStorage.getItem('bosun.theme') as 'light' | 'dark' | null) ?? 'system'} className="toaster group" style={{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)' } as React.CSSProperties} {...props} />);
export { Toaster };
