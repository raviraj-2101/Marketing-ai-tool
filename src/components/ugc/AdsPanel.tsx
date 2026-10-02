import { X } from "lucide-react";
import type { AdsResult, AdRow } from "@/lib/parseAds";
import { AdCard } from "./AdCard";

export function AdsPanel({
  result,
  onClose,
  onIterate,
}: {
  result: AdsResult;
  onClose: () => void;
  onIterate: (ad: AdRow) => void;
}) {
  return (
    <aside className="flex h-full w-full flex-col border-l border-card-border bg-background">
      <header className="flex items-center justify-between border-b border-card-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">
            Ads · {result.count} result{result.count === 1 ? "" : "s"}
          </h3>
          {result.total_matched != null && result.total_matched > result.count && (
            <p className="text-[11px] text-muted-foreground">of {result.total_matched} matched</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close ads panel"
          className="rounded-md p-1 hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-auto p-3">
        {result.ads.map((ad) => (
          <AdCard key={ad.ad_id} ad={ad} onIterate={onIterate} />
        ))}
      </div>
    </aside>
  );
}
