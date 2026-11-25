import { useEffect, useRef, useState, type DragEvent } from 'react';
import dayjs from 'dayjs';
import { Check, CheckCircle2, CircleAlert, Copy, Download, FileJson, FolderKanban, GitMerge, ListFilter, ListTodo, RefreshCcw, Upload, X } from 'lucide-react';
import { mutate } from 'swr';
import { client, isApiError } from '@/api/client';
import ImportPlan, { type ImportDetail } from '@/features/data/ImportPlan';
import { useFilters } from '@/api/query';
import { useStats } from '@/api/stats';
import ConfirmDialog from '@/components/ConfirmDialog';
import Section from '@/components/Section';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import StatCard from '@/features/dashboard/StatCard';
import { inspectExport, type ExportSummary } from '@/features/data/exportFile';
import { cn } from '@/lib/utils';

interface ImportSummary {
  mode: string; projects: number; tasks: number; feedback: number;
  /** 实际写入（新建 + 同 id 覆盖） */
  filters: number;
  /** 本组织已有同名同查询而跳过的 */
  filters_skipped?: number;
  detail?: ImportDetail;
}

// 预演报错翻成中文（保留服务端原文，便于对照）
const planError = (e: unknown): string => {
  if (!isApiError(e)) return String(e);
  if (e.status === 409) return `文件里有项目 key 已被别的组织占用，不能导入（${e.message}）`;
  if (e.status === 400) return `文件内容不合法：${e.message}`;
  if (e.status === 403) return '导入只给组织管理员';
  return e.message;
};

// 预演结果按「哪个文件 + 哪种模式」记；当前组合没有结果 = 正在预演
type Plan = { key: string; detail?: ImportDetail; error?: string };
type Mode = 'merge' | 'replace';

const INCLUDED = ['项目', '任务（含状态历史、提交与测试证据）', 'Feedback（含作废版本）', '任务关联', '筛选器', '出现过的人 / Agent', '序号计数器'];
const EXCLUDED = ['用户、会话、API Key', '组织本身', '搜索索引（导入后自动重建）'];

const MODES: { key: Mode; title: string; desc: string; icon: typeof GitMerge }[] = [
  { key: 'merge', title: '合并', desc: '同 ID 覆盖，其余保留；同名同查询的筛选器不重复导入；序号不会回退', icon: GitMerge },
  { key: 'replace', title: '替换', desc: '先清空本组织的项目、任务、Feedback、筛选器，再写入文件内容', icon: RefreshCcw },
];

const CopyLine = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{code}</code>
      <button type="button" aria-label="复制命令" className="text-muted-foreground hover:text-foreground"
        onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
};

const Figure = ({ label, value }: { label: string; value: number }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
  </div>
);

