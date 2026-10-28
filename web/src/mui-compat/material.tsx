import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Button as ShadButton } from '@/components/ui/button';
import { Dialog as ShadDialog, DialogContent as ShadDialogContent } from '@/components/ui/dialog';
import { Input as ShadInput } from '@/components/ui/input';
import { Textarea as ShadTextarea } from '@/components/ui/textarea';
import { Skeleton as ShadSkeleton } from '@/components/ui/skeleton';
import { Switch as ShadSwitch } from '@/components/ui/switch';
import { Checkbox as ShadCheckbox } from '@/components/ui/checkbox';
import { Tooltip as ShadTooltip, TooltipContent as ShadTooltipContent, TooltipProvider as ShadTooltipProvider, TooltipTrigger as ShadTooltipTrigger } from '@/components/ui/tooltip';
import { Progress as ShadProgress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type Css = React.CSSProperties;
const S = 8;
const mergeSx = (sx: unknown): Css => {
  if (!sx) return {};
  if (Array.isArray(sx)) return sx.reduce<Css>((a, x) => ({ ...a, ...mergeSx(x) }), {});
  if (typeof sx !== 'object') return {};
  const o = sx as Record<string, unknown>; const out: Record<string, unknown> = {};
  const px = (v: unknown) => typeof v === 'number' ? v * S : v;
  for (const [k, v] of Object.entries(o)) {
    if (v == null || typeof v === 'object') continue;
    if (k === 'spacing' || k === 'gap') out.gap = px(v);
    else if (k.startsWith('p') && ['p','px','py','pt','pr','pb','pl'].includes(k)) out[k === 'p' ? 'padding' : ({px:'paddingInline',py:'paddingBlock',pt:'paddingTop',pr:'paddingRight',pb:'paddingBottom',pl:'paddingLeft'} as any)[k]] = px(v);
    else if (k.startsWith('m') && ['m','mx','my','mt','mr','mb','ml'].includes(k)) out[k === 'm' ? 'margin' : ({mx:'marginInline',my:'marginBlock',mt:'marginTop',mr:'marginRight',mb:'marginBottom',ml:'marginLeft'} as any)[k]] = px(v);
    else if (k === 'bgcolor' || k === 'backgroundColor') out.background = v;
    else out[k as keyof Css] = v as never;
  }
  return out as Css;
};
const sxProps = ({ sx, style }: any) => ({ style: { ...mergeSx(sx) as any, ...style as any } });

type DivProps = React.ComponentProps<'div'> & { sx?: unknown };
export const Box: any = ({ sx, ...rest }: DivProps) => <div {...sxProps({ sx, ...rest })} {...rest} />;
export const Paper: any = ({ variant, sx, ...rest }: any) => <div className={cn('rounded-[10px] border bg-card text-card-foreground', variant !== 'elevation' && 'border-border', typeof sx === 'object' && 'p-2')} {...sxProps({ sx, ...rest })} {...rest} />;
export const Stack: any = ({ direction = 'column', spacing, useFlexGap, ...rest }: any) => (
  <div {...sxProps({ sx: { display: 'flex', flexDirection: direction, gap: spacing, alignItems: rest.sx && undefined, ...rest.sx }, ...rest })} {...rest} />
);
export const Divider: any = ({ sx }: { sx?: unknown }) => <hr className="border-border" style={mergeSx(sx)} />;
export const Typography: any = ({ variant = 'body1', color, noWrap, component, sx, className, ...rest }: any) => {
  const cls: Record<string, string> = { h1:'text-4xl font-bold', h4:'text-3xl font-bold', h5:'text-2xl font-bold', h6:'text-xl font-semibold', subtitle1:'text-lg font-semibold', subtitle2:'text-sm font-semibold', body1:'text-base', body2:'text-sm', caption:'text-xs', button:'text-sm font-medium' };
  const C = (component ?? (variant.startsWith('h') ? variant : 'p')) as React.ElementType;
  return <C className={cn(cls[variant], color === 'text.secondary' ? 'text-muted-foreground' : color === 'text.disabled' ? 'text-muted-foreground/60' : color === 'error' ? 'text-destructive' : color === 'success.main' ? 'text-emerald-600 dark:text-emerald-400' : color, noWrap && 'truncate', className)} style={mergeSx(sx)} {...rest} />;
};
const buttonVariants = { contained:'default', outlined:'outline', text:'ghost' } as const;
const buttonColors = { primary:'', secondary:'secondary', error:'destructive', inherit:'ghost', warning:'outline' } as const;
export const Button: any = ({ variant='text', color='primary', size='medium', startIcon, fullWidth, sx, ...rest }: any) => (
  <ShadButton variant={buttonVariants[variant]} size={size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'default'} className={cn(fullWidth && 'w-full')} style={mergeSx(sx)} {...rest}>{startIcon}<span className="inline-flex items-center gap-1">{rest.children}</span></ShadButton>
);
export const IconButton: any = ({ size, edge, color, sx, ...rest }: any) => <button className={cn('inline-flex size-8 items-center justify-center rounded-md hover:bg-accent', size === 'small' && 'size-6')} style={mergeSx(sx)} {...rest} />;
export const Link: any = ({ component: C = 'a', underline, variant, sx, ...rest }: any) => <C className={cn('text-primary hover:underline', variant === 'body2' && 'text-sm')} style={mergeSx(sx)} {...rest} />;
export const Card: any = ({ variant, sx, ...rest }: any) => <div className="rounded-[10px] border bg-card text-card-foreground" style={mergeSx(sx)} {...rest} />;
export const CardActionArea: any = ({ component: C = 'div', sx, ...rest }: any) => <C className="block h-full text-left" style={mergeSx(sx)} {...rest} />;
export const CardContent: any = ({ sx, ...rest }: any) => <div className="p-4" style={mergeSx(sx)} {...rest} />;
export const Chip: any = ({ label, icon, size='medium', variant='filled', color='default', clickable, onClick, onDelete, sx }: any) => (
  <span onClick={onClick} className={cn('inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold', variant === 'outlined' ? 'border' : 'bg-muted text-foreground', color === 'primary' && 'bg-primary/12 text-primary', color === 'success' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', size === 'small' && 'h-5', clickable && 'cursor-pointer', sx?.fontFamily && 'font-mono')} style={mergeSx(sx)}>{icon}{label}{onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</button>}</span>
);
export const Alert: any = ({ severity='info', children, action, icon=true, sx }: any) => (<div className={cn('flex gap-2 rounded-md border p-3 text-sm', severity==='error' && 'border-destructive/30 bg-destructive/10 text-destructive', severity==='warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400', severity==='success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', !severity && 'bg-muted')} style={mergeSx(sx)}>{icon && <>{severity==='error'?<AlertCircle className="size-4"/>:severity==='warning'?<AlertTriangle className="size-4"/>:severity==='success'?<CheckCircle className="size-4"/>:<Info className="size-4"/>}</>}<div className="min-w-0">{children}</div>{action}</div>);
export const Skeleton: any = ({ variant, width, height, sx }: any) => <ShadSkeleton className={cn('w-full', variant==='circular' && 'rounded-full rounded-full')} style={{ width, height, ...mergeSx(sx) }} />;
export const LinearProgress: any = ({ sx }: { sx?: unknown }) => <div style={mergeSx(sx)}><ShadProgress value={undefined} aria-label="加载中" /></div>;
export const Grid: any = ({ container, spacing, size, children, sx, ...rest }: any) => {
  const cls = container ? (spacing ? `grid gap-${spacing * 2}` : 'grid') : '';
  const span = typeof size === 'object' ? size : { xs: 12, ...size };
  const colCls = container ? `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` : '';
  return <div className={cn(cls, colCls)} style={{ ...mergeSx(sx), gridColumn: container ? undefined : `span 1 / span 1` }} {...rest}>{children}</div>;
};
export const Collapse: any = ({ in: open, children, sx }: any) => open ? <div style={mergeSx(sx)}>{children}</div> : null;
export const Drawer: any = ({ open, anchor='left', onClose, variant, children, PaperProps, sx }: any) => {
  if (variant === 'permanent') return <div className="fixed left-0 top-0 h-svh" style={{ width: 240, ...mergeSx(PaperProps?.sx) }}>{children}</div>;
  return open ? (<div className="fixed inset-0 z-50 bg-black/20" onClick={onClose}><div onClick={(e) => e.stopPropagation()} className={cn('absolute h-full bg-background shadow-lg', anchor==='right'?'right-0':'left-0')} style={{ width: anchor==='right'?'min(100%,66.67vw)':240, ...mergeSx(PaperProps?.sx) }}>{children}</div></div>) : null;
};
export const Menu: any = ({ open, anchorEl, onClose, children }: any) => open && anchorEl ? (<div className="fixed inset-0 z-50" onClick={onClose}><div onClick={(e) => e.stopPropagation()} className="absolute rounded-md border bg-popover p-1 shadow">{children}</div></div>) : null;
export const MenuItem: any = ({ children, ...rest }: React.ComponentProps<'button'>) => <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent" {...rest}>{children}</button>;
export const List: any = ({ dense, subheader, children, sx, ...rest }: any) => <div style={mergeSx(sx)} {...rest}>{subheader}{children}</div>;
export const ListItemButton: any = ({ selected, children, ...rest }: any) => <button className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent', selected && 'bg-accent font-medium')} {...rest}>{children}</button>;
export const ListItemIcon: any = ({ children }: any) => <span className="inline-flex">{children}</span>;
export const ListItemText: any = ({ primary, secondary }: any) => <span className="min-w-0"><span className="block truncate">{primary}</span>{secondary && <span className="block truncate text-xs text-muted-foreground">{secondary}</span>}</span>;
export const ListSubheader: any = ({ children, ...rest }: any) => <div className="flex items-center px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground" {...rest}>{children}</div>;
export const AppBar: any = ({ position, children, sx }: any) => <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/90 backdrop-blur" style={mergeSx(sx)}>{children}</header>;
export const Toolbar: any = ({ children, disableGutters, sx, ...rest }: any) => <div className="flex h-16 items-center gap-2 px-3 md:px-4" style={mergeSx(sx)} {...rest}>{children}</div>;
export const Breadcrumbs: any = ({ children, sx }: any) => <nav className="mb-2 flex items-center gap-1 text-sm text-muted-foreground" style={mergeSx(sx)}>{children}</nav>;
export const Table: any = ({ sx, ...rest }: React.ComponentProps<'table'> & { sx?: unknown }) => <table className="w-full text-sm" style={mergeSx(sx)} {...rest} />;
export const TableHead: any = (p: React.ComponentProps<'thead'>) => <thead {...p} />;
export const TableBody: any = (p: React.ComponentProps<'tbody'>) => <tbody {...p} />;
export const TableRow: any = ({ sx, ...rest }: React.ComponentProps<'tr'> & { sx?: unknown }) => <tr className="border-b" style={mergeSx(sx)} {...rest} />;
export const TableCell: any = ({ align, sx, ...rest }: React.ComponentProps<'td'> & { sx?: unknown }) => <td className={cn('p-2', align==='right' && 'text-right')} style={mergeSx(sx)} {...rest} />;
export const TableContainer: any = (p: React.ComponentProps<'div'>) => <div {...p} />;
export const Switch: any = ({ checked, onChange }: any) => <ShadSwitch checked={!!checked} onCheckedChange={onChange?.({ target: { checked: !checked } })} />;
export const Checkbox: any = ({ checked, onChange }: any) => <ShadCheckbox checked={!!checked} onCheckedChange={onChange?.({ target: { checked: !checked } })} />;
export const Radio: any = (p: any) => <input type="radio" {...p} />;
export const RadioGroup: any = ({ children, ...rest }: any) => <div {...rest}>{children}</div>;
export const FormControlLabel: any = ({ control, label }: any) => <label className="flex items-center gap-2 text-sm">{control}{label}</label>;
export const TextField: any = ({ label, select, multiline, minRows, maxRows, error, helperText, InputProps, inputProps, fullWidth, children, value, onChange, sx, ...rest }: any) => {
  const id = React.useId(); const field = (<div className={fullWidth ? 'w-full' : ''}>
    {label && <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>}
    {select ? <select id={id} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={onChange}>{React.Children.map(children, (c: any) => c && <option value={c.props.value}>{c.props.children}</option>)}</select>
    : multiline ? <ShadTextarea id={id} className="min-h-20 font-mono text-sm" rows={minRows ?? 3} value={value} onChange={onChange} {...rest} {...inputProps} />
    : <ShadInput id={id} aria-invalid={!!error} value={value} onChange={onChange} {...rest} {...inputProps} />}
    {helperText && <p className={cn('mt-1 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{helperText}</p>}
  </div>);
  return InputProps?.endAdornment ? <div className="relative">{field}{InputProps.endAdornment}</div> : field;
};
export const MenuItemField: any = ({ value, children }: any) => <option value={value}>{children}</option>;
export const InputBase: any = ({ sx, ...rest }: any) => <input className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" style={mergeSx(sx)} {...rest} />;
export const InputAdornment: any = ({ children }: any) => <span className="absolute right-2 top-8 inline-flex">{children}</span>;
export const Autocomplete: any = ({ options, value, inputValue, onInputChange, onChange, getOptionLabel, renderOption, renderInput, multiple, freeSolo, size, sx, ...rest }: any) => {
  const [open, setOpen] = React.useState(false); const q = inputValue ?? '';
  const hits = q ? options.filter((o: any) => getOptionLabel(o).toLowerCase().includes(q.toLowerCase())) : options;
  return <div className="relative" style={mergeSx(sx)}>{React.cloneElement(renderInput({ InputProps: {}, inputProps: { onFocus: () => setOpen(true), onBlur: () => setTimeout(() => setOpen(false), 150) } }), { value: q, onChange: (e: any) => onInputChange?.(e, e.target.value, 'input') })}
    {open && hits.length > 0 && <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-sm">{hits.map((o: any, i: number) => <li key={i} onMouseDown={() => onChange?.(null, multiple ? [...(value ?? []), getOptionLabel(o)] : o, 'selectOption')}>{renderOption ? renderOption({ key: i }, o) : getOptionLabel(o)}</li>)}</ul>}
  </div>;
};
export const ToggleButtonGroup: any = ({ value, onChange, exclusive, size, children, sx }: any) => <div className="inline-flex overflow-hidden rounded-md border" style={mergeSx(sx)}>{React.Children.map(children, (c: any) => React.cloneElement(c, { 'aria-pressed': c.props.value === value, onClick: () => onChange?.(null, c.props.value, null), className: cn('px-3 py-1 text-sm hover:bg-accent', c.props.value === value && 'bg-accent font-medium') }))}</div>;
export const ToggleButton: any = ({ children, ...rest }: any) => <button type="button" {...rest}>{children}</button>;
export const Dialog: any = ({ open, onClose, maxWidth, children, PaperProps }: any) => (<ShadDialog open={!!open} onOpenChange={(n) => !n && onClose?.({}, 'backdropClick')}><ShadDialogContent className={maxWidth === 'xs' ? 'sm:max-w-sm' : maxWidth === 'md' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>{children}</ShadDialogContent></ShadDialog>);
export const DialogTitle: any = ({ children, sx }: any) => <h2 className="text-lg font-semibold" style={mergeSx(sx)}>{children}</h2>;
export const DialogContent: any = ({ children, sx }: any) => <div className="space-y-3 py-3" style={mergeSx(sx)}>{children}</div>;
export const DialogContentText: any = ({ children, component }: any) => <div className="text-sm text-muted-foreground">{children}</div>;
export const DialogActions: any = ({ children, sx }: any) => <div className="flex justify-end gap-2" style={mergeSx(sx)}>{children}</div>;
export const Tooltip: any = ({ title, children, ...rest }: any) => title ? (<ShadTooltipProvider><ShadTooltip><ShadTooltipTrigger asChild>{children}</ShadTooltipTrigger><ShadTooltipContent>{title}</ShadTooltipContent></ShadTooltip></ShadTooltipProvider>) : children;
export function useMediaQuery(query: string) { return React.useSyncExternalStore((cb) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb); }, () => window.matchMedia(query).matches, () => false); }
export function useTheme() { return { breakpoints: { up: (v: string) => ({ md: '(min-width: 768px)', sm: '(min-width: 640px)', lg: '(min-width: 1024px)' }[v] ?? '(min-width: 768px)') }, zIndex: { drawer: 30, modal: 50 } }; }
export function useColorScheme() { const mode = localStorage.getItem('bosun.theme') as 'light'|'dark'|null ?? (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'); return { mode, systemMode: mode, setMode: (m: string) => { localStorage.setItem('bosun.theme', m); document.documentElement.classList.toggle('dark', m==='dark'); } }; }
export const alpha: any = (_c: unknown, amount: number) => `color-mix(in oklab, var(--foreground) ${Math.round(amount*100)}%, transparent)`;
export function styled(C: any, fn?: any) { return ({ sx, ...rest }: any) => { const style = fn?.({ theme: { palette:{divider:'var(--border)',primary:{main:'var(--primary)'},background:{paper:'var(--card)'},text:{primary:'var(--foreground)',secondary:'var(--muted-foreground)',disabled:'var(--muted-foreground)'},common:{white:'#fff'}}, shape:{borderRadius:10}, typography:{fontFamily:'Inter'}, shadows:['none','none','0 2px 8px #0001','none','0 6px 16px #0002'] }, rest }); return <C {...rest} style={{ ...style, ...mergeSx(sx) }} />; }; }
export const DataGrid: any = ({ rows, columns, loading, onRowClick, page, pageSize, rowCount, onPageChange, hideFooter, localeText, sx }: any) => (
  <div style={mergeSx(sx)}><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{columns.map((c:any)=><th key={c.field} className="border-b p-2 text-left font-medium">{c.headerName}</th>)}</tr></thead><tbody>{loading && <tr><td className="p-4 text-muted-foreground" colSpan={columns.length}>加载中…</td></tr>}{!loading && rows.length===0 && <tr><td className="p-4 text-muted-foreground" colSpan={columns.length}>{localeText?.noRowsLabel ?? '没有数据'}</td></tr>}{rows.map((r:any,ri:number)=><tr key={r.id ?? ri} onClick={onRowClick ? () => onRowClick({ row:r }) : undefined} className={cn('cursor-pointer hover:bg-accent/60', ri%2 && 'bg-muted/20')}>{columns.map((c:any)=><td key={c.field} className="p-2 align-middle">{c.renderCell ? c.renderCell({ row:r, value:r[c.field] }) : String(r[c.field] ?? '')}</td>)}</tr>)}</tbody></table></div>
  {!hideFooter && rowCount > pageSize && <div className="flex items-center justify-end gap-2 p-2 text-sm"><span>第 {page + 1} 页</span><ShadButton variant="outline" size="sm" disabled={page===0} onClick={() => onPageChange?.(page-1)}>上一页</ShadButton><ShadButton variant="outline" size="sm" disabled={(page+1)*pageSize >= rowCount} onClick={() => onPageChange?.(page+1)}>下一页</ShadButton></div>}
  </div>
);
export const CssBaseline: any = () => null;
export const InitColorSchemeScript: any = (_p: any) => null;
export const ThemeProvider: any = ({ children }: any) => <>{children}</>;

export type ChipProps = any;
export type TypographyProps = any;
export type GridColDef<T = any> = { field: string; headerName?: string; width?: number; flex?: number; minWidth?: number; sortable?: boolean; align?: string; headerAlign?: string; renderCell?: (x: any) => any };
