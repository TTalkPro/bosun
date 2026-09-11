import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { Box, Button, Card, CardActionArea, CardContent, Chip, FormControlLabel, Grid, Skeleton, Stack, Switch, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useProjects } from '@/api/projects';
import RelativeTime from '@/components/RelativeTime';
import ProjectFormDialog from '@/features/projects/ProjectFormDialog';
import { paths } from '@/routes/paths';

const ProjectsPage = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useProjects(showArchived);
  const projects = data?.projects ?? [];

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }} useFlexGap flexWrap="wrap">
        <Typography variant="h4">项目</Typography>
        <Box sx={{ flex: 1 }} />
        <FormControlLabel control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />} label="显示已归档" />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>新建项目</Button>
      </Stack>

      {isLoading && (
        <Grid container spacing={2}>
          {[0, 1, 2].map((i) => <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}><Skeleton variant="rounded" height={120} /></Grid>)}
        </Grid>
      )}

      {!isLoading && projects.length === 0 && (
        <Card variant="outlined"><CardContent>
          <Typography color="text.secondary">还没有项目。点右上角「新建项目」，或让 Agent 通过 MCP 的 <code>create_project</code> 创建。</Typography>
        </CardContent></Card>
      )}

      <Grid container spacing={2}>
        {projects.map((p) => (
          <Grid key={p.key} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card variant="outlined" sx={{ height: '100%', opacity: p.archived ? 0.6 : 1 }}>
              <CardActionArea component={RouterLink} to={paths.project(p.key)} sx={{ height: '100%', alignItems: 'stretch' }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Chip size="small" label={p.key} sx={{ fontFamily: 'monospace', fontWeight: 700 }} />
                    {p.archived && <Chip size="small" label="已归档" variant="outlined" />}
                  </Stack>
                  <Typography variant="h6" noWrap>{p.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 40 }}>
                    {p.description || '（无描述）'}
                  </Typography>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">{p.task_count} 个任务</Typography>
                    <RelativeTime value={p.updated_at} />
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      {creating && <ProjectFormDialog open onClose={() => setCreating(false)} />}
    </Box>
  );
};

export default ProjectsPage;
