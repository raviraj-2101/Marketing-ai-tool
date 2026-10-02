// Shared Concept-form controls so the TSL "Concept" form and the AI UGC tool's
// concept step render with one identical experience. These were lifted verbatim
// from the UGC batch creator (src/pages/BatchCreator.tsx) and are now the single
// source of truth used by both tools.

import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronDown } from "lucide-react";

export type CsOwner = { label: string; email: string };

export function SoftSelect({
  value, onChange, options, placeholder, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const NONE = "__none__";
  const cleanOptions = options.filter((o) => o && o.trim());
  // If the current value isn't in the fetched list, surface it as a one-off
  // item so the trigger doesn't show a blank/broken state.
  const valueNotInList = value && !cleanOptions.includes(value);
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger className="h-9 text-[12.5px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="italic text-muted-foreground">{placeholder}</SelectItem>
        {valueNotInList && (
          <SelectItem value={value}>{value}</SelectItem>
        )}
        {cleanOptions.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ChipMultiSelect({
  value, onChange, options, placeholder, disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const toggle = (o: string) => {
    if (value.includes(o)) onChange(value.filter((x) => x !== o));
    else onChange([...value, o]);
  };
  if (disabled || options.length === 0) {
    return (
      <div className="text-[11.5px] text-muted-foreground italic px-3 py-2 rounded-md border border-dashed border-border/85">
        {placeholder}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              active
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && <Check className="size-2.5" />}
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function CsCombobox({
  value, owners, onChange,
}: {
  value: string;
  owners: CsOwner[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (owners.length === 0) {
    return (
      <div className="h-9 px-3 flex items-center text-[12.5px] rounded-md border border-border/85 bg-muted/30 text-muted-foreground">
        {value || "Agentic"} <span className="ml-auto text-[10.5px] italic">(roster unavailable)</span>
      </div>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full px-3 flex items-center text-[12.5px] rounded-md border border-border/85 bg-background hover:bg-muted/40 transition-colors text-left"
        >
          <span className="truncate">{value || "Pick a CS"}</span>
          <ChevronDown className="ml-auto size-3.5 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search Creative Strategists…" className="h-9 text-[12px]" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No CS matched.</CommandEmpty>
            <CommandGroup>
              {owners.map((c) => (
                <CommandItem
                  key={c.label}
                  value={`${c.label} ${c.email}`}
                  onSelect={() => { onChange(c.label); setOpen(false); }}
                  className="text-[12px] flex items-center"
                >
                  <Check className={`mr-2 size-3.5 ${value === c.label ? "opacity-100 text-emerald-500" : "opacity-0"}`} />
                  <span className="font-medium">{c.label}</span>
                  <span className="ml-auto text-[10.5px] text-muted-foreground">{c.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
