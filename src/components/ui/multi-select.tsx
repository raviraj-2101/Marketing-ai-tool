import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MultiSelectOption {
  value: string;
  label: string;
}

// Cap how many options are rendered at once. Large lists (e.g. thousands of ad ids)
// would otherwise mount thousands of DOM nodes and freeze the page; the search box
// narrows the list so any option is still reachable.
const MAX_VISIBLE = 100;

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange?: (values: string[]) => void;
  onClose?: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const MultiSelect = ({
  options,
  value,
  onChange,
  onClose,
  placeholder = "Select items...",
  className = "",
}: MultiSelectProps) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [localSelected, setLocalSelected] = useState<string[]>(value);

  useEffect(() => {
    if (!open) setLocalSelected(value);
  }, [value, open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && open) {
      setSearchValue("");
      const snapshot = localSelected;
      setTimeout(() => onClose?.(snapshot), 0);
    }
  };

  // closeAfter=true (desktop) preserves the original "close after a pick" behaviour;
  // on mobile the sheet stays open so several options can be toggled before Done.
  const toggleOption = (optionValue: string, closeAfter: boolean) => {
    setLocalSelected((prev) => {
      const next = prev.includes(optionValue)
        ? prev.filter((v) => v !== optionValue)
        : [...prev, optionValue];
      onChange?.(next);
      setTimeout(() => onClose?.(next), 0);
      return next;
    });
    if (closeAfter) {
      setOpen(false);
      setSearchValue("");
    }
  };

  const displayValue =
    localSelected.length === 0
      ? placeholder
      : localSelected.length === 1
        ? options.find((o) => o.value === localSelected[0])?.label || placeholder
        : `${localSelected.length} selected`;

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(searchValue.toLowerCase())
  );
  const visible = filtered.slice(0, MAX_VISIBLE);
  const hiddenCount = filtered.length - visible.length;

  const triggerButton = (
    <Button
      variant="outline"
      className={`w-full justify-between ${className}`}
    >
      <span className="truncate">{displayValue}</span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  const optionList = (closeAfter: boolean) => (
    <Command shouldFilter={false}>
      <div className="border-b px-3 py-2">
        <input
          type="text"
          placeholder="Search..."
          className="w-full bg-transparent text-sm outline-none"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </div>
      <CommandList className={isMobile ? "max-h-[60vh]" : "max-h-64"}>
        {filtered.length === 0 ? (
          <CommandEmpty>No options found.</CommandEmpty>
        ) : (
          <CommandGroup>
            {visible.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => toggleOption(option.value, closeAfter)}
                onPointerDown={(e) => e.preventDefault()}
                className={cn("cursor-pointer", isMobile && "py-2.5 text-base")}
              >
                <Checkbox
                  checked={localSelected.includes(option.value)}
                  onClick={(e) => e.preventDefault()}
                  className={cn("mr-2", isMobile && "h-5 w-5")}
                />
                {option.label}
              </CommandItem>
            ))}
            {hiddenCount > 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Showing first {MAX_VISIBLE} of {filtered.length} — type to narrow.
              </div>
            )}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );

  // Mobile: a bottom sheet so the option list is full-width, properly sized and tappable.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="h-auto max-h-[85vh] p-0 rounded-t-2xl flex flex-col gap-0"
          // Don't auto-focus the search input when the sheet opens — that pops the mobile
          // keyboard immediately. Focus the field only when the user taps it.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-4 pt-4 pb-2 text-left">
            <SheetTitle className="text-base">{placeholder}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden border-t border-border">{optionList(false)}</div>
          <div className="px-4 py-3 border-t border-border">
            <Button className="w-full" onClick={() => setOpen(false)}>
              Done{localSelected.length > 0 ? ` (${localSelected.length})` : ""}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: unchanged popover.
  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        {optionList(true)}
      </PopoverContent>
    </Popover>
  );
};
