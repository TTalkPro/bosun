import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COLUMN_LABEL, type ColumnKey } from './columns';

interface Props {
  /** 这张表里能切换的列 */
  columns: ColumnKey[];
  hidden: ColumnKey[];
  onChange: (hidden: ColumnKey[]) => void;
}

// 「显示列」菜单（shadcn tasks 示例的 View 按钮）：勾选后菜单不关，连续切几列不用反复点开
const ColumnsMenu = ({ columns, hidden, onChange }: Props) => {
  const hiddenHere = hidden.filter((k) => columns.includes(k));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Settings2 />显示列
          {hiddenHere.length > 0 && <span className="rounded-sm bg-secondary px-1 text-xs font-normal tabular-nums">{columns.length - hiddenHere.length}/{columns.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">切换列</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={!hidden.includes(key)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? hidden.filter((k) => k !== key) : [...hidden, key])}
          >
            {COLUMN_LABEL[key]}
          </DropdownMenuCheckboxItem>
        ))}
        {hiddenHere.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(hidden.filter((k) => !columns.includes(k)))} className="justify-center text-sm">全部显示</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ColumnsMenu;
