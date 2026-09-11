import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { renderMermaid } from './mermaid';
import { useEffectiveMode } from './useEffectiveMode';

const Mermaid = ({ code }: { code: string }) => {
  const mode = useEffectiveMode();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderMermaid(code, mode)
      .then((s) => { if (!cancelled) { setSvg(s); setError(null); } })
      .catch((e: Error) => { if (!cancelled) { setSvg(null); setError(e.message); } });
    return () => { cancelled = true; };
  }, [code, mode]);

  if (error) {
    return (
      <Box sx={{ my: 2 }}>
        <Typography variant="caption" color="error">Mermaid 语法错误：{error}</Typography>
        <Box component="pre" sx={{ m: 0 }}><code>{code}</code></Box>
      </Box>
    );
  }
  if (!svg) return <Box sx={{ my: 2, color: 'text.secondary', fontSize: 13 }}>渲染图表…</Box>;
  // securityLevel=strict 下 mermaid 输出的 SVG 可信
  return <Box className="bosun-mermaid" sx={{ my: 2, overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} />;
};

export default Mermaid;
