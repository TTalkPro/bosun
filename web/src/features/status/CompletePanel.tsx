import { useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { transitionTask } from '@/api/tasks';
import { useMe } from '@/api/auth';
import type { Status, Task } from '@/api/types';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormField from '@/components/FormField';
import { STATUS_LABEL, transitionLabel } from '@/features/tasks/status';
import { cn } from '@/lib/utils';

interface Props {
  task: Task;
  to: 'DONE' | 'VERIFIED';
  onClose: () => void;
  onChanged?: (t: Task) => void;
}

// 完成 / 验收：新建工单式面板，记录完成证据（提交 hash、测试结果）。
// 执行方验收自己的任务时必须有通过的测试（本次或最近一次 DONE）。
const CompletePanel = ({ task, to, onClose, onChanged }: Props) => {
  const me = useMe().data?.user.name;
  const selfVerify = to === 'VERIFIED' && task.assignee === me;
  const lastDone = task.history.find((h) => h.to === 'DONE');
  const lastDonePassed = !!lastDone?.tests?.passed;
  const [commits, setCommits] = useState('');
  const [comment, setComment] = useState('');
  const [withTests, setWithTests] = useState(to === 'DONE' || (selfVerify && !lastDonePassed));
  const [command, setCommand] = useState('');
  const [passed, setPassed] = useState(true);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();
  const label = transitionLabel(task.status, to as Status);

  const submit = async () => {
    setBusy(true);
    try {
      const list = commits.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean);
      const t = await transitionTask(task.id, to, {
        comment: comment.trim() || undefined,
        commits: list,
        tests: withTests ? { command: command.trim(), passed, summary: summary.trim() } : undefined,
      });
      enqueueSnackbar(`${task.id} → ${STATUS_LABEL[to]}`, { variant: 'success' });
      onChanged?.(t);
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={`${label} ${task.id}`}
      onClose={onClose}
      busy={busy}
      actions={<><Button variant="outline" onClick={onClose} disabled={busy}>取消</Button><Button onClick={submit} disabled={busy}>{label}</Button></>}
    >
      <div className="space-y-4">
        {selfVerify && (
          <div className={cn('rounded-md border p-3 text-sm',
            lastDonePassed
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
            {lastDonePassed
              ? `你是执行方；最近一次「完成」已记录通过的测试（${lastDone?.tests?.command || '未写命令'}），可以自验收。`
              : '你是执行方：自己验收必须记录通过的测试结果，否则后端会拒绝。'}
          </div>
        )}
        <FormField label="提交 hash" htmlFor="complete-commits" hint={to === 'DONE' ? '空格或逗号分隔；没有提交就留空，并在 Feedback 里说明' : '可选'}>
          <Input id="complete-commits" value={commits} onChange={(e) => setCommits(e.target.value)} autoFocus className="font-mono" />
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox id="complete-with-tests" checked={withTests} onCheckedChange={(v) => setWithTests(!!v)} />
          <Label htmlFor="complete-with-tests">记录测试结果</Label>
        </div>
        {withTests && (
          <div className="space-y-3 border-l-2 pl-4">
            <FormField label="命令" htmlFor="complete-command">
              <Input id="complete-command" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="rebar3 eunit && rebar3 ct" className="font-mono" />
            </FormField>
            <div className="flex items-center gap-2">
              <Checkbox id="complete-passed" checked={passed} onCheckedChange={(v) => setPassed(!!v)} />
              <Label htmlFor="complete-passed">全部通过</Label>
            </div>
            <FormField label="结果摘要" htmlFor="complete-summary">
              <Input id="complete-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="28 eunit + 4 ct passed" />
            </FormField>
          </div>
        )}
        <FormField label="历史备注（可选）" htmlFor="complete-comment">
          <Input id="complete-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </FormField>
        <p className="text-xs text-muted-foreground">
          提交 hash 与测试结果会进入状态历史，作为完成证据；提出方或第三方验收不需要测试记录。
        </p>
      </div>
    </SidePanel>
  );
};

export default CompletePanel;
