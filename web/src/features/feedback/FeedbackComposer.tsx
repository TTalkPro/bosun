import { useState, type KeyboardEvent } from 'react';
import { Loader2, Maximize2, Send } from 'lucide-react';
import { addFeedback } from '@/api/feedback';
import type { Feedback, FeedbackKind } from '@/api/types';
import { useMe } from '@/api/auth';
import { ActorAvatar } from '@/components/ActorChip';
import { useSnackbar } from '@/components/notify';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ALL_KINDS, KIND_LABEL, defaultKind } from './kinds';

interface Props {
  taskId: string;
  feedback: Feedback[];
  onSent?: () => unknown;
  /** 「Markdown 编辑器…」：带着草稿与类型打开完整面板 */
  onExpand?: (content: string, kind: FeedbackKind) => void;
}

/**
 * 动态流底部的内联输入框（dashboard 评论框）：纯文本也按 Markdown 渲染；Ctrl / ⌘ + Enter 发送。
 * 类型缺省跟着线索走：最新一条有效记录是提问时缺省「回答」。长内容 / 要预览就点「Markdown 编辑器…」。
 */
const FeedbackComposer = ({ taskId, feedback, onSent, onExpand }: Props) => {
  const me = useMe().data?.user.name;
  const [content, setContent] = useState('');
  // 用户没手动选过类型时，跟着线索走（别人刚提了问，缺省就变成「回答」）
  const [picked, setPicked] = useState<FeedbackKind | null>(null);
  const kind = picked ?? defaultKind(feedback);
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const send = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      const f = await addFeedback(taskId, { content, kind });
      setContent('');
      setPicked(null);
      await onSent?.();
      enqueueSnackbar(`${f.id} 已添加`, { variant: 'success', autoHideDuration: 1500 });
    } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };

  return (
    <div className="flex gap-3">
      {me && <div className="-ml-10 hidden sm:block"><ActorAvatar name={me} kind="human" size={28} /></div>}
      <div className="min-w-0 flex-1 rounded-lg border bg-background shadow-xs focus-within:ring-[3px] focus-within:ring-ring/40">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          rows={3}
          aria-label="写 Feedback"
          placeholder={kind === 'answer' ? '回答上面的提问…' : '写下说明、评审意见或问题…（支持 Markdown）'}
          className="min-h-20 resize-y border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex flex-wrap items-center gap-2 border-t px-2 py-1.5">
          <Select value={kind} onValueChange={(v) => setPicked(v as FeedbackKind)}>
            <SelectTrigger size="sm" className="h-7 w-24 text-xs" aria-label="类型"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_KINDS.map((k) => <SelectItem key={k} value={k} className="text-xs">{KIND_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          {onExpand && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onExpand(content, kind)}>
              <Maximize2 />Markdown 编辑器…
            </Button>
          )}
          <div className="flex-1" />
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Ctrl + Enter 发送</span>
          <Button size="sm" className="h-7" onClick={() => void send()} disabled={busy || !content.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}发送
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackComposer;
