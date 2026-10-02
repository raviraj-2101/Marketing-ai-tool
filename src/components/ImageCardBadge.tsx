// ImageCardBadge.tsx
//
// Renders the inline image-card marker for Format 01a/01b (comparison
// "Top-5") scripts. Two modes:
//
//   - mode="start" (default): pops at the BEGINNING of the trigger sentence
//     ("I ranked the top 5..."). Model token `{{image-card: top-5}}`.
//   - mode="end": pops at the END of the trigger sentence (the card stops
//     showing once the trigger sentence finishes — Liam directive 2026-05-27
//     "it shouldn't be there for like super long"). Model token
//     `{{image-card-end}}`.
//
// Both modes render as small inline pills so the editor can scan exactly
// where the on-screen card APPEARS and DISAPPEARS in the timeline of the
// spoken VO. Different colors + arrows so they're easy to tell apart at a
// glance: primary/blue arrow-down for start, amber/orange arrow-up for end.

import { ImageIcon, ImageOff } from "lucide-react";

type ImageCardBadgeProps = {
  /** The capture from `{{image-card: <variant>}}` — e.g. "top-5". When
   *  undefined or empty, the badge omits the leading variant label.
   *  Ignored when mode="end" (end markers carry no variant). */
  variant?: string;
  /** "start" (default) renders the appears-here badge; "end" renders the
   *  disappears-here badge. */
  mode?: "start" | "end";
};

export function ImageCardBadge({ variant, mode = "start" }: ImageCardBadgeProps) {
  const variantLabel = variant && variant.trim().length > 0 ? variant.trim() : "";

  if (mode === "end") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 mx-1.5 text-[11px] font-semibold leading-snug align-baseline whitespace-nowrap shadow-sm"
        data-testid="image-card-end-badge"
        title="Trigger phrase ends here — image card disappears off screen at this point. Per LAW C1, the card should NOT linger past the trigger sentence."
      >
        <ImageOff className="size-3" aria-hidden="true" />
        <span aria-hidden="true">↗</span>
        <span>image card off</span>
      </span>
    );
  }

  // Short label since the badge sits at the START of the trigger line.
  const label = variantLabel
    ? `${variantLabel} card pops`
    : "image card pops";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/15 text-primary px-2 py-0.5 mr-1.5 text-[11px] font-semibold leading-snug align-baseline whitespace-nowrap shadow-sm"
      data-testid="image-card-badge"
      title={`Trigger phrase begins here — image card${variant ? ` (${variant})` : ""} appears on screen the moment the line starts.`}
    >
      <ImageIcon className="size-3" aria-hidden="true" />
      <span aria-hidden="true">↘</span>
      <span>{label}</span>
    </span>
  );
}
