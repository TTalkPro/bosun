// mermaid 动态加载 + 渲染，编辑器预览与只读展示共用
let seq = 0;

export type ColorMode = 'light' | 'dark';

const load = async () => {
  const mod = await import('mermaid');
  return mod.default;
};

export const renderMermaid = async (code: string, mode: ColorMode): Promise<string> => {
  const mermaid = await load();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: mode === 'dark' ? 'dark' : 'default',
    fontFamily: 'inherit',
  });
  const id = `bosun-mermaid-${++seq}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
};

// 渲染成 DOM 节点（给 Milkdown 的 renderPreview 用）
export const renderMermaidElement = async (code: string, mode: ColorMode): Promise<HTMLElement> => {
  const el = document.createElement('div');
  el.className = 'bosun-mermaid';
  try {
    el.innerHTML = await renderMermaid(code, mode);
  } catch (e) {
    const pre = document.createElement('pre');
    pre.className = 'bosun-mermaid-error';
    pre.textContent = `Mermaid 语法错误：${(e as Error).message}`;
    el.appendChild(pre);
  }
  return el;
};
