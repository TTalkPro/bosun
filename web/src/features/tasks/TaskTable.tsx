import { useNavigate } from 'react-router';
import { Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import FlagIcon from '@mui/icons-material/Flag';
import EpicChip from '@/components/EpicChip';
import EpicProgressBar from '@/components/EpicProgressBar';
import BlockedChip from '@/components/BlockedChip';
import type { Status, TaskSummary } from '@/api/types';
import RelativeTime from '@/components/RelativeTime';
import SoftChip from '@/components/SoftChip';
import StatusChip from '@/components/StatusChip';
import TaskIdChip from '@/components/TaskIdChip';
import ActorChip from '@/components/ActorChip';
import { paths } from '@/routes/paths';
import { PRIORITY_COLOR, PRIORITY_LABEL } from './status';

interface Props {
  rows: TaskSummary[];
  total: number;
  loading?: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** 跨项目列表显示项目列 */
  showProject?: boolean;
  /** 紧凑：嵌在卡片里（Epic 的步骤表）；去掉标签 / 提出人 / 反馈 / 更新列和所属 Epic chip */
  compact?: boolean;
}

// 任务表格：项目页与查询页共用
const TaskTable = ({ rows, total, loading, page, pageSize, onPageChange, showProject = false, compact = false }: Props) => {
  const navigate = useNavigate();
  const allColumns: GridColDef<TaskSummary>[] = [
    { field: 'id', headerName: 'ID', width: 120, renderCell: ({ value }) => <TaskIdChip id={value as string} /> },
    ...(showProject ? [{ field: 'project_key', headerName: '项目', width: 90 } as GridColDef<TaskSummary>] : []),
    {
      field: 'title', headerName: '标题', flex: 1, minWidth: 240,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
          {row.kind === 'epic' && <Tooltip title="Epic"><FlagIcon color="secondary" fontSize="small" /></Tooltip>}
          {row.open_question && <Tooltip title="Agent 有提问待回答"><HelpOutlineIcon color="warning" fontSize="small" /></Tooltip>}
          {row.blocked && <BlockedChip />}
          <Typography variant="body2" noWrap sx={{ fontWeight: row.kind === 'epic' ? 700 : 500, minWidth: 0 }}>{row.title}</Typography>
          {row.kind === 'epic' && row.progress && <EpicProgressBar progress={row.progress} width={140} />}
          {!compact && row.epic && <EpicChip id={row.epic} />}
        </Stack>
      ),
    },
    { field: 'status', headerName: '状态', width: 110, renderCell: ({ value }) => <StatusChip status={value as Status} /> },
    { field: 'priority', headerName: '优先级', width: 90, renderCell: ({ value }) => <SoftChip label={PRIORITY_LABEL[value as keyof typeof PRIORITY_LABEL]} tone={PRIORITY_COLOR[value as keyof typeof PRIORITY_COLOR]} /> },
    {
      field: 'labels', headerName: '标签', width: 180, sortable: false,
      renderCell: ({ value }) => <Stack direction="row" spacing={0.5} sx={{ overflow: 'hidden' }}>{(value as string[]).map((l) => <Chip key={l} size="small" label={l} />)}</Stack>,
    },
    { field: 'created_by', headerName: '提出人', width: 140, renderCell: ({ row }) => <ActorChip name={row.created_by} kind={row.created_by_kind} /> },
    { field: 'assignee', headerName: '执行人', width: 140, renderCell: ({ row }) => row.assignee ? <ActorChip name={row.assignee} kind={row.assignee_kind} /> : <Typography variant="caption" color="text.disabled">—</Typography> },
    { field: 'feedback_count', headerName: '反馈', width: 70, align: 'center', headerAlign: 'center' },
    { field: 'updated_at', headerName: '更新', width: 120, renderCell: ({ value }) => <RelativeTime value={value as string} /> },
  ];
  const columns = allColumns.filter((c) => !compact || !['labels', 'created_by', 'feedback_count', 'updated_at'].includes(c.field));

  return (
    <Paper variant={compact ? 'elevation' : 'outlined'} elevation={0}>
      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        loading={loading}
        rowCount={total}
        paginationMode="server"
        paginationModel={{ page, pageSize }}
        onPaginationModelChange={(m) => onPageChange(m.page)}
        pageSizeOptions={[pageSize]}
        hideFooter={compact && total <= pageSize}
        disableRowSelectionOnClick
        disableColumnMenu
        onRowClick={({ row }) => navigate(paths.task(row.id))}
        sx={{
          border: 0,
          '& .MuiDataGrid-row': { cursor: 'pointer' },
          // renderCell 的内容（chip / 图标 / Stack）默认靠顶部对齐，统一垂直居中
          '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' },
        }}
        localeText={{ noRowsLabel: '没有任务' }}
      />
    </Paper>
  );
};

export default TaskTable;
