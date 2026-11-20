import { Suspense, lazy } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { MarkdownEditorProps } from './CrepeEditor';
const CrepeEditor = lazy(() => import('./CrepeEditor'));
const MarkdownEditor = (props: MarkdownEditorProps) => (<Suspense fallback={<Skeleton className={props.fill ? 'h-full w-full' : 'w-full'} style={{ height: props.minHeight ?? 200 }} />}><CrepeEditor {...props} /></Suspense>);
export default MarkdownEditor;
