import { useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Paper, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useSnackbar } from 'notistack';
import { mutate } from 'swr';
import { client } from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useApiError } from '@/components/useApiError';

interface ImportSummary { mode: string; projects: number; tasks: number; feedback: number; filters: number }

// 整库导出 / 导入（JSON）。导出走浏览器下载；导入读文件后 POST，后端整体事务 + 重建索引
const DataPage = () => {
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const doImport = async () => {
    if (!file) return;
    setConfirmReplace(false);
    setBusy(true);
    try {
      const text = await file.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { enqueueSnackbar('不是合法的 JSON 文件', { variant: 'error' }); return; }
      const { data } = await client.post<ImportSummary>(`/import?mode=${mode}`, body);
      setResult(data);
      enqueueSnackbar('导入完成', { variant: 'success' });
      await mutate(() => true); // 所有缓存失效
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>数据导入导出</Typography>
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>导出</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            把全部项目、任务（含状态历史）、Feedback（含作废版本）、筛选器和序号计数器导成一个 JSON 文件。搜索索引不导出，导入时自动重建。
          </Typography>
          <Button variant="contained" startIcon={<DownloadIcon />} href="/api/v1/export" download>下载 JSON</Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontFamily: 'monospace' }}>
            命令行：scripts/export.sh out.json
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>导入</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            读取上面导出的 JSON。整个导入是一个事务：任何一条记录不合法就全部回滚。
          </Typography>
          <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')} sx={{ mb: 1.5 }}>
            <FormControlLabel value="merge" control={<Radio size="small" />} label="合并（同 ID 覆盖，其余保留）" />
            <FormControlLabel value="replace" control={<Radio size="small" />} label="替换（先清空再写入）" />
          </RadioGroup>
          <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => fileRef.current?.click()}>选择文件</Button>
            <Typography variant="body2" color={file ? 'text.primary' : 'text.disabled'}>{file ? `${file.name}（${(file.size / 1024).toFixed(1)} KB）` : '未选择'}</Typography>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" color={mode === 'replace' ? 'error' : 'primary'} disabled={!file || busy} onClick={() => (mode === 'replace' ? setConfirmReplace(true) : doImport())}>
              {mode === 'replace' ? '清空并导入' : '合并导入'}
            </Button>
          </Stack>
          {result && (
            <Alert severity="success" sx={{ mt: 2 }}>
              已导入（{result.mode}）：{result.projects} 个项目、{result.tasks} 个任务、{result.feedback} 条 Feedback、{result.filters} 个筛选器。
            </Alert>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, fontFamily: 'monospace' }}>
            命令行：scripts/import.sh file.json [merge|replace]
          </Typography>
        </Paper>
      </Stack>
      <ConfirmDialog
        open={confirmReplace}
        title="清空并导入"
        message="替换模式会清空当前所有项目、任务、Feedback 与筛选器，再写入文件内容。此操作不可撤销。"
        confirmText="清空并导入"
        danger
        busy={busy}
        onConfirm={doImport}
        onClose={() => setConfirmReplace(false)}
      />
    </Box>
  );
};

export default DataPage;
