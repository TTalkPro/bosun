import { useState } from 'react';
import { Chip, Tooltip } from '@mui/material';

// 等宽字体的任务 ID 徽标，点击复制
const TaskIdChip = ({ id, size = 'small' }: { id: string; size?: 'small' | 'medium' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };
  return (
    <Tooltip title={copied ? '已复制' : '复制 ID'}>
      <Chip
        size={size}
        label={id}
        onClick={copy}
        variant="outlined"
        sx={{ fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace', fontWeight: 700, letterSpacing: 0.3 }}
      />
    </Tooltip>
  );
};

export default TaskIdChip;
