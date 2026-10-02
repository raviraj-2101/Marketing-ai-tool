import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { PickerImage } from "@/lib/tslProductReference";

export const PRODUCT_REF_MAX = 5; // up to 5 reference angles (the product image is separate)

export interface ProductReferencePickerProps {
  label: string;
  hint?: string;
  images: PickerImage[];
  value: string[]; // single mode: [] or [url]; multi mode: 0..max urls
  onChange: (urls: string[]) => void;
  max?: number;
  single?: boolean; // single-select (the product image)
  showAuto?: boolean; // render an "Auto" tile that clears the selection (auto-pick)
  disabled?: boolean;
}

// Thumbnail picker for the "Include product" flow. Used twice: once as the single
// PRODUCT image (the label authority, with an Auto tile) and once as the multi-select
// REFERENCE images (extra angles, up to `max`). The product image and reference images
// are kept separate — exactly like the avatars flow.
export function ProductReferencePicker({
  label, hint, images, value, onChange, max = PRODUCT_REF_MAX, single = false, showAuto = false, disabled,
}: ProductReferencePickerProps) {
  const tileBase =
    "relative rounded-md border-2 overflow-hidden text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:pointer-events-none";
  const selected = "border-primary ring-2 ring-primary/30";
  const unselected = "border-border/60 hover:border-primary/40";
  const atMax = !single && value.length >= max;

  const toggle = (url: string) => {
    if (single) { onChange(value[0] === url ? [] : [url]); return; }
    if (value.includes(url)) onChange(value.filter((u) => u !== url));
    else if (!atMax) onChange([...value, url]);
  };

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">
          {value.length === 0 ? (showAuto ? "Auto" : "none") : single ? "1 selected" : `${value.length}/${max}`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {showAuto && (
          <button
            type="button"
            data-testid="product-ref-auto"
            disabled={disabled}
            onClick={() => onChange([])}
            className={cn(tileBase, "flex h-24 flex-col items-center justify-center gap-1 bg-muted/40", value.length === 0 ? selected : unselected)}
          >
            {value.length === 0 && <Check className="absolute right-1 top-1 h-3.5 w-3.5 text-primary" />}
            <span className="text-xs font-medium">Auto</span>
            <span className="text-[10px] text-muted-foreground">recommended</span>
          </button>
        )}

        {images.map((img, i) => {
          const order = value.indexOf(img.url);
          const isSel = order !== -1;
          return (
            <button
              type="button"
              key={img.url}
              data-testid={`product-ref-tile-${i}`}
              disabled={disabled || (!isSel && atMax)}
              title={img.explanation || img.source}
              onClick={() => toggle(img.url)}
              className={cn(tileBase, "h-24", isSel ? selected : unselected)}
            >
              {isSel && (single
                ? <Check className="absolute right-1 top-1 h-3.5 w-3.5 text-primary drop-shadow" />
                : <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{order + 1}</span>
              )}
              <img src={img.url} alt={img.explanation || img.source} className="h-full w-full bg-white object-contain p-1" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-0.5 text-[9px] capitalize text-white">
                {img.source}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {images.length === 0 ? "No catalog images for this product." : (hint || "")}
      </div>
    </div>
  );
}
