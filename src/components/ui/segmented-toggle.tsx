import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Full-width (50/50) on mobile, compact inline pill on desktop. */
  fullWidthOnMobile?: boolean;
  size?: "sm" | "md";
  /** Extra classes for the track wrapper (e.g. `md:hidden`, `self-start`). */
  className?: string;
}

/**
 * A small segmented control (iOS-style). The selected segment is a filled
 * `primary` pill so it's unmistakably "on" — low-contrast `bg-background`-on-
 * `bg-muted` selections read as unselected and confuse users. One component so
 * every toggle in the app stays consistent.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  fullWidthOnMobile = false,
  size = "md",
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted p-0.5",
        fullWidthOnMobile ? "flex w-full sm:inline-flex sm:w-auto" : "inline-flex",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "rounded-md font-medium transition-colors whitespace-nowrap",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              fullWidthOnMobile && "flex-1 text-center sm:flex-none",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
