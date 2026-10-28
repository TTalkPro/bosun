import { useEffect, useState } from 'react';
import { renderMermaid } from './mermaid';
import { useEffectiveMode } from './useEffectiveMode';

const Mermaid = ({ code }: { code: string }) => {
  const mode = useEffectiveMode(); const [svg, setSvg] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; renderMermaid(code, mode).then((s) => { if (!cancelled) { setSvg(s); setError(null); } }).catch((e: Error) => { if (!cancelled) { setSvg(null); setError(e.message); } }); return () => { cancelled = true; }; }, [code, mode]);
  if (error) return (<div className="my-3"><p className="text-xs text-destructive">Mermaid 语法错误：{error}</p><pre className="m-0"><code>{code}</code></pre></div>);
  if (!svg) return <div className="my-3 text-sm text-muted-foreground">渲染图表…</div>;
  return <div className="bosun-mermaid my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
};
export default Mermaid;
