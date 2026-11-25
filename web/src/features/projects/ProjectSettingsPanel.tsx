import { useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Check, Copy } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { updateProject } from '@/api/projects';
import { useStats } from '@/api/stats';
import type { Project } from '@/api/types';
import ConfirmDialog from '@/components/ConfirmDialog';
import FormField from '@/components/FormField';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import ProjectMark from '@/components/ProjectMark';
import RelativeTime from '@/components/RelativeTime';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Props {
  project: Project;
  onClose: () => void;
  onSaved?: (p: Project) => void;
}

// 设置页的分组（shadcn dashboard settings 的写法）：小标题 + 一句说明，下面是控件
const Group = ({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn('space-y-4', className)}>
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>
);

const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="rounded-lg border bg-card px-3 py-2.5">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
  </div>
);

const CopyKey = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="复制 Key"
      onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}>
      {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
    </Button>
  );
};

/** 项目设置：概况 / 基本信息 / 描述 / 归档。归档是单独的即时操作（带确认），不跟着「保存」走 */
const ProjectSettingsPanel = ({ project, onClose, onSaved }: Props) => {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [nameError, setNameError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'discard' | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const { data: stats } = useStats(14, project.key);
  const counts = stats?.projects[project.key] ?? stats?.totals;

  const dirty = name.trim() !== project.name || description !== (project.description ?? '');
  // 完成度：已验收 / 有效任务（拒绝、撤销的不算）
  const effective = counts ? counts.total - counts.by_status.REJECTED - counts.by_status.CANCELLED : 0;
  const done = counts?.by_status.VERIFIED ?? 0;
  const pct = effective > 0 ? Math.round((done / effective) * 100) : 0;

  const close = () => (dirty && !busy ? setConfirm('discard') : onClose());

  const save = async () => {
    if (!name.trim()) { setNameError('名称不能为空'); return; }
    setBusy(true);
    try {
      const saved = await updateProject(project.key, { name: name.trim(), description });
      enqueueSnackbar('项目已更新', { variant: 'success' });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      const { field, message } = handleError(e, ['name']);
      if (field) setNameError(message);
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      const saved = await updateProject(project.key, { archived: !project.archived });
      enqueueSnackbar(saved.archived ? `${project.key} 已归档` : `${project.key} 已取消归档`, { variant: 'success' });
      onSaved?.(saved);
      setConfirm(null);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      size="md"
      title={
        <span className="flex items-center gap-2.5">
          <ProjectMark projectKey={project.key} className="size-7 rounded-md text-xs" />
          <span className="min-w-0 truncate">项目设置</span>
          <Badge variant="outline" className="font-mono">{project.key}</Badge>
          {project.archived && <Badge variant="secondary">已归档</Badge>}
        </span>
      }
      onClose={close}
      busy={busy}
      actions={
        <>
          <span className={cn('mr-auto self-center text-xs', dirty ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            {dirty ? '有未保存的修改' : '没有修改'}
          </span>
          <Button variant="outline" onClick={close} disabled={busy}>取消</Button>
          <Button onClick={save} disabled={busy || !dirty}>保存</Button>
        </>
      }
    >
      <div
        className="flex flex-col gap-8"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && dirty) { e.preventDefault(); save(); } }}
      >
        <Group title="概况" description={<>创建于 <RelativeTime value={project.created_at} />，最近更新 <RelativeTime value={project.updated_at} /></>}>
          {counts ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="任务" value={counts.total} />
                <Stat label="未结" value={counts.open} />
                <Stat label="已验收" value={done} />
                <Stat label="Epic" value={counts.epics} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">完成度（已验收 / 不含拒绝和撤销）</span>
                  <span className="font-medium tabular-nums">{done} / {effective} · {pct}%</span>
                </div>
                <Progress value={pct} aria-label="完成度" />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[66px] rounded-lg" />)}</div>
          )}
        </Group>

        <Group title="基本信息" description="名称显示在侧栏、看板和任务详情里">
          <FormField label="名称" htmlFor="project-name" error={nameError}>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(undefined); }}
              aria-invalid={!!nameError}
              autoFocus
            />
          </FormField>
          <FormField label="Key" htmlFor="project-key"
            hint={<>任务编号前缀：<span className="font-mono">{project.key}-1</span>、<span className="font-mono">{project.key}-2</span>…；创建后不可修改</>}>
            <div className="flex items-center gap-1">
              <Input id="project-key" value={project.key} readOnly className="bg-muted/50 font-mono font-semibold tracking-wider text-muted-foreground" />
              <CopyKey value={project.key} />
            </div>
          </FormField>
        </Group>

        <Group title="描述" description="可选，支持 Markdown；显示在项目列表卡片上">
          <div className="h-64">
            <MarkdownEditor value={description} onChange={setDescription} minHeight={200} fill placeholder="这个项目是做什么的…" />
          </div>
        </Group>

        <Group title={project.archived ? '取消归档' : '归档'}>
          <div className={cn('flex items-start gap-3 rounded-lg border p-4', !project.archived && 'border-destructive/40 bg-destructive/5')}>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{project.archived ? '这个项目已归档' : '归档这个项目'}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {project.archived
                  ? '取消归档后可以重新新建任务，项目回到侧栏和项目列表。'
                  : '归档后不再接受新任务，默认从侧栏和项目列表隐藏；已有任务仍可操作，可以随时取消归档。'}
              </p>
            </div>
            <Button variant={project.archived ? 'outline' : 'destructive'} size="sm" onClick={() => setConfirm('archive')} disabled={busy}>
              {project.archived ? <ArchiveRestore /> : <Archive />}{project.archived ? '取消归档' : '归档'}
            </Button>
          </div>
        </Group>
      </div>

      <ConfirmDialog
        open={confirm === 'archive'}
        title={project.archived ? `取消归档 ${project.key}？` : `归档 ${project.key}？`}
        message={project.archived
          ? '项目会回到侧栏和项目列表，可以继续新建任务。'
          : <>{counts && counts.open > 0 ? <>还有 <b>{counts.open}</b> 个未结任务，归档后仍可继续处理。</> : null}归档后不能再新建任务。</>}
        confirmText={project.archived ? '取消归档' : '归档'}
        danger={!project.archived}
        busy={busy}
        onConfirm={toggleArchive}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        title="放弃未保存的修改？"
        message="名称或描述的修改还没保存，关掉就没了。"
        confirmText="放弃修改"
        danger
        onConfirm={() => { setConfirm(null); onClose(); }}
        onClose={() => setConfirm(null)}
      />
    </SidePanel>
  );
};

export default ProjectSettingsPanel;
