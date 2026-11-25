import { useState } from 'react';
import { useSnackbar } from '@/components/notify';
import { createFilter, updateFilter, type SavedFilter } from '@/api/query';
import SidePanel from '@/components/SidePanel';
import { useApiError } from '@/components/useApiError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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
      const { field, message } = handleError(e, ['name', 'query']);
      if (field) setErrors({ [field]: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel size="md"
      title={editing ? `编辑筛选器 · ${editing.name}` : '保存为筛选器'}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={submit} disabled={busy}>{editing ? '保存' : '创建'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="filter-name" className="mb-2 block text-sm font-medium">名称</label>
          <Input
            id="filter-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors({}); }}
            aria-invalid={!!errors.name}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="filter-bql" className="mb-2 block text-sm font-medium">BQL</label>
          <Textarea
            id="filter-bql"
            value={bql}
            onChange={(e) => { setBql(e.target.value); setErrors({}); }}
            aria-invalid={!!errors.query}
            className={cn('min-h-20 resize-y font-mono text-sm')}
            rows={3}
          />
          <p className={cn('mt-1 text-xs', errors.query ? 'text-destructive' : 'text-muted-foreground')}>
            {errors.query ?? '空查询 = 全部任务'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">保存后出现在左侧「筛选器」里，一键打开。</p>
      </div>
    </SidePanel>
  );
};

export default FilterFormPanel;
