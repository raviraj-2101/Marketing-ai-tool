// animatedBuildSession.ts
//
// Format-04 ("Animated Characters - Ads") handoff from ScriptChat -> BatchCreator.
//
// Mirrors the classic onBuildUgc handoff: it writes the SAME sessionStorage key
// ("ugc.create.payload") that BatchCreator's hydrate effect reads. The only
// difference is the 04 payload carries the parsed `animated` storyboard (instead
// of classic `scripts`) and sets `format` to ANIMATED_BUILD_FORMAT so the
// hydrate effect can route on slug alone (no content sniffing).

import type { ParsedAnimatedCharsScript } from "./parseAnimatedChars";

export const ANIMATED_BUILD_FORMAT = "04-animated-characters-ads";
export const ANIMATED_BUILD_LABEL = "Animated Characters - Ads";

export type AnimatedBuildPayload = {
  product: any;
  chatId: string | null;
  format: string;
  formatLabel: string;
  animated: ParsedAnimatedCharsScript;
};

export function saveAnimatedBuild(p: AnimatedBuildPayload): void {
  try {
    window.sessionStorage.setItem("ugc.create.payload", JSON.stringify(p));
  } catch {
    /* sessionStorage quota */
  }
}
