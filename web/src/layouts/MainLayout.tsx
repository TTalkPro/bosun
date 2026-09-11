import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useParams } from 'react-router';
import {
  AppBar, Box, Collapse, Divider, Drawer, IconButton, List, ListItemButton, ListItemText,
  ListSubheader, Toolbar, Tooltip, Typography, useColorScheme, useMediaQuery, useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import FolderIcon from '@mui/icons-material/FolderOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import { useProjects } from '@/api/projects';
import { useFilters } from '@/api/query';
import { paths } from '@/routes/paths';
import GlobalSearch from '@/components/GlobalSearch';
import IdentityPanel from '@/components/IdentityPanel';
import { ActorAvatar } from '@/components/ActorChip';
import { useActor } from '@/api/identity';

const DRAWER_WIDTH = 240;

const ColorModeToggle = () => {
  const { mode, systemMode, setMode } = useColorScheme();
  const effective = mode === 'system' ? systemMode : mode;
  if (!effective) return null;
  return (
    <Tooltip title={effective === 'dark' ? '切换到浅色' : '切换到深色'}>
      <IconButton color="inherit" onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')}>
        {effective === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
};

// 可折叠的侧栏分组，折叠状态记在 localStorage
const useCollapsed = (key: string) => {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(`bosun.sidebar.${key}`) !== 'closed'; } catch { return true; }
  });
  const toggle = () => setOpen((v) => {
    try { localStorage.setItem(`bosun.sidebar.${key}`, v ? 'closed' : 'open'); } catch { /* ignore */ }
    return !v;
  });
  return [open, toggle] as const;
};

const SectionHeader = ({ title, open, onToggle, count }: { title: string; open: boolean; onToggle: () => void; count?: number }) => (
  <ListSubheader
    disableSticky
    onClick={onToggle}
    sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', pr: 1, '&:hover': { color: 'text.primary' } }}
  >
    <Box sx={{ flex: 1 }}>{title}{count != null && count > 0 && <Box component="span" sx={{ ml: 0.75, opacity: 0.7 }}>{count}</Box>}</Box>
    <ExpandMoreIcon fontSize="small" sx={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
  </ListSubheader>
);

const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const [projectsOpen, toggleProjects] = useCollapsed('projects');
  const [filtersOpen, toggleFilters] = useCollapsed('filters');
  const { data } = useProjects();
  const { data: filtersData } = useFilters();
  const { key } = useParams();
  const { pathname, search } = useLocation();
  const current = key?.toUpperCase();
  const activeFilter = pathname === paths.query ? new URLSearchParams(search).get('filter') : null;
  return (
    <Box sx={{ width: DRAWER_WIDTH }} role="navigation">
      <Toolbar sx={{ px: 2 }}>
        <Typography variant="h6" component={RouterLink} to={paths.projects} sx={{ textDecoration: 'none', color: 'inherit', fontWeight: 800, letterSpacing: 0.5 }}>
          ⚓ Bosun
        </Typography>
      </Toolbar>
      <Divider />
      <List dense subheader={<SectionHeader title="项目" open={projectsOpen} onToggle={toggleProjects} count={data?.projects.length} />}>
        <Collapse in={projectsOpen}>
        {(data?.projects ?? []).map((p) => (
          <ListItemButton
            key={p.key}
            component={RouterLink}
            to={paths.project(p.key)}
            selected={current === p.key}
            onClick={onNavigate}
          >
            <FolderIcon fontSize="small" sx={{ mr: 1.5, opacity: 0.7 }} />
            <ListItemText primary={p.name} secondary={`${p.key} · ${p.task_count} 任务`} />
          </ListItemButton>
        ))}
        {data && data.projects.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
            还没有项目
          </Typography>
        )}
        </Collapse>
      </List>
      <Divider />
      <List dense subheader={<SectionHeader title="筛选器" open={filtersOpen} onToggle={toggleFilters} count={filtersData?.filters.length} />}>
        <Collapse in={filtersOpen}>
        {(filtersData?.filters ?? []).map((f) => (
          <ListItemButton key={f.id} component={RouterLink} to={`${paths.query}?filter=${f.id}`} selected={activeFilter === f.id} onClick={onNavigate}>
            <FilterListIcon fontSize="small" sx={{ mr: 1.5, opacity: 0.7 }} />
            <ListItemText primary={f.name} secondary={f.query} slotProps={{ secondary: { noWrap: true, sx: { fontFamily: 'monospace', fontSize: 11 } } }} />
          </ListItemButton>
        ))}
        </Collapse>
        <ListItemButton component={RouterLink} to={paths.query} selected={pathname === paths.query && !activeFilter} onClick={onNavigate}>
          <ManageSearchIcon fontSize="small" sx={{ mr: 1.5, opacity: 0.7 }} />
          <ListItemText primary="BQL 查询" secondary="跨项目筛选 / 新建筛选器" />
        </ListItemButton>
      </List>
      <Divider />
      <List dense>
        <ListItemButton component={RouterLink} to={paths.projects} selected={pathname === paths.projects} onClick={onNavigate}>
          <ListItemText primary="所有项目" />
        </ListItemButton>
        <ListItemButton component={RouterLink} to={paths.data} selected={pathname === paths.data} onClick={onNavigate}>
          <ImportExportIcon fontSize="small" sx={{ mr: 1.5, opacity: 0.7 }} />
          <ListItemText primary="数据导入导出" />
        </ListItemButton>
      </List>
    </Box>
  );
};

const WhoAmI = () => {
  const actor = useActor();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="我是谁（点击修改）">
        <Box onClick={() => setOpen(true)} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' } }}>
          <ActorAvatar name={actor} kind="human" size={26} />
          <Typography variant="body2" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>{actor}</Typography>
        </Box>
      </Tooltip>
      {open && <IdentityPanel onClose={() => setOpen(false)} />}
    </>
  );
};

const MainLayout = () => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          {!isDesktop && (
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} aria-label="打开菜单">
              <MenuIcon />
            </IconButton>
          )}
          <Box sx={{ flex: 1 }} />
          <GlobalSearch />
          <WhoAmI />
          <ColorModeToggle />
        </Toolbar>
      </AppBar>
      {isDesktop ? (
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}>
          <Sidebar />
        </Drawer>
      ) : (
        <Drawer open={open} onClose={() => setOpen(false)}>
          <Sidebar onNavigate={() => setOpen(false)} />
        </Drawer>
      )}
      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 3 } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;
