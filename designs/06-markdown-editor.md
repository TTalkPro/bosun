# 06 · Markdown 编辑与渲染

> Milkdown（Crepe）编辑；react-markdown + remark-gfm 渲染（GitHub 模式）；Mermaid。

## 1. 两条管线

- 编辑：`@milkdown/crepe`（WYSIWYG）。包装组件 `MarkdownEditor`（lazy 加载 `CrepeEditor`），`markdownUpdated` 防抖 200ms 回调；不做双向受控，换内容请换 `key`；`fill` 模式撑满容器；`compact` 隐藏块手柄；非紧凑模式左侧留 72px 给 Crepe 的块拖拽手柄；`autoFocus` 把光标放到文末。
- 展示：`MarkdownView` = react-markdown + remark-gfm + rehype-highlight；不启用 raw HTML；站内相对链接走 react-router；GFM 复选框只读。

## 2. 样式

`markdownStyles.ts` 用 MUI palette 重写 GitHub `.markdown-body` 排版规则，编辑器与展示共用；highlight.js token 配色用 CSS 变量按明暗模式切换。Crepe 的 CodeMirror 缺省主题是固定深色 oneDark，改为 `cmTheme.ts`（同一组 CSS 变量）。

## 3. Mermaid

`mermaid.ts` 动态 import、`securityLevel: strict`、主题跟随明暗模式；编辑器的 `renderPreview` 与展示端共用。
