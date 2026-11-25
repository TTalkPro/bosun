import { useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router';
import { Anchor, ChevronDown, ChevronsUpDown, FolderKanban, Import, LayoutGrid, ListFilter, LogOut, Menu, Moon, SearchCheck, Sun, User, Users, Milestone as MilestoneIcon } from 'lucide-react';
import { useProjects } from '@/api/projects';
import { useFilters } from '@/api/query';
import { logout, useMe } from '@/api/auth';
import { paths } from '@/routes/paths';
import GlobalSearch from '@/components/GlobalSearch';
import { ActorAvatar } from '@/components/ActorChip';
import ProjectMark from '@/components/ProjectMark';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/use-theme';

// 高亮（aria-current）由下面各链接自己算：NavLink 按路径前缀匹配、不看查询串，
// 会让 /query 下所有筛选器、/projects/X 下的「所有项目」一起亮
const NAV = 'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-70';

const GroupLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pb-1 text-xs font-medium text-sidebar-foreground/60">{children}</div>
);

const CollapsibleGroup = ({ label, count, children }: { label: string; count?: number; children: ReactNode }) => (
  <Collapsible defaultOpen className="group/collapsible">
    <CollapsibleTrigger className="flex h-7 w-full items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground">
      {label}{count != null && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
      <ChevronDown className="ml-auto size-3.5 -rotate-90 transition-transform group-data-[state=open]/collapsible:rotate-0" />
    </CollapsibleTrigger>
    <CollapsibleContent className="space-y-0.5 pt-0.5">{children}</CollapsibleContent>
  </Collapsible>
);

const UserMenu = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { data: me } = useMe();
  const { toggle, mode } = useTheme();
  if (!me) return null;
  const doLogout = async () => { try { await logout(); } catch { /* ignore */ } window.location.assign(`${paths.login}?signedout=1`); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent">
        <ActorAvatar name={me.user.name} kind="human" size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-4">{me.user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{me.org.name}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-52">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold">{me.user.name}</div>
          <div className="text-xs text-muted-foreground">{me.org.name} · {me.user.role === 'admin' ? '管理员' : '成员'}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to={paths.account} onClick={onNavigate}><User className="size-4" />账户与 API Key</Link></DropdownMenuItem>
        <DropdownMenuItem onClick={toggle}>{mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}{mode === 'dark' ? '浅色模式' : '深色模式'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={doLogout}><LogOut className="size-4" />退出登录</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { data } = useProjects(); const { data: filtersData } = useFilters();
  const me = useMe().data;
  const isAdmin = me?.user.role === 'admin'; const { key } = useParams(); const { pathname, search } = useLocation();
  const current = key?.toUpperCase();
  // 项目页 URL 上明确选了哪个 milestone（侧栏子项高亮用）
  const currentMs = key ? new URLSearchParams(search).get('m')?.toUpperCase() : undefined; const activeFilter = pathname === paths.query ? new URLSearchParams(search).get('filter') : null;
  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center px-3">
        <Link to={paths.projects} onClick={onNavigate} className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><Anchor className="size-4.5" /></span>
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-bold tracking-wide">Bosun</span>
            <span className="block truncate text-xs text-muted-foreground">{me?.org.name ?? '任务协作'}</span>
          </span>
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        <div className="space-y-0.5">
          <GroupLabel>工作区</GroupLabel>
          <Link to={paths.projects} onClick={onNavigate} className={NAV} aria-current={pathname === paths.projects ? 'page' : undefined}><LayoutGrid />所有项目</Link>
          <Link to={paths.query} onClick={onNavigate} className={NAV} aria-current={pathname === paths.query && !activeFilter ? 'page' : undefined}><SearchCheck />BQL 查询</Link>
        </div>
        <CollapsibleGroup label="项目" count={data?.projects.length ?? 0}>
          {data?.projects.map((p) => (
            <div key={p.key}>
              <Link to={paths.project(p.key)} onClick={onNavigate} className={NAV}
                aria-current={current === p.key && !(p.active_milestone && currentMs === p.active_milestone.id) ? 'page' : undefined}>
                <ProjectMark projectKey={p.key} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="rounded-full px-1.5 text-[11px] tabular-nums text-muted-foreground">{p.task_count}</span>
              </Link>
              {/* 进行中的 milestone：项目下面单独一行子项（树形缩进 + 左侧竖线），点了进这次发布的看板 */}
              {p.active_milestone && (
                <Link to={`${paths.project(p.key)}?view=board&m=${p.active_milestone.id}`} onClick={onNavigate}
                  title={`进行中的 milestone ${p.active_milestone.name}：完成 ${p.active_milestone.percent}%`}
                  aria-current={currentMs === p.active_milestone.id ? 'page' : undefined}
                  className="ml-[18px] flex h-7 items-center gap-2 border-l border-sidebar-border pl-3.5 pr-2 text-xs text-sidebar-foreground/70 transition-colors hover:text-sidebar-accent-foreground aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground">
                  <MilestoneIcon className="size-3.5 shrink-0 opacity-70" />
                  <span className="min-w-0 truncate">{p.active_milestone.name}</span>
                  <span className="ml-auto h-1 w-10 shrink-0 overflow-hidden rounded-full bg-sidebar-accent" aria-hidden>
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${p.active_milestone.percent}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{p.active_milestone.percent}%</span>
                </Link>
              )}
            </div>
          ))}
          {data?.projects.length === 0 && <p className="px-2 py-1 text-sm text-muted-foreground">还没有项目</p>}
        </CollapsibleGroup>
        <CollapsibleGroup label="筛选器" count={filtersData?.filters.length ?? 0}>
          {filtersData?.filters.map((f) => (
            <Link key={f.id} to={`${paths.query}?filter=${f.id}`} onClick={onNavigate} className={NAV} aria-current={activeFilter === f.id ? 'page' : undefined}><ListFilter /><span className="min-w-0 flex-1 truncate">{f.name}</span></Link>
          ))}
          {filtersData?.filters.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">在 BQL 查询页保存的筛选器会出现在这里</p>}
        </CollapsibleGroup>
        {isAdmin && (
          <div className="space-y-0.5">
            <GroupLabel>管理</GroupLabel>
            <Link to={paths.org} onClick={onNavigate} className={NAV} aria-current={pathname === paths.org ? 'page' : undefined}><Users />组织与用户</Link>
            <Link to={paths.data} onClick={onNavigate} className={NAV} aria-current={pathname === paths.data ? 'page' : undefined}><Import />数据导入导出</Link>
          </div>
        )}
      </nav>
      <div className="border-t p-2"><UserMenu onNavigate={onNavigate} /></div>
    </div>
  );
};

// 页眉左侧的位置提示：项目页显示项目名，其余按路由给个标题
const HeaderTitle = () => {
  const { pathname } = useLocation(); const { key } = useParams(); const { data } = useProjects();
  if (key) {
    const p = data?.projects.find((x) => x.key === key.toUpperCase());
    return (
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <Link to={paths.projects} className="text-muted-foreground hover:text-foreground">项目</Link>
        <span className="text-muted-foreground/50">/</span>
        <ProjectMark projectKey={key.toUpperCase()} />
        <span className="truncate font-medium">{p?.name ?? key.toUpperCase()}</span>
      </span>
    );
  }
  const title = pathname === paths.projects ? '所有项目' : pathname === paths.query ? 'BQL 查询' : pathname === paths.account ? '账户' : pathname === paths.org ? '组织与用户' : pathname === paths.data ? '数据导入导出' : null;
  return title ? <span className="flex items-center gap-2 text-sm font-medium"><FolderKanban className="size-4 text-muted-foreground" />{title}</span> : null;
};

const MainLayout = () => {
  const { data: me } = useMe(); const { toggle, mode } = useTheme(); const [mobileOpen, setMobileOpen] = useState(false);
  if (!me) return null;
  return (
    <TooltipProvider delayDuration={200}>
      {/* 桌面端从侧栏右边开始：整行铺满的话半透明模糊层会盖在侧栏品牌上（看不清也点不到） */}
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/85 backdrop-blur md:left-64">
        <div className="flex h-14 items-center gap-2 px-3 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="打开菜单"><Menu /></Button>
          <div className="min-w-0 flex-1"><HeaderTitle /></div>
          <GlobalSearch />
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="切换主题">{mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>
          </TooltipTrigger><TooltipContent>{mode === 'dark' ? '浅色模式' : '深色模式'}</TooltipContent></Tooltip>
        </div>
      </header>
      <aside className="fixed left-0 top-0 z-30 hidden h-svh border-r md:block"><Sidebar /></aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="w-64 p-0"><SheetTitle className="sr-only">导航</SheetTitle><Sidebar onNavigate={() => setMobileOpen(false)} /></SheetContent></Sheet>
      <main className="min-h-svh min-w-0 flex-1 px-4 pb-6 md:ml-64 md:px-6"><div className="h-14" /><div className="pt-5"><Outlet /></div></main>
    </TooltipProvider>
  );
};
export default MainLayout;
