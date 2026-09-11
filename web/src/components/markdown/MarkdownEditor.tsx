import { Suspense, lazy } from 'react';
import { Skeleton } from '@mui/material';
import type { MarkdownEditorProps } from './CrepeEditor';

// Milkdown + CodeMirror 语言包体积大，按需加载，不进首包
const CrepeEditor = lazy(() => import('./CrepeEditor'));

const MarkdownEditor = (props: MarkdownEditorProps) => (
  <Suspense fallback={<Skeleton variant="rounded" height={props.fill ? '100%' : props.minHeight ?? 200} />}>
    <CrepeEditor {...props} />
  </Suspense>
);

export default MarkdownEditor;
