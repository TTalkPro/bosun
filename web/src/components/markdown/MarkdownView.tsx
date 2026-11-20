import { Children, isValidElement, type ReactElement, type ReactNode, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Link as RouterLink } from 'react-router';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Mermaid from './Mermaid';
import { MarkdownBody } from './markdownStyles';

const textOf = (node: ReactNode): string => { if (node == null || typeof node === 'boolean') return ''; if (typeof node === 'string' || typeof node === 'number') return String(node); if (Array.isArray(node)) return node.map(textOf).join(''); if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children); return ''; };
const CodeBlock = ({ children }: { children?: ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(textOf(children)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (<div className="group relative"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="absolute right-2 top-2 size-7 opacity-0 transition group-hover:opacity-100" onClick={copy}>{copied ? <Check /> : <Copy />}</Button></TooltipTrigger><TooltipContent>{copied ? '已复制' : '复制'}</TooltipContent></Tooltip><pre>{children}</pre></div>);
};
const components: Components = {
  pre: ({ children }) => { const only = Children.toArray(children).find(isValidElement) as ReactElement<{ className?: string; children?: ReactNode }> | undefined; const lang = /language-([\w-]+)/.exec(only?.props.className ?? '')?.[1]; if (lang === 'mermaid') return <Mermaid code={textOf(only?.props.children).replace(/\n$/, '')} />; return <CodeBlock>{children}</CodeBlock>; },
  a: ({ href, children }) => { const h = href ?? ''; if (h.startsWith('/') && !h.startsWith('//')) return <RouterLink to={h} className="text-primary hover:underline">{children}</RouterLink>; return <a href={h} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>; },
  input: (props) => <input {...props} disabled readOnly />,
};
const MarkdownView = ({ markdown, empty }: { markdown: string; empty?: ReactNode }) => {
  if (!markdown.trim()) return empty ? <div className="text-sm text-muted-foreground/70">{empty}</div> : null;
  return (<MarkdownBody className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, plainText: ['mermaid', 'txt', 'text'] }]]} components={components}>{markdown}</ReactMarkdown></MarkdownBody>);
};
export default MarkdownView;
