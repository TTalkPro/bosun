import { useEffect, useRef } from 'react';
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, insertNewlineAndIndent } from '@codemirror/commands';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { cn } from '@/lib/utils';
import { BQL_KEYWORDS, completionContext, FIELD_INFO, quoteValue } from './bql';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Enter（补全列表没开时）运行 */
  onRun: (v: string) => void;
  /** 后端给的字段表（/filters 的 fields） */
  fields: string[];
  /** 某字段可选的值（状态、优先级、项目 key、人名…）；没有就不补值 */
  valuesFor: (field: string) => { label: string; detail?: string }[];
  placeholder?: string;
  invalid?: boolean;
}

const KW = new Set(BQL_KEYWORDS);
const ATOMS = new Set(['NEW', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'REJECTED', 'CANCELLED', 'LOW', 'MEDIUM', 'HIGH', 'TRUE', 'FALSE', 'NOW', 'TASK', 'EPIC']);

// 词法高亮（StreamLanguage）：关键字 / 字段 / 字符串 / 数字与日期 / 运算符 / 枚举值
const bqlLanguage = (fields: Set<string>) => StreamLanguage.define<null>({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/^-?\d+[dwh]\b/) || stream.match(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?/) || stream.match(/^\d+/)) return 'number';
    if (stream.match(/^(?:!=|>=|<=|!~|[=<>~])/)) return 'operator';
    if (stream.match(/^[(),]/)) return 'punctuation';
    const m = stream.match(/^[A-Za-z_][\w./-]*/) as RegExpMatchArray | null;
    if (m) {
      const w = m[0];
      if (KW.has(w.toUpperCase())) return 'keyword';
      if (fields.has(w.toLowerCase())) return 'propertyName';
      if (ATOMS.has(w.toUpperCase())) return 'atom';
      return 'variableName';
    }
    stream.next();
    return null;
  },
});

// 颜色用 CSS 变量，明暗模式在容器上切（与 Markdown 代码块同一套色）
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--bql-kw)', fontWeight: '600' },
  { tag: t.propertyName, color: 'var(--bql-field)' },
  { tag: t.string, color: 'var(--bql-str)' },
  { tag: [t.number, t.atom], color: 'var(--bql-num)' },
  { tag: [t.operator, t.punctuation], color: 'var(--bql-op)' },
]);

const theme = EditorView.theme({
  '&': { fontSize: '13px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', padding: '10px 0', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: '0 12px 0 36px' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--primary) 20%, transparent) !important' },
  '.cm-tooltip': { backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '12px', maxHeight: '16rem' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' },
  '.cm-completionDetail': { fontFamily: 'Inter, sans-serif', fontStyle: 'normal', color: 'var(--muted-foreground)', marginLeft: '8px' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
});

/**
 * BQL 输入框（CodeMirror 6）：语法高亮 + 按上下文补全——条件开头补字段，运算符后 / IN ( 里补该字段的值，
 * 条件之后补 AND / OR / ORDER BY，ORDER BY 之后补字段与 ASC / DESC。Enter 运行（补全列表开着时是选中），
 * Shift + Enter 换行；Ctrl + Space 手动唤出补全。
 */
const BqlEditor = ({ value, onChange, onRun, fields, valuesFor, placeholder, invalid }: Props) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // 回调与候选随渲染变化，扩展只建一次：通过 ref 取最新的
  const latest = useRef({ onChange, onRun, fields, valuesFor });
  useEffect(() => { latest.current = { onChange, onRun, fields, valuesFor }; });

  useEffect(() => {
    if (!host.current) return;
    const fieldSet = new Set(latest.current.fields);
    const source = (ctx: CompletionContext): CompletionResult | null => {
      const word = ctx.matchBefore(/"?[\w./-]*/);
      if (!word) return null;
      if (word.from === word.to && !ctx.explicit) {
        // 刚敲完空格 / 运算符 / 括号时也弹（值与连接词最常用）
        const prev = ctx.state.sliceDoc(Math.max(0, ctx.pos - 1), ctx.pos);
        if (!/[\s=<>~(,]/.test(prev)) return null;
      }
      const before = ctx.state.sliceDoc(0, word.from);
      const c = completionContext(before + (word.text.startsWith('"') ? '"' : ''));
      const { fields: fs, valuesFor: vf } = latest.current;
      const fieldOpts = fs.map((f) => ({ label: f, type: 'property', detail: FIELD_INFO[f] }));
      let options;
      switch (c.kind) {
        case 'field': options = [...fieldOpts, { label: 'NOT', type: 'keyword' }, { label: 'ORDER BY', type: 'keyword' }]; break;
        case 'connector': options = ['AND', 'OR', 'ORDER BY', 'IS EMPTY', 'IS NOT EMPTY'].map((k) => ({ label: k, type: 'keyword' })); break;
        case 'order': options = [...fieldOpts, { label: 'ASC', type: 'keyword' }, { label: 'DESC', type: 'keyword' }]; break;
        case 'value': options = vf(c.field).map((v) => ({ label: quoteValue(v.label), detail: v.detail, type: 'constant' })); break;
      }
      if (!options.length) return null;
      return { from: word.from, options, validFor: /^"?[\w./-]*$/ };
    };
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            ...completionKeymap,
            { key: 'Enter', run: (vw) => { latest.current.onRun(vw.state.doc.toString()); return true; } },
            { key: 'Shift-Enter', run: insertNewlineAndIndent },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          autocompletion({ override: [source], icons: false, closeOnBlur: true }),
          bqlLanguage(fieldSet),
          syntaxHighlighting(highlight),
          theme,
          EditorView.lineWrapping,
          placeholderExt(placeholder ?? ''),
          EditorView.contentAttributes.of({ 'aria-label': 'BQL 查询', spellcheck: 'false' }),
          EditorView.updateListener.of((u) => { if (u.docChanged) latest.current.onChange(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // 字段表变了要重建高亮；其余靠 ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.join(','), placeholder]);

  // 外面改了值（点示例 / 最近 / 结果概览、切筛选器）：同步进编辑器，不打断正在输入的同一值
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: value.length } });
    }
  }, [value]);

  return (
    <div
      ref={host}
      className={cn(
        'relative min-h-11 rounded-md border bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
        '[--bql-kw:#cf222e] [--bql-field:#8250df] [--bql-str:#0a3069] [--bql-num:#0550ae] [--bql-op:var(--muted-foreground)]',
        'dark:[--bql-kw:#ff7b72] dark:[--bql-field:#d2a8ff] dark:[--bql-str:#a5d6ff] dark:[--bql-num:#79c0ff]',
        invalid && 'border-destructive ring-destructive/20',
      )}
      onClick={() => view.current?.focus()}
    />
  );
};

export default BqlEditor;
