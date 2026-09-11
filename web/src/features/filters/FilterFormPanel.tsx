import { useState } from 'react';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { createFilter, updateFilter, type SavedFilter } from '@/api/query';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';

interface Props {
  /** 新建时的初始 BQL */
  query: string;
  /** 传入则为编辑模式（改名 / 改查询） */
  editing?: SavedFilter;
  onClose: () => void;
  onSaved: (f: SavedFilter) => void;
}

// 新建 / 编辑筛选器：新建工单式的右侧面板（名称 + BQL）
const FilterFormPanel = ({ query, editing, onClose, onSaved }: Props) => {
  const [name, setName] = useState(editing?.name ?? '');
  const [bql, setBql] = useState(editing?.query ?? query);
  const [errors, setErrors] = useState<{ name?: string; query?: string }>({});
  const [busy, setBusy] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const handleError = useApiError();

  const submit = async () => {
    if (!name.trim()) { setErrors({ name: '名称不能为空' }); return; }
    setBusy(true);
    try {
      const f = editing
        ? await updateFilter(editing.id, { name: name.trim(), query: bql })
        : await createFilter({ name: name.trim(), query: bql });
      enqueueSnackbar(editing ? `筛选器「${f.name}」已更新` : `筛选器「${f.name}」已保存`, { variant: 'success' });
      onSaved(f);
      onClose();
    } catch (e) {
      const { field, message } = handleError(e);
      if (field === 'name' || field === 'query') setErrors({ [field]: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={editing ? `编辑筛选器 · ${editing.name}` : '保存为筛选器'}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="contained" onClick={submit} disabled={busy}>{editing ? '保存' : '创建'}</Button>
        </>
      }
    >
      <Stack spacing={2}>
        <TextField label="名称" value={name} onChange={(e) => { setName(e.target.value); setErrors({}); }} error={!!errors.name} helperText={errors.name} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <TextField
          label="BQL" value={bql} onChange={(e) => { setBql(e.target.value); setErrors({}); }}
          multiline minRows={3} maxRows={8}
          error={!!errors.query} helperText={errors.query ?? '空查询 = 全部任务'}
          InputProps={{ sx: { fontFamily: '"JetBrains Mono", Menlo, monospace', fontSize: 14 } }}
        />
        <Typography variant="caption" color="text.secondary">保存后出现在左侧「筛选器」里，一键打开。</Typography>
      </Stack>
    </SidePanel>
  );
};

export default FilterFormPanel;