// 整库导出 / 导入（JSON）。导出走浏览器下载；导入先在浏览器里预检文件，再 POST，后端整体事务 + 重建索引
const DataPage = () => {
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('merge');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ body: unknown; summary: ExportSummary } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const fileSeq = useRef(0);
  const [fileId, setFileId] = useState(0);
  const planKey = parsed ? `${fileId}:${mode}` : null;

  // 选了合格的文件 / 换了模式：让服务端预演一遍（不写库），把会发生什么摆出来
  useEffect(() => {
    if (!parsed || !planKey) return;
    let live = true;
    client.post<{ detail: ImportDetail }>(`/import?mode=${mode}&dry_run=true`, parsed.body)
      .then(({ data }) => { if (live) setPlan({ key: planKey, detail: data.detail }); })
      .catch((e) => { if (live) setPlan({ key: planKey, error: planError(e) }); });
    return () => { live = false; };
  }, [parsed, mode, planKey]);
  const current = plan && plan.key === planKey ? plan : null;
  const planning = !!parsed && !current;
  const { data: stats } = useStats(1);
  const { data: filtersData } = useFilters();

  const pick = async (f: File | null) => {
    setFile(f); setParsed(null); setFileError(null); setResult(null);
    fileSeq.current += 1;
    setFileId(fileSeq.current);
    if (!f) return;
    const r = inspectExport(await f.text());
    if (r.kind === 'ok') setParsed({ body: r.body, summary: r.summary }); else setFileError(r.error);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void pick(f);
  };

  const doImport = async () => {
    if (!parsed) return;
    setConfirmReplace(false);
    setBusy(true);
    try {
      const { data } = await client.post<ImportSummary>(`/import?mode=${mode}`, parsed.body);
      setResult(data);
      enqueueSnackbar('导入完成', { variant: 'success' });
      await mutate(() => true); // 所有缓存失效
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const totals = stats?.totals;
  const projectCount = stats ? Object.keys(stats.projects).length : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">数据导入导出</h1>
        <p className="mt-1 text-sm text-muted-foreground">把本组织的数据导成一个 JSON 文件备份或迁移；导入是一个事务，任何一条记录不合法就全部回滚</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="项目" icon={FolderKanban} value={projectCount} footer="含已归档" />
        <StatCard label="任务" icon={ListTodo} value={totals?.total} footer={totals && <>其中 Epic {totals.epics} 个</>} />
        <StatCard label="筛选器" icon={ListFilter} value={filtersData?.filters.length} footer="重复导入不会多出来" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="导出" description="下载当前组织的全部数据">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">包含</h3>
                <ul className="space-y-1.5 text-sm">
                  {INCLUDED.map((x) => <li key={x} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />{x}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">不包含</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {EXCLUDED.map((x) => <li key={x} className="flex items-start gap-2"><X className="mt-0.5 size-4 shrink-0" />{x}</li>)}
                </ul>
              </div>
            </div>
            <a className={buttonVariants()} href="/api/v1/export" download><Download />下载 JSON</a>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">命令行（需管理员的 API Key）</div>
              <CopyLine code="BOSUN_API_KEY=bsk_… scripts/export.sh out.json" />
            </div>
          </div>
        </Section>

        <Section title="导入" description="读取上面导出的 JSON；先在浏览器里检查格式，再上传">
          <div className="space-y-5">
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void pick(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'hover:border-foreground/20 hover:bg-muted/40',
                fileError && 'border-destructive/50',
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-muted"><Upload className="size-5 text-muted-foreground" /></span>
              <span className="text-sm font-medium">拖入 JSON 文件，或点击选择</span>
              <span className="text-xs text-muted-foreground">bosun-export 格式，版本 1 / 2</span>
            </button>

            {file && (
              <div className="rounded-lg border">
                <div className="flex items-center gap-3 px-4 py-3">
                  <FileJson className="size-8 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                      {parsed && <> · 版本 {parsed.summary.version}{parsed.summary.exportedAt && <> · 导出于 {dayjs(parsed.summary.exportedAt).format('YYYY-MM-DD HH:mm')}</>}</>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="移除文件" onClick={() => void pick(null)}><X className="size-4" /></Button>
                </div>
                {parsed && (
                  <div className="grid grid-cols-3 gap-3 border-t bg-muted/30 px-4 py-3 sm:grid-cols-6">
                    <Figure label="项目" value={parsed.summary.projects} />
                    <Figure label="任务" value={parsed.summary.tasks} />
                    <Figure label="Feedback" value={parsed.summary.feedback} />
                    <Figure label="筛选器" value={parsed.summary.filters} />
                    <Figure label="关联" value={parsed.summary.links} />
                    <Figure label="人 / Agent" value={parsed.summary.actors} />
                  </div>
                )}
                {fileError && (
                  <div className="flex items-center gap-2 border-t px-4 py-2.5 text-sm text-destructive"><CircleAlert className="size-4" />{fileError}</div>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="导入方式">
              {MODES.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)}
                  className={cn('flex gap-3 rounded-lg border-2 p-3 text-left transition-colors',
                    mode === m.key ? (m.key === 'replace' ? 'border-destructive/70 bg-destructive/5' : 'border-primary bg-primary/5') : 'border-border hover:border-foreground/20')}>
                  <m.icon className={cn('mt-0.5 size-4 shrink-0', mode === m.key ? (m.key === 'replace' ? 'text-destructive' : 'text-primary') : 'text-muted-foreground')} />
                  <span>
                    <span className="block text-sm font-medium">{m.title}</span>
                    <span className="block text-xs text-muted-foreground">{m.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            {parsed && !result && <ImportPlan loading={planning} error={current?.error} detail={current?.detail} />}

            <div className="flex flex-wrap items-center gap-3">
              <Button variant={mode === 'replace' ? 'destructive' : 'default'} disabled={!parsed || busy || planning || !!current?.error}
                onClick={() => (mode === 'replace' ? setConfirmReplace(true) : doImport())}>
                {mode === 'replace' ? '清空并导入' : '合并导入'}
              </Button>
              {!file && <span className="text-xs text-muted-foreground">先选择文件</span>}
            </div>

            {result?.detail && <ImportPlan done detail={result.detail} />}
            {result && (
              <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                <AlertDescription className="text-emerald-700 dark:text-emerald-400">
                  已{result.mode === 'replace' ? '替换' : '合并'}导入：{result.projects} 个项目、{result.tasks} 个任务、{result.feedback} 条 Feedback、{result.filters} 个筛选器{result.filters_skipped ? `（另有 ${result.filters_skipped} 个与已有的同名同查询，跳过）` : ''}。搜索索引已重建。
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">命令行（需管理员、带 manage 权限的 API Key）</div>
              <CopyLine code="BOSUN_API_KEY=bsk_… scripts/import.sh file.json [merge|replace]" />
            </div>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="清空并导入"
        message={<>替换模式会先清空<b>本组织</b>的全部项目、任务、Feedback 与筛选器，再写入文件内容（{parsed?.summary.projects ?? 0} 个项目、{parsed?.summary.tasks ?? 0} 个任务）。此操作不可撤销，建议先导出一份备份。</>}
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
