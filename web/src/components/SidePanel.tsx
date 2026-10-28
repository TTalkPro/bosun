import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface Props { title: ReactNode; headerExtra?: ReactNode; actions?: ReactNode; onClose: () => void; busy?: boolean; children: ReactNode; }

const SidePanel = ({ title, headerExtra, actions, onClose, busy, children }: Props) => (
  <Sheet open onOpenChange={(next) => !busy && !next && onClose()}>
    <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[66.67vw]">
      <SheetTitle className="sr-only">{typeof title === 'string' ? title : '编辑'}</SheetTitle>
      <SheetDescription className="sr-only">编辑详情</SheetDescription>
      <header className="flex min-h-16 items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1 truncate text-base font-semibold">{title}</div>
        {headerExtra}
        <Button variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="关闭"><X className="size-4" /></Button>
      </header>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      {actions && (<><Separator /><footer className={cn('flex justify-end gap-2 px-4 py-3')}>{actions}</footer></>)}
    </SheetContent>
  </Sheet>
);
export default SidePanel;
