// Shared contract for handing a Pixar storyboard from the Script Chat side
// panel to the /pixar-builder page via sessionStorage (mirrors the classic
// "Build as UGC ads" → batch-creator handoff).

import type { ParsedFormat3Script, PixarSceneData } from "@/lib/parsePixar";

export const PIXAR_BUILD_KEY = "pixar.build.payload";

export interface PixarBuildSession {
  meta: ParsedFormat3Script["meta"];
  scenes: PixarSceneData[];
  productLabel?: string;
  productSlug?: string;
  /** Script's format label (e.g. "Pixar-Style Video Ads (under 60s)") — stamped
   *  onto each scene's fal video row as video_format (drives the 60s cap). */
  videoFormat?: string;
  chatId?: string | null;
  savedAt: number;
}

export function savePixarBuild(
  payload: Omit<PixarBuildSession, "savedAt">,
): boolean {
  try {
    window.sessionStorage.setItem(
      PIXAR_BUILD_KEY,
      JSON.stringify({ ...payload, savedAt: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadPixarBuild(): PixarBuildSession | null {
  try {
    const raw = window.sessionStorage.getItem(PIXAR_BUILD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PixarBuildSession;
    if (!parsed?.scenes?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Parse a duration meta string ("5s", "0:05", "5 sec") into whole seconds. */
export function parseDurationSeconds(meta?: string): number | null {
  if (!meta) return null;
  const clock = meta.match(/(\d+):(\d{1,2})/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);
  const num = meta.match(/(\d+(?:\.\d+)?)/);
  return num ? Math.round(parseFloat(num[1])) : null;
}

/** Map parsed scenes into the snake_case payload the Image Builder expects. */
export function toImageBuilderScenes(
  scenes: PixarSceneData[],
): Array<Record<string, unknown>> {
  return scenes.map((s) => ({
    scene_number: s.sceneNumber,
    duration_s: parseDurationSeconds(s.meta),
    spoken_line: s.spokenLine || "",
    setting: s.visual.setting ?? null,
    expression: s.visual.characterExpression ?? null,
    action: s.visual.characterAction ?? null,
    camera: s.visual.camera ?? null,
    characters_in_scene: s.visual.charactersInScene ?? null,
    audio_beat: s.audioBeat ?? null,
    bridge_beat: s.bridgeBeat ?? null,
    is_product_to_show: !!s.isProductToShow,
  }));
}
