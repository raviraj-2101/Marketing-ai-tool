import React, { useState, useEffect, useRef } from 'react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ExternalLink, Trash2, Plus, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import type { AdsField, TslScript } from './useAdsDb';

// AG Grid v32+ cell editor props
interface CellEditorProps {
  value: any;
  onValueChange: (value: any) => void;
  stopEditing: (cancel?: boolean) => void;
  options?: Array<{ label: string; value: string }>;
  canAddOptions?: boolean;
  onOpenManageOptions?: () => void;
  [key: string]: any;
}

// ─── Manage Options Dialog (rendered at page level, not inside cell editor) ─────
export interface ManageOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  fieldName?: string;
  initialOptions: Array<{ label: string; value: string }>;
  onAdd?: (label: string) => void;
  onRemove?: (label: string) => void;
  onRename?: (oldLabel: string, newLabel: string) => void;
  canEdit?: boolean;
}

export function ManageOptionsDialog({
  open,
  onClose,
  fieldName,
  initialOptions,
  onAdd,
  onRemove,
  onRename,
  canEdit = true,
}: ManageOptionsDialogProps) {
  const [localOptions, setLocalOptions] = useState<Array<{ label: string; value: string }>>(initialOptions);
  const [newLabel, setNewLabel] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Re-sync local state whenever the dialog opens (new field or re-open)
  useEffect(() => {
    if (open) {
      setLocalOptions(initialOptions);
      setNewLabel('');
      setEditingLabel(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = () => {
    const trimmed = newLabel.trim();
    if (!trimmed || localOptions.some((o) => o.label === trimmed)) return;
    setLocalOptions((prev) => [...prev, { label: trimmed, value: trimmed }]);
    setNewLabel('');
    onAdd?.(trimmed);
  };

  const handleRemove = (label: string) => {
    setLocalOptions((prev) => prev.filter((o) => o.label !== label));
    onRemove?.(label);
  };

  const handleStartEdit = (label: string) => {
    setEditingLabel(label);
    setEditValue(label);
  };

  const handleSaveEdit = () => {
    if (!editingLabel) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== editingLabel && !localOptions.some((o) => o.label === trimmed)) {
      setLocalOptions((prev) =>
        prev.map((o) => (o.label === editingLabel ? { label: trimmed, value: trimmed } : o)),
      );
      onRename?.(editingLabel, trimmed);
    }
    setEditingLabel(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{fieldName ? `Options — ${fieldName}` : 'Manage Options'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
          {localOptions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No options yet</p>
          )}
          {localOptions.map((opt) => (
            <div key={opt.label} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50">
              {editingLabel === opt.label ? (
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                    if (e.key === 'Escape') setEditingLabel(null);
                  }}
                  onBlur={handleSaveEdit}
                  autoFocus
                  className="h-7 text-sm flex-1"
                />
              ) : (
                <>
                  <span className="text-sm flex-1 truncate">{opt.label}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(opt.label)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(opt.label)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder="New option…"
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleAdd} className="h-8 px-3">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isUrl(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  return val.startsWith('http://') || val.startsWith('https://');
}

function isDateStr(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const d = new Date(val);
  return !isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(val);
}

// ─── Text Cell Editor ──────────────────────────────────────────────────────────
export function TextCellEditor(props: CellEditorProps) {
  const [value, setValue] = useState(String(props.value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 20); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    props.onValueChange(v);
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={handleChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.stopEditing();
        if (e.key === 'Escape') props.stopEditing(true);
      }}
      style={{
        width: '100%', height: '100%', padding: '0 8px', fontSize: '13px',
        border: 'none', outline: '1px solid hsl(var(--ring))',
        background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
        boxSizing: 'border-box',
      }}
    />
  );
}

// ─── Dropdown Cell Editor (popup) ──────────────────────────────────────────────
export function DropdownCellEditor(props: CellEditorProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 20); }, []);

  const options = props.options ?? [];
  const filtered = search
    ? options.filter((o: { label: string }) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleSelectOption = (label: string) => {
    console.log('[DropdownCellEditor] Selected:', label);
    props.onValueChange(label);

    // Call onSelectValue callback if provided (for Points column to trigger API save)
    if (typeof props.onSelectValue === 'function') {
      console.log('[DropdownCellEditor] Calling onSelectValue callback');
      props.onSelectValue(label);
    }

    setTimeout(() => {
      console.log('[DropdownCellEditor] Calling stopEditing(false)');
      props.stopEditing(false);
    }, 0);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: 'hsl(var(--background))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,.15)',
      width: '200px', maxHeight: '300px', overflow: 'hidden',
    }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid hsl(var(--border))' }}>
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && props.stopEditing(true)}
          placeholder="Search..."
          style={{ width: '100%', fontSize: '12px', background: 'transparent', border: 'none', outline: 'none', color: 'hsl(var(--foreground))' }}
        />
      </div>
      <div style={{ overflowY: 'auto', maxHeight: '220px' }}>
        {filtered.length === 0
          ? <div style={{ padding: '8px 12px', fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>No options</div>
          : filtered.map((opt: { label: string; value: string }) => (
            <div
              key={opt.value}
              style={{
                padding: '6px 12px', fontSize: '13px', cursor: 'pointer',
                background: props.value === opt.label ? 'hsl(var(--muted))' : 'transparent',
                color: 'hsl(var(--foreground))',
              }}
              onMouseEnter={e => { if (props.value !== opt.label) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--muted) / 0.5)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = props.value === opt.label ? 'hsl(var(--muted))' : 'transparent'; }}
              onMouseDown={e => {
                e.preventDefault();
                handleSelectOption(opt.label);
              }}
            >
              {opt.label}
            </div>
          ))
        }
      </div>
      {props.canAddOptions && (
        <div style={{ padding: '5px 8px', borderTop: '1px solid hsl(var(--border))' }}>
          <button
            onMouseDown={e => {
              e.preventDefault();
              props.onOpenManageOptions?.();
              props.stopEditing(true);
            }}
            style={{
              width: '100%', fontSize: '12px', fontWeight: 500, padding: '4px 8px',
              borderRadius: '4px', border: '1px solid hsl(var(--border))',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              background: 'transparent', color: 'hsl(var(--foreground))',
            }}
          >
            <span style={{ fontSize: '14px' }}>⚙</span> Edit Options
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Multi-Select Cell Editor (popup) ──────────────────────────────────────────
export function MultiSelectCellEditor(props: CellEditorProps) {
  const parseValue = (v: unknown): string[] =>
    typeof v === 'string' && v.trim() ? v.split(',').map(s => s.trim()).filter(Boolean) : [];

  const [selected, setSelected] = useState<string[]>(parseValue(props.value));
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 20); }, []);

  const options = props.options ?? [];

  const toggle = (label: string) => {
    const next = selected.includes(label)
      ? selected.filter(v => v !== label)
      : [...selected, label];
    setSelected(next);
    props.onValueChange(next.join(','));
  };

  const filtered = search
    ? options.filter((o: { label: string }) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: 'hsl(var(--background))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,.15)',
      width: '220px', maxHeight: '300px',
    }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid hsl(var(--border))' }}>
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && props.stopEditing(true)}
          placeholder="Search..."
          style={{ width: '100%', fontSize: '12px', background: 'transparent', border: 'none', outline: 'none', color: 'hsl(var(--foreground))' }}
        />
      </div>
      <div style={{ overflowY: 'auto', maxHeight: '190px' }}>
        {filtered.length === 0
          ? <div style={{ padding: '8px 12px', fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>No options</div>
          : filtered.map((opt: { label: string; value: string }) => (
            <div
              key={opt.value}
              style={{
                padding: '6px 12px', fontSize: '13px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: selected.includes(opt.label) ? 'hsl(var(--muted) / 0.5)' : 'transparent',
                color: 'hsl(var(--foreground))',
              }}
              onMouseDown={e => { e.preventDefault(); toggle(opt.label); }}
            >
              <span style={{
                width: '15px', height: '15px', borderRadius: '3px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
                border: `1px solid ${selected.includes(opt.label) ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                background: selected.includes(opt.label) ? 'hsl(var(--primary))' : 'transparent',
                color: 'hsl(var(--primary-foreground))',
              }}>
                {selected.includes(opt.label) ? '✓' : ''}
              </span>
              {opt.label}
            </div>
          ))
        }
      </div>
      <div style={{ padding: '5px 8px', borderTop: '1px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        {props.canAddOptions ? (
          <button
            onMouseDown={e => {
              e.preventDefault();
              props.onOpenManageOptions?.();
              props.stopEditing(true);
            }}
            style={{
              fontSize: '12px', fontWeight: 500, padding: '4px 8px',
              borderRadius: '4px', border: '1px solid hsl(var(--border))',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
              background: 'transparent', color: 'hsl(var(--foreground))',
            }}
          >
            <span style={{ fontSize: '14px' }}>⚙</span> Edit
          </button>
        ) : <span />}
        <button
          style={{
            fontSize: '12px', fontWeight: 500, padding: '4px 12px', borderRadius: '4px',
            border: 'none', cursor: 'pointer',
            background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
          }}
          onMouseDown={e => { e.preventDefault(); props.stopEditing(); }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Read-only renderer ────────────────────────────────────────────────────────
function renderReadOnly(value: unknown, fieldType: string) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (isUrl(value)) {
    return (
      <a href={value as string} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-blue-600 hover:underline">
        <ExternalLink className="h-3.5 w-3.5" />Link
      </a>
    );
  }
  if (fieldType === 'date' && isDateStr(value as string)) {
    return <span>{format(new Date(value as string), 'dd-MM-yy')}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {(value as unknown[]).map((v, i) => (
          <Badge key={i} variant="outline" className="text-xs font-normal">{String(v)}</Badge>
        ))}
      </div>
    );
  }
  return <span className="truncate">{String(value)}</span>;
}

// ─── Normalise any options shape → { label, value } for editors ───────────────
export function normalizeDropdownOptions(
  rawOptions: unknown[],
  isProductLevel: boolean,
  selectedProductName?: string,
): Array<{ label: string; value: string }> {
  if (isProductLevel) {
    const filtered = selectedProductName
      ? rawOptions.filter((opt) =>
          typeof opt === 'object' && opt !== null && 'product' in opt &&
          (opt as { product: string[] }).product.includes(selectedProductName),
        )
      : rawOptions;
    return filtered.map((opt) => {
      const label = (opt as { label: string }).label ?? String(opt);
      return { label, value: label };
    });
  }

  if (rawOptions.length === 0) return [];

  if (typeof rawOptions[0] === 'string') {
    return (rawOptions as string[]).map((opt) => ({ label: opt, value: opt }));
  }

  return (rawOptions as Array<{ label: string }>).map((o) => ({ label: o.label, value: o.label }));
}

// ─── Column Factory ────────────────────────────────────────────────────────────
export function createAdsAgGridColumns(
  fields: AdsField[],
  tableName: 'ads' | 'statics_logs' = 'ads',
  tslScripts?: TslScript[],
  selectedProductName?: string,
  onOpenManageOptions?: (fieldId: string) => void,
  canEdit?: boolean,
  userOptionsMap?: Record<string, { label: string; value: string }[]>,
): ColDef[] {
  return fields.map((field) => {
    const colKey = tableName === 'statics_logs'
      ? (field.static_log_col_name || field.ads_col_name)
      : field.ads_col_name;

    const colDef: ColDef = {
      field: colKey,
      headerName: field.name,
      width: field.width || 120,
      minWidth: field.width || 120,
      cellRenderer: (params: ICellRendererParams) => {
        const value = params.value;
        if ((colKey === 'ad_id' || colKey === 'script_id') && value != null) {
          return <span style={{ fontFamily: 'monospace' }}>{String(value).padStart(6, '0')}</span>;
        }
        if (field.is_show_as_link && isUrl(value)) {
          return (
            <a href={String(value)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />Link
            </a>
          );
        }
        return renderReadOnly(value, field.type);
      },
    };

    if (field.is_editable_fields) {
      colDef.editable = true;

      if (colKey === 'tsl_script_id' && tableName === 'statics_logs' && tslScripts?.length) {
        const options = tslScripts.map(s => ({ label: s.tsl_script_id, value: s.tsl_script_id }));
        colDef.cellEditor = DropdownCellEditor;
        colDef.cellEditorParams = { options };
        colDef.cellEditorPopup = true;
      } else if ((field.type === 'dropdown' || field.type === 'dropdown_text') && Array.isArray(field.options)) {
        const options = normalizeDropdownOptions(
          field.options as unknown[],
          !!field.is_option_product_level,
          selectedProductName,
        );

        const canAdd = (!field.is_add_in_clickup || field.type === 'dropdown_text') && !!onOpenManageOptions && (canEdit !== false);
        const openManageCallback = canAdd
          ? () => onOpenManageOptions!(field.id)
          : undefined;

        colDef.cellEditorPopup = true;
        const editorParams = { options, canAddOptions: canAdd, onOpenManageOptions: openManageCallback };

        if (field.is_multi_select) {
          colDef.cellEditor = MultiSelectCellEditor;
          colDef.cellEditorParams = editorParams;
        } else {
          colDef.cellEditor = DropdownCellEditor;
          colDef.cellEditorParams = editorParams;
        }
      } else if (field.type === 'user') {
        const options = userOptionsMap?.[field.id] ?? [];
        colDef.cellEditor = DropdownCellEditor;
        colDef.cellEditorParams = { options };
        colDef.cellEditorPopup = true;
      } else if (field.type === 'text') {
        colDef.cellEditor = TextCellEditor;
      }
    }

    return colDef;
  });
}
