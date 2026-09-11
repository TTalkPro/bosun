import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Crepe 缺省用 oneDark（固定深色）。这里用 CSS 变量取色，
// 变量由 markdownStyles.ts 的 MarkdownBody 按明暗模式赋值，编辑器随之切换。
const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--md-fg)' },
  '.cm-content': { caretColor: 'var(--md-fg)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--md-fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--md-sel)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--md-line)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--md-muted)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--md-line)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--md-line)', border: 'none', color: 'var(--md-muted)' },
  '.cm-tooltip': { backgroundColor: 'var(--md-tooltip-bg)', border: '1px solid var(--md-border)' },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: 'var(--md-kw)' },
  { tag: [t.string, t.special(t.string), t.regexp, t.inserted], color: 'var(--md-str)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.literal], color: 'var(--md-num)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName), t.labelName], color: 'var(--md-fn)' },
  { tag: [t.typeName, t.className, t.namespace, t.tagName, t.attributeName], color: 'var(--md-type)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--md-muted)', fontStyle: 'italic' },
  { tag: [t.heading], fontWeight: 'bold' },
  { tag: [t.deleted], color: 'var(--md-kw)' },
  { tag: [t.link, t.url], color: 'var(--md-fn)', textDecoration: 'underline' },
]);

export const cmTheme = [theme, syntaxHighlighting(highlight)];
