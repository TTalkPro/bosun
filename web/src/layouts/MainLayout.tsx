import { useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router';
import { ChevronDown, Folder, Import, ListFilter, Menu, Moon, Sun, User, Users, LogOut, SearchCheck } from 'lucide-react';
import { useProjects } from '@/api/projects';
import { useFilters } from '@/api/query';
import { logout, useMe } from '@/api/auth';
import { paths } from '@/routes/paths';
import GlobalSearch from '@/components/GlobalSearch';
import { ActorAvatar } from '@/components/ActorChip';
import { } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const NAV = 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground';
const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { data } = useProjects(); const { data: filtersData } = useFilters();
  const isAdmin = useMe().data?.user.role === 'admin'; const { key } = useParams(); const { pathname, search } = useLocation();
  const current = key?.toUpperCase(); const activeFilter = pathname === paths.query ? new URLSearchParams(search).get('filter') : null;
  return (
    <div className="flex h-full w-60 flex-col overflow-y-auto">
      <div className="flex h-16 items-center px-4"><NavLink to={paths.projects} onClick={onNavigate} className="text-lg font-extrabold tracking-wide">⚓ Bosun</NavLink></div>
      <Separator />
      <nav className="flex-1 space-y-4 p-3">
        <Collapsible defaultOpen className="group/collapsible">
          <CollapsibleTrigger className="flex w-full items-center rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">项目 <span className="ml-1 opacity-70">{data?.projects.length ?? 0}</span><ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-0 -rotate-90" /></CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pt-1">
            {data?.projects.map((p) => (<NavLink key={p.key} to={paths.project(p.key)} onClick={onNavigate} className={NAV} aria-current={current === p.key ? 'page' : undefined}><Folder className="size-4 opacity-70" /><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-xs opacity-60">{p.task_count}</span></NavLink>))}
            {data?.projects.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">还没有项目</p>}
          </CollapsibleContent>
        </Collapsible>
        <Collapsible defaultOpen className="group/collapsible">
          <CollapsibleTrigger className="flex w-full items-center rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">筛选器 <span className="ml-1 opacity-70">{filtersData?.filters.length ?? 0}</span><ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-0 -rotate-90" /></CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pt-1">
            {filtersData?.filters.map((f) => (<NavLink key={f.id} to={`${paths.query}?filter=${f.id}`} onClick={onNavigate} className={NAV} aria-current={activeFilter === f.id ? 'page' : undefined}><ListFilter className="size-4 opacity-70" /><span className="min-w-0 flex-1 truncate">{f.name}</span></NavLink>))}
            <NavLink to={paths.query} onClick={onNavigate} className={NAV} aria-current={pathname === paths.query && !activeFilter ? 'page' : undefined}><SearchCheck className="size-4 opacity-70" />BQL 查询</NavLink>
          </CollapsibleContent>
        </Collapsible>
        <div className="space-y-0.5">
          <NavLink to={paths.projects} onClick={onNavigate} className={NAV} aria-current={pathname === paths.projects ? 'page' : undefined}>所有项目</NavLink>
          {isAdmin && <NavLink to={paths.data} onClick={onNavigate} className={NAV} aria-current={pathname === paths.data ? 'page' : undefined}><Import className="size-4 opacity-70" />数据导入导出</NavLink>}
        </div>
      </nav>
    </div>
  );
};

const MainLayout = () => {
  const { data: me } = useMe(); const { toggle, mode } = useTheme(); const [mobileOpen, setMobileOpen] = useState(false);
  if (!me) return null;
  const doLogout = async () => { try { await logout(); } catch { /* ignore */ } window.location.assign(paths.login); };
  return (
    <TooltipProvider delayDuration={200}>
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="flex h-16 items-center gap-2 px-3 md:px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开菜单"><Menu /></Button>
          <div className="flex-1" />
          <GlobalSearch />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-accent"><ActorAvatar name={me.user.name} kind="human" size={28} /><span className="hidden text-left sm:block"><span className="block text-sm font-semibold leading-4">{me.user.name}</span><span className="block text-xs text-muted-foreground">{me.org.name}</span></span></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild><NavLink to={paths.account}><User className="size-4" />账户与 API Key</NavLink></DropdownMenuItem>
              {me.user.role === 'admin' && <DropdownMenuItem asChild><NavLink to={paths.org}><Users className="size-4" />组织与用户</NavLink></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggle}><Sun className={cn('size-4', mode === 'light' && 'text-primary')} /><Moon className={cn('size-4', mode === 'dark' && 'text-primary')} />切换主题</DropdownMenuItem>
              <DropdownMenuItem onClick={doLogout}><LogOut className="size-4" />退出登录</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <aside className="fixed left-0 top-0 z-30 hidden h-svh border-r bg-background md:block"><Sidebar /></aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="p-0"><SheetTitle className="sr-only">导航</SheetTitle><Sidebar onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
      <main className="min-h-svh flex-1 p-4 md:ml-60 md:p-6"><div className="h-16" /><Outlet /></main>
    </TooltipProvider>
  );
};
export default MainLayout;
