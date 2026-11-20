import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useSnackbar } from '@/components/notify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CreatedApiKey } from '@/api/auth';

interface Props { apiKey: CreatedApiKey; title: string; onClose: () => void; }

const CreatedKeyDialog = ({ apiKey, title, onClose }: Props) => {
  const [copied, setCopied] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key);
      setCopied(true);
      enqueueSnackbar('已复制', { variant: 'success' });
    } catch {
      enqueueSnackbar('复制失败，请手动选中复制', { variant: 'warning' });
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      {/* 明文只显示这一次：点遮罩 / 按 Esc 不关，只能点「我已保存，关闭」 */}
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            这串 key 只显示这一次；关闭后无法再次查看。
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm" data-testid="new-key">{apiKey.key}</code>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            复制
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          请立即更新 Agent 配置；旧 key 已立即失效。
        </p>
        <DialogFooter>
          <Button onClick={onClose}>我已保存，关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreatedKeyDialog;
