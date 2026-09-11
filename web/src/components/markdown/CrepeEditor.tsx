import { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import { editorViewCtx } from '@milkdown/kit/core';
import { Selection } from '@milkdown/kit/prose/state';
import { languages } from '@codemirror/language-data';
import { Box, styled } from '@mui/material';
import '@milkdown/crepe/theme/common/style.css';
import { MarkdownBody } from './markdownStyles';
import { renderMermaidElement } from './mermaid';
import { cmTheme } from './cmTheme';
import { useEffectiveMode } from './useEffectiveMode';

// Crepe 的所有配色都走 --crepe-* 变量：这里用 MUI palette 赋值，明暗模式自动跟随
const EditorFrame = styled(Box, { shouldForwardProp: (p) => p !== 'minHeight' && p !== 'compact' && p !== 'fill' })<{ minHeight: number; compact: boolean; fill: boolean }>(
  ({ theme, minHeight, compact, fill }) => {
    const p = theme.vars!.palette;
    return {
      border: `1px solid ${p.divider}`,
      borderRadius: theme.shape.borderRadius,
      backgroundColor: p.background.paper,
      '&:focus-within': { borderColor: p.primary.main, boxShadow: `0 0 0 2px rgba(${p.primary.mainChannel} / 0.2)` },
      '& .milkdown': {
        '--crepe-color-background': p.background.paper,
        '--crepe-color-on-background': p.text.primary,
        '--crepe-color-surface': `rgba(${p.text.primaryChannel} / 0.05)`,
        '--crepe-color-surface-low': `rgba(${p.text.primaryChannel} / 0.08)`,
        '--crepe-color-on-surface': p.text.primary,
        '--crepe-color-on-surface-variant': p.text.secondary,
        '--crepe-color-outline': p.text.disabled,
        '--crepe-color-primary': p.primary.main,
        '--crepe-color-secondary': `rgba(${p.primary.mainChannel} / 0.16)`,
        '--crepe-color-on-secondary': p.text.primary,
        '--crepe-color-inverse': p.text.primary,
        '--crepe-color-on-inverse': p.background.paper,
        '--crepe-color-inline-code': p.error.main,
        '--crepe-color-error': p.error.main,
        '--crepe-color-hover': `rgba(${p.text.primaryChannel} / 0.06)`,
        '--crepe-color-selected': `rgba(${p.primary.mainChannel} / 0.14)`,
        '--crepe-color-inline-area': `rgba(${p.text.primaryChannel} / 0.08)`,
        '--crepe-base-font-size': '15px',
        '--crepe-font-title': theme.typography.fontFamily,
        '--crepe-font-default': theme.typography.fontFamily,
        '--crepe-font-code': '"JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
        '--crepe-shadow-1': theme.shadows[2],
        '--crepe-shadow-2': theme.shadows[4],
        background: 'transparent',
        color: p.text.primary,
      },
      // 非紧凑模式左侧留 72px：Crepe 的块拖拽手柄（66px 宽）绝对定位在块的左边，
      // 需要这段内边距才不会画到编辑框外面
      '& .milkdown .ProseMirror': {
        padding: compact ? '8px 12px' : '12px 24px 12px 72px',
        minHeight,
        outline: 'none',
      },
      // 填满父容器（弹窗）：内容多了在框内滚动
      ...(fill
        ? {
            height: '100%',
            overflowY: 'auto',
            '& > *, & .milkdown': { minHeight: '100%', boxSizing: 'border-box' },
          }
        : {}),
      '& .milkdown .ProseMirror > *': { marginLeft: 0, marginRight: 0 },
      // 紧凑模式（打回 / 拒绝弹窗）不显示拖拽手柄
      ...(compact ? { '& .milkdown-block-handle': { display: 'none' } } : {}),
      '& .milkdown .bosun-mermaid svg': { maxWidth: '100%', height: 'auto' },
    };
  },
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md, prev) => {
        if (md === prev) return;
        clearTimeout(timer);
        timer = setTimeout(() => onChangeRef.current(md), 200);
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
      clearTimeout(timer);
      creating.then(() => crepe.destroy());
    };
    // placeholder / autoFocus 只在挂载时读取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorFrame minHeight={minHeight} compact={compact} fill={fill}>
      <MarkdownBody ref={rootRef} />
    </EditorFrame>
  );
};

export default CrepeEditor;
