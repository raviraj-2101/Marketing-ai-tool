// Color-scheme presets for the Automations static title bar.
//
// IMPORTANT: this is a deliberate COPY of the manual builder's SWATCHES
// (StaticBarEditor.tsx:28-37). The manual builder is intentionally NOT importing
// from here so its file stays untouched (zero risk to the manual flow). If you
// change one list, update the other by hand.

export interface ColorScheme {
  label: string;
  bg: string; // background hex
  fg: string; // text hex
}

export const STATIC_BAR_PRESETS: ColorScheme[] = [
  { label: "FB Red",   bg: "#E53935", fg: "#FFFFFF" },
  { label: "Cobalt",   bg: "#1A73E8", fg: "#FFFFFF" },
  { label: "Emerald",  bg: "#0F9D58", fg: "#FFFFFF" },
  { label: "Amber",    bg: "#F4B400", fg: "#1F1F1F" },
  { label: "Black",    bg: "#1F1F1F", fg: "#FFFFFF" },
  { label: "White",    bg: "#FFFFFF", fg: "#1F1F1F" },
  { label: "Hot Pink", bg: "#E91E63", fg: "#FFFFFF" },
  { label: "Purple",   bg: "#7E57C2", fg: "#FFFFFF" },
];

export const MAX_SCHEMES = 6;

/** Two schemes are "the same" if their bg+fg match (case-insensitive). */
export const sameScheme = (a: ColorScheme, b: ColorScheme) =>
  a.bg.toUpperCase() === b.bg.toUpperCase() && a.fg.toUpperCase() === b.fg.toUpperCase();

/**
 * Toggle a preset in/out of the current selection.
 * - Removing the last remaining scheme is a no-op (enforces min 1).
 * - Adding past `max` is a no-op (enforces max).
 * Returns a new array (never mutates the input).
 */
export function toggleScheme(current: ColorScheme[], preset: ColorScheme, max = MAX_SCHEMES): ColorScheme[] {
  const idx = current.findIndex((s) => sameScheme(s, preset));
  if (idx >= 0) {
    if (current.length <= 1) return current;
    return current.filter((_, i) => i !== idx);
  }
  if (current.length >= max) return current;
  return [...current, preset];
}
