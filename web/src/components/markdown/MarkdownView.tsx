import { Children, isValidElement, type ReactElement, type ReactNode, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Link as RouterLink } from 'react-router';
import { Box, IconButton, Link, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import Mermaid from './Mermaid';
import { MarkdownBody } from './markdownStyles';

const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
};

const CodeBlock = ({ children }: { children?: ReactNode }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textOf(children));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard 不可用时静默 */ }
  };
  return (
    <Box sx={{ position: 'relative', '&:hover .copy-btn': { opacity: 1 } }}>
      <Tooltip title={copied ? '已复制' : '复制'}>
        <IconButton size="small" onClick={copy} className="copy-btn" sx={{ position: 'absolute', top: 6, right: 6, opacity: 0, transition: 'opacity .15s' }}>
          {copied ? <CheckIcon fontSize="inherit" /> : <ContentCopyIcon fontSize="inherit" />}
        </IconButton>
      </Tooltip>
      <pre>{children}</pre>
    </Box>
  );
};

const components: Components = {
  pre: ({ children }) => {
    const only = Children.toArray(children).find(isValidElement) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
    const lang = /language-([\w-]+)/.exec(only?.props.className ?? '')?.[1];
    if (lang === 'mermaid') return <Mermaid code={textOf(only?.props.children).replace(/\n$/, '')} />;
    return <CodeBlock>{children}</CodeBlock>;
  },
  a: ({ href, children }) => {
    const h = href ?? '';
    if (h.startsWith('/')) return <Link component={RouterLink} to={h}>{children}</Link>;
    return <Link href={h} target="_blank" rel="noopener noreferrer">{children}</Link>;
  },
  // GFM 任务列表复选框只读展示
  input: (props) => <input {...props} disabled readOnly />,
};

interface Props {
  markdown: string;
  /** 内容为空时的占位 */
  empty?: ReactNode;
}

const MarkdownView = ({ markdown, empty }: Props) => {
  if (!markdown.trim()) {
    return empty ? <Box sx={{ color: 'text.disabled', fontSize: 14 }}>{empty}</Box> : null;
  }
  return (
    <MarkdownBody className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, plainText: ['mermaid', 'txt', 'text'] }]]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </MarkdownBody>
  );
};

export default MarkdownView;
