import React, { useEffect, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { AdsField, type TslScript } from './useAdsDb';

function isUrl(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  return val.startsWith('http://') || val.startsWith('https://');
}

function isDate(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const d = new Date(val);
  return !isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(val);
}

function renderCellValue(value: unknown, fieldType: string) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (isUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
        <ExternalLink className="h-3.5 w-3.5" />
        Link
      </a>
    );
  }

  if (fieldType === 'date' && isDate(value as string)) {
    return format(new Date(value as string), 'dd-MM-yy');
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <Badge key={i} variant="outline" className="text-xs font-normal">
            {String(v)}
          </Badge>
        ))}
      </div>
    );
  }

  const strValue = String(value);
  return (
    <span className="truncate">
      {strValue}
    </span>
  );
}

function EditableTextCell({ value, onCellChange, rowId, colName, row }: { value: unknown; onCellChange?: (rowId: string, colName: string | null, newValue: unknown) => void; rowId: string; colName: string | null; row: any }) {
  const [localValue, setLocalValue] = useState(String(value || ''));

  useEffect(() => {
    setLocalValue(String(value || ''));
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== String(value || '')) {
        onCellChange?.(rowId, colName, localValue);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [localValue, value, rowId, colName, onCellChange]);

  return (
    <Input
      type="text"
      value={localValue}
      onChange={(e) => {
        setLocalValue(e.target.value);
      }}
      className="h-8"
      placeholder="text..."
    />
  );
}

function EditableDropdownCell({ value, onCellChange, rowId, colName, options, row }: { value: unknown; onCellChange?: (rowId: string, colName: string | null, newValue: unknown) => void; rowId: string; colName: string | null; options: Array<{ label: string; value: string }>; row: any }) {
  const [localValue, setLocalValue] = useState(String(value || ''));

  useEffect(() => {
    setLocalValue(String(value || ''));
  }, [value]);

  return (
    <Select value={localValue} onValueChange={(newVal) => {
      setLocalValue(newVal);
      onCellChange?.(rowId, colName, newVal);
    }}>
      <SelectTrigger className="w-full h-9">
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.label}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditableMultiSelectDropdownCell({ value, onCellChange, rowId, colName, options }: { value: unknown; onCellChange?: (rowId: string, colName: string | null, newValue: unknown) => void; rowId: string; colName: string | null; options: Array<{ label: string; value: string }> }) {
  const parseValue = (v: unknown): string[] =>
    typeof v === 'string' && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

  return (
    <MultiSelect
      options={options}
      value={parseValue(value)}
      onClose={(values) => onCellChange?.(rowId, colName, values.join(','))}
      placeholder="Select..."
      className="h-9 text-sm"
    />
  );
}

export function createAdsColumns(
  fields: AdsField[],
  onCellChange?: (rowId: string, colName: string | null, newValue: unknown) => void,
  tableName: 'ads' | 'statics_logs' = 'ads',
  tslScripts?: TslScript[]
): ColumnDef<Record<string, unknown>>[] {
  return fields.map((field) => {
    const colKey = tableName === 'statics_logs'
      ? (field.static_log_col_name || field.ads_col_name)
      : field.ads_col_name;

    return {
      accessorKey: colKey,
      header: field.name,
      size: field.width || 120,
      cell: ({ row }) => {
        const value = row.getValue(colKey);

        // Format Ad ID and Script ID with leading zeros
        if ((colKey === 'ad_id' || colKey === 'script_id')) {
          if (typeof value === 'number' || typeof value === 'string') {
            return <span className="truncate">{String(value).padStart(6, '0')}</span>;
          }
        }

        // Render as link if is_show_as_link is true and value is a URL
        if (field.is_show_as_link && isUrl(value)) {
          return (
            <a href={String(value)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
              Link
            </a>
          );
        }

        // Render TSL Script ID dropdown for statics_logs tsl_script_id field - check BEFORE text field
        if (colKey === 'tsl_script_id' && tableName === 'statics_logs' && tslScripts && tslScripts.length > 0 && field.is_editable_fields) {
          const options = tslScripts.map((script) => ({
            label: script.tsl_script_id,
            value: script.tsl_script_id,
          }));

          return (
            <EditableDropdownCell
              value={value}
              onCellChange={onCellChange}
              rowId={(row.original as any).id}
              colName={colKey}
              options={options}
              row={row}
            />
          );
        }

        // Render editable input for text type fields if is_show_as_link is false and field is editable
        if (field.type === 'text' && !field.is_show_as_link && field.is_editable_fields) {
          return (
            <EditableTextCell
              value={value}
              onCellChange={onCellChange}
              rowId={(row.original as any).id}
              colName={colKey}
              row={row}
            />
          );
        }

        // Render dropdown for dropdown type fields if field is editable
        if ((field.type === 'dropdown' || field.type === 'dropdown_text') && Array.isArray(field.options) && field.is_editable_fields) {
          const isObjectArray = field.options.length > 0 && typeof field.options[0] === 'object';
          const options = isObjectArray
            ? (field.options as Array<{ label: string; value: string }>)
            : (field.options as string[]).map((opt) => ({ label: opt, value: opt }));

          if (field.is_multi_select) {
            return (
              <EditableMultiSelectDropdownCell
                value={value}
                onCellChange={onCellChange}
                rowId={(row.original as any).id}
                colName={colKey}
                options={options}
              />
            );
          }

          return (
            <EditableDropdownCell
              value={value}
              onCellChange={onCellChange}
              rowId={(row.original as any).id}
              colName={colKey}
              options={options}
              row={row}
            />
          );
        }

        return renderCellValue(value, field.type);
      },
    };
  });
}
