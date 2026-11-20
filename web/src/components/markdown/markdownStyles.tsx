import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const MarkdownBody = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(function MarkdownBody({ className, ...rest }, ref) {
  return <div ref={ref} className={cn('bosun-md space-y-3 text-sm leading-6 [&_a]:text-primary [&_a:hover]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_th]:text-left [&_ul]:list-disc', className)} {...rest} />;
});
