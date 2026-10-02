import { useRef, KeyboardEvent } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import type { ObjectOption } from '@/hooks/useCustomFields';

interface StringModeProps {
  mode: 'string';
  value: string[];
  onChange: (v: string[]) => void;
  draft: string;
  onDraftChange: (v: string) => void;
}

interface ObjectModeProps {
  mode: 'object';
  value: ObjectOption[];
  onChange: (v: ObjectOption[]) => void;
}

type Props = StringModeProps | ObjectModeProps;

export function OptionsInput(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (props.mode === 'string') {
    const { value, onChange, draft, onDraftChange } = props;

    const addChip = () => {
      const trimmed = draft.trim().replace(/,$/, '').trim();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      onDraftChange('');
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addChip();
      } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
        onChange(value.slice(0, -1));
      }
    };

    const removeChip = (idx: number) => onChange(value.filter((_, i) => i !== idx));

    return (
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Options (press Enter or comma to add)</Label>
        <div
          className="flex flex-wrap gap-1.5 min-h-[38px] p-2 border rounded-md cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((chip, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1 pr-1">
              {chip}
              <button type="button" onClick={() => removeChip(idx)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={addChip}
            className="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
            placeholder={value.length === 0 ? 'Type an option…' : ''}
          />
        </div>
      </div>
    );
  }

  // Object mode
  const { value, onChange } = props;

  const addRow = () => onChange([...value, { label: '', value: '' }]);
  const removeRow = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const updateRow = (idx: number, field: 'label' | 'value', val: string) => {
    const next = value.map((row, i) => (i === idx ? { ...row, [field]: val } : row));
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Options (label + ClickUp ID)</Label>
      <div className="space-y-2">
        {value.map((row, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input
              placeholder="Label"
              value={row.label}
              onChange={(e) => updateRow(idx, 'label', e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Value / ID"
              value={row.value}
              onChange={(e) => updateRow(idx, 'value', e.target.value)}
              className="flex-1"
            />
            <button type="button" onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
        <Plus className="h-3.5 w-3.5" /> Add option
      </Button>
    </div>
  );
}
