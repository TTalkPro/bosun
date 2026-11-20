import { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx } from '@milkdown/kit/core';
import { Selection } from '@milkdown/kit/prose/state';
import { languages } from '@codemirror/language-data';
import '@milkdown/crepe/theme/common/style.css';
import { MarkdownBody } from './markdownStyles';
import { renderMermaidElement } from './mermaid';
import { cmTheme } from './cmTheme';
import { useEffectiveMode } from './useEffectiveMode';

const EditorFrame = ({ className, children, fill }: React.ComponentProps<'div'> & { minHeight: number; compact: boolean; fill: boolean }) => (
  <div className={className} style={{ display: 'flex', flexDirection: 'column', ...(fill ? { height: '100%', overflowY: 'auto' } : {}) }}>
    {children}
  </div>
);

export interface MarkdownEditorProps {
  /** 初始值：只在挂载时生效；要换内容请给组件换 key */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: number;
  compact?: boolean;
  /** 撑满父容器高度，内容超出时在编辑框内滚动 */
  fill?: boolean;
  autoFocus?: boolean;
}

const CrepeEditor = ({ value, onChange, placeholder = '写点什么…支持 Markdown、表格、mermaid 代码块', minHeight = 200, compact = false, fill = false, autoFocus = false }: MarkdownEditorProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const modeRef = useRef<'light' | 'dark'>('light');
  const initialRef = useRef(value);
  const mode = useEffectiveMode();
  // 最新的回调 / 主题写进 ref，供挂载时创建的编辑器闭包读取
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const crepe = new Crepe({
      root,
      defaultValue: initialRef.current,
      features: { [Crepe.Feature.Latex]: false },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: placeholder, mode: 'doc' },
        [Crepe.Feature.CodeMirror]: {
          languages,
          theme: cmTheme,
          // mermaid 代码块实时预览：异步渲染后通过 apply 回填
          renderPreview: (language, content, apply) => {
            if (language.toLowerCase() !== 'mermaid' || !content.trim()) return null;
            renderMermaidElement(content, modeRef.current).then(apply);
            return undefined;
          },
          previewLabel: '预览',
          previewToggleText: (previewOnly) => (previewOnly ? '编辑' : '隐藏'),
        },
      },
    });
    // 不防抖：以前攒 200ms 才回调，打完最后几个字马上点「保存」时父组件手里还是旧稿，卸载时又直接丢弃
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md, prev) => {
        if (md === prev) return;
        onChangeRef.current(md);
      });
    });
    const creating = crepe.create().then(() => {
      if (!autoFocus) return;
      // 光标放到文末（编辑已有内容时接着写，而不是插在开头）
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.focus();
        view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)).scrollIntoView());
      });
    });
    return () => {
      creating.then(() => crepe.destroy());
    };
    // placeholder / autoFocus 只在挂载时读取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorFrame className="rounded-[10px] border bg-card px-0 py-0 transition focus-within:border-primary focus-within:shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_20%,transparent)]" minHeight={minHeight} compact={compact} fill={fill}><MarkdownBody className="[&_.milkdown]:[--crepe-color-background:var(--card)] [&_.milkdown]:text-foreground" ref={rootRef} /></EditorFrame>
  );
};

export default CrepeEditor;
