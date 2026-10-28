import { useRef, useState } from 'react';
import { CheckCircle2, Download, Upload } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { mutate } from 'swr';
import { client } from '@/api/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useApiError } from '@/components/useApiError';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">数据导入导出</h1>
      <div className="max-w-180 space-y-4">
        <Card className="gap-2 border p-5 py-5">
          <CardContent className="p-0">
          <h2 className="text-lg font-semibold">导出</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            把全部项目、任务（含状态历史）、Feedback（含作废版本）、筛选器和序号计数器导成一个 JSON 文件。搜索索引不导出，导入时自动重建。
          </p>
          <a className={buttonVariants()} href="/api/v1/export" download><Download />下载 JSON</a>
          <p className="mt-3 block font-mono text-xs text-muted-foreground">
            命令行：scripts/export.sh out.json
          </p>
          </CardContent>
        </Card>

        <Card className="gap-2 border p-5 py-5">
          <CardContent className="p-0">
          <h2 className="text-lg font-semibold">导入</h2>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            读取上面导出的 JSON。整个导入是一个事务：任何一条记录不合法就全部回滚。
          </p>
          <RadioGroup value={mode} onValueChange={(value) => setMode(value as 'merge' | 'replace')} className="mb-3 flex-row flex-wrap">
            <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="merge" />合并（同 ID 覆盖，其余保留）</Label>
            <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="replace" />替换（先清空再写入）</Label>
          </RadioGroup>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload />选择文件</Button>
            <span className={`text-sm ${file ? 'text-foreground' : 'text-muted-foreground/70'}`}>{file ? `${file.name}（${(file.size / 1024).toFixed(1)} KB）` : '未选择'}</span>
            <div className="flex-1" />
            <Button variant={mode === 'replace' ? 'destructive' : 'default'} disabled={!file || busy} onClick={() => (mode === 'replace' ? setConfirmReplace(true) : doImport())}>
              {mode === 'replace' ? '清空并导入' : '合并导入'}
            </Button>
          </div>
          {result && (
            <Alert className="mt-4 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              <AlertDescription>
              已导入（{result.mode}）：{result.projects} 个项目、{result.tasks} 个任务、{result.feedback} 条 Feedback、{result.filters} 个筛选器。
              </AlertDescription>
            </Alert>
          )}
          <p className="mt-3 block font-mono text-xs text-muted-foreground">
            命令行：scripts/import.sh file.json [merge|replace]
          </p>
          </CardContent>
        </Card>
      </div>
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
    </div>
  );
};

export default DataPage;
