// parsePixar.ts
//
// Self-contained parser for Format 03 — "Pixar-style video ads" storyboards.
// Ported verbatim from the reference bench
// (new-scripts-formats-developement/client/src/lib/parseScripts.ts) so the
// rendering matches the client exactly. Kept as its own module so the team's
// parseScripts.ts (classic + comparison) is untouched.
//
// A Pixar message is a scene-by-scene storyboard, emitted either as canonical
// YAML (`meta:` + `storyboard:` with `scene_number:` entries) or as the older
// Markdown shape (`**Scene N**` headings). Both are handled.

// ---------- Types ----------

export type SceneVisualNotes = {
  setting?: string;
  characterExpression?: string;
  characterAction?: string;
  camera?: string;
  // Which roster characters appear on screen in this scene (Pixar law P18).
  charactersInScene?: string;
};

export type PixarSceneData = {
  sceneNumber: number;
  meta?: string;
  spokenLine: string;
  visual: SceneVisualNotes;
  audioBeat?: string;
  bridgeBeat?: string;
  // True when the product must be showcased in this scene (held in hand, placed
  // in background, packshot). Defaults to false when not declared (Pixar law P19).
  isProductToShow?: boolean;
};

export type PixarCharacter = {
  // Display label derived from the YAML key: "main_character" → "Main character",
  // "character_1" → "Character 1".
  label: string;
  // The full "Name: <name>. <one paragraph>" value.
  value: string;
};

export type ParsedFormat3Script = {
  meta: {
    mainCharacter?: string;
    mainPain?: string;
    chosenStorylinePattern?: string;
    // Full cast roster from the meta `characters:` map (Pixar law P17).
    characters?: PixarCharacter[];
  };
  scenes: PixarSceneData[];
  preface: string;
};

// "main_character" → "Main character", "character_1" → "Character 1".
function prettifyCharacterKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------- Shared helpers ----------

export function stripHtmlComments(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/===META===[\s\S]*?===END_META===\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse a Pixar `spoken_line` string into per-speaker turns. The LLM emits
 * multi-speaker scenes as inline `Speaker Name: dialogue` patterns; the
 * renderer splits each speaker into its own sub-block under SPOKEN.
 */
export function parseSpeakerTurns(
  spokenLine: string,
): Array<{ speaker?: string; text: string }> {
  if (!spokenLine || typeof spokenLine !== "string") return [{ text: "" }];
  const text = spokenLine.trim();
  if (!text) return [{ text: "" }];

  const SPEAKER_RX =
    /(^|[\.\?!]\s+)([A-Z][a-zA-Z]{0,15}\.?(?:\s[A-Z][a-zA-Z]{0,15}){0,2}):\s+/g;

  const matches: Array<{ start: number; end: number; speaker: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = SPEAKER_RX.exec(text)) !== null) {
    const boundaryLen = m[1].length;
    matches.push({
      start: m.index + boundaryLen,
      end: m.index + m[0].length,
      speaker: m[2].trim(),
    });
  }

  if (matches.length === 0) return [{ text }];

  const turns: Array<{ speaker?: string; text: string }> = [];

  if (matches[0].start > 0) {
    const leading = text.slice(0, matches[0].start).trim();
    const cleaned = leading.replace(/[\.\?!]\s*$/, "").trim();
    if (cleaned) turns.push({ text: cleaned });
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const dialogueEnd = next ? next.start : text.length;
    let dialogue = text.slice(cur.end, dialogueEnd).trim();
    if (next) dialogue = dialogue.replace(/[\.\?!]\s*$/, "").trim();
    if (dialogue || cur.speaker) {
      turns.push({ speaker: cur.speaker, text: dialogue });
    }
  }

  if (turns.length === 0) return [{ text }];
  return turns;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const m = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*$/);
  if (m) return m[1].trim();
  const m2 = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```\s*$/);
  if (m2) return m2[1].trim();
  return text;
}

function unquoteYaml(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if ((t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("“") && t.endsWith("”"))) {
    return t.slice(1, -1).trim();
  }
  if ((t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith("‘") && t.endsWith("’"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

// Recognized scene-heading shapes (bold / H2 / colon-suffixed, optional timecode).
const SCENE_HEADING_RX =
  /^[ \t]*(?:\*\*\s*Scene\s+(\d+)\s*(?:\(([^)]+)\))?\s*\*\*\s*(?:\(([^)]+)\))?|##+\s*Scene\s+(\d+)\s*(?:\(([^)]+)\))?|Scene\s+(\d+)\s*(?:\(([^)]+)\))?\s*:)[ \t]*$/gim;

// ---------- Canonical YAML parser ----------

function parseFormat3Yaml(text: string): ParsedFormat3Script | null {
  if (!/^[ \t]*meta\s*:/m.test(text) || !/^[ \t]*storyboard\s*:/m.test(text)) {
    return null;
  }
  const lines = text.split("\n");
  let metaStart = -1, storyboardStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^meta\s*:\s*$/.test(ln) || /^meta\s*:\s+/.test(ln)) {
      metaStart = i;
    } else if (/^storyboard\s*:\s*$/.test(ln) || /^storyboard\s*:\s+/.test(ln)) {
      storyboardStart = i;
    }
  }
  if (metaStart > storyboardStart && metaStart !== -1) {
    for (let i = metaStart + 1; i < lines.length; i++) {
      const ln = lines[i];
      if (/^storyboard\s*:\s*$/.test(ln) || /^storyboard\s*:\s+/.test(ln)) {
        storyboardStart = i;
        break;
      }
    }
  }
  if (metaStart === -1 || storyboardStart === -1) return null;

  // --- META block ---
  const metaLines = lines.slice(metaStart + 1, storyboardStart);
  const meta: ParsedFormat3Script["meta"] = {};
  let inMainPain = false;
  let inCharacters = false;
  const mainPainParts: { visible?: string; hidden?: string } = {};
  const characters: PixarCharacter[] = [];
  for (const raw of metaLines) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^[ \t]*/)?.[0].length || 0;
    const line = raw.trim();
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const value = kv[2].trim();
    if (key === "main_pain" && !value) {
      inMainPain = true;
      inCharacters = false;
      continue;
    }
    if (key === "characters" && !value) {
      inCharacters = true;
      inMainPain = false;
      continue;
    }
    if (inMainPain && indent > 2 && (key === "visible" || key === "hidden")) {
      if (key === "visible") mainPainParts.visible = unquoteYaml(value);
      else mainPainParts.hidden = unquoteYaml(value);
      continue;
    }
    // Nested roster entries (main_character / character_1 / character_2 …) are
    // captured here BEFORE the top-level main_character assignment below, so the
    // roster's main_character does not clobber the persona-paragraph field.
    if (inCharacters && indent > 2) {
      const cv = unquoteYaml(value);
      if (cv) characters.push({ label: prettifyCharacterKey(key), value: cv });
      continue;
    }
    if (indent <= 2) { inMainPain = false; inCharacters = false; }
    const v = unquoteYaml(value);
    if (key === "main_character") meta.mainCharacter = v;
    else if (key === "main_pain") meta.mainPain = v;
    else if (key === "chosen_template" || key === "chosen_storyline_pattern" ||
             key === "storyline_pattern") {
      if (!meta.chosenStorylinePattern && v) meta.chosenStorylinePattern = v;
    }
  }
  if (!meta.mainPain && (mainPainParts.visible || mainPainParts.hidden)) {
    const parts: string[] = [];
    if (mainPainParts.visible) parts.push(`Visible: ${mainPainParts.visible}`);
    if (mainPainParts.hidden) parts.push(`Hidden: ${mainPainParts.hidden}`);
    meta.mainPain = parts.join(" · ");
  }
  if (characters.length > 0) meta.characters = characters;

  // --- STORYBOARD block ---
  const sbLines = lines.slice(storyboardStart + 1);
  type SceneRaw = { lines: string[]; baseIndent: number };
  const sceneRaws: SceneRaw[] = [];
  let cur: SceneRaw | null = null;
  for (const raw of sbLines) {
    // A scene starts at a `scene_number:` line — with the canonical YAML list
    // dash (`- scene_number:`) OR without it (some models emit a bare
    // `Scene N` heading followed by an indented `scene_number:`). Bare
    // `Scene N` heading lines carry no data and are ignored (they fall into
    // the prior chunk and match no key).
    const m = raw.match(/^(\s*)(?:-\s+)?scene_number\s*:\s*(\d+)/);
    if (m) {
      if (cur) sceneRaws.push(cur);
      cur = { lines: [raw], baseIndent: m[1].length };
      continue;
    }
    if (cur) cur.lines.push(raw);
  }
  if (cur) sceneRaws.push(cur);
  if (sceneRaws.length === 0) return null;

  const scenes: PixarSceneData[] = [];
  for (const sr of sceneRaws) {
    let sceneNumber = 0;
    let duration: string | undefined;
    let characterExpression: string | undefined;
    let emotionalBeat: string | undefined;
    let bridgeBeat: string | undefined;
    let isProductToShow = false;
    const visual: SceneVisualNotes = {};
    let spokenLine = "";
    const audioParts: string[] = [];
    let activeBlock: "visual" | "audio" | null = null;
    for (const raw of sr.lines) {
      if (!raw.trim()) continue;
      const indent = raw.match(/^[ \t]*/)?.[0].length || 0;
      const line = raw.replace(/^[ \t]*-?\s*/, "").trim();
      const blockM = line.match(/^(visual|audio|spoken)\s*:\s*$/i);
      if (blockM) {
        const blockName = blockM[1].toLowerCase();
        activeBlock = blockName === "spoken" ? "audio" : (blockName as "visual" | "audio");
        continue;
      }
      const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1].toLowerCase();
      const value = unquoteYaml(kv[2]);
      if (indent <= sr.baseIndent + 2 && activeBlock &&
          key !== "visual" && key !== "audio") {
        if (key !== "setting" && key !== "camera" && key !== "character_action" &&
            key !== "characters_in_scene" &&
            key !== "spoken_line" && key !== "sound_design" && key !== "music") {
          activeBlock = null;
        }
      }
      if (key === "scene_number") {
        sceneNumber = parseInt(value, 10) || 0;
      } else if (key === "duration_s" || key === "duration") {
        duration = value;
      } else if (key === "character_expression") {
        characterExpression = value;
      } else if (key === "emotional_beat") {
        emotionalBeat = value;
      } else if (key === "bridge_beat" || key === "connection_from_previous") {
        bridgeBeat = value;
      } else if (key === "is_product_to_show" || key === "isproducttoshow" ||
                 key === "show_product") {
        isProductToShow = /^(true|yes|1)$/i.test(value.trim());
      } else if (activeBlock === "visual") {
        if (key === "setting") visual.setting = value;
        else if (key === "camera") visual.camera = value;
        else if (key === "character_action" || key === "action")
          visual.characterAction = value;
        else if (key === "characters_in_scene" || key === "characters")
          visual.charactersInScene = value;
      } else if (activeBlock === "audio") {
        if (key === "spoken_line" || key === "words" || key === "dialogue" || key === "vo" || key === "voiceover" || key === "narration") {
          if (!spokenLine) spokenLine = value;
        } else if (key === "sound_design") audioParts.push(`Sound: ${value}`);
        else if (key === "music") audioParts.push(`Music: ${value}`);
        else if (key === "speaker" && value) audioParts.push(`Speaker: ${value}`);
        else if (key === "delivery" && value) audioParts.push(`Delivery: ${value}`);
      } else {
        if (key === "setting") visual.setting = value;
        else if (key === "camera") visual.camera = value;
        else if (key === "character_action" || key === "action")
          visual.characterAction = value;
        else if (key === "characters_in_scene" || key === "characters")
          visual.charactersInScene = value;
        else if (key === "spoken_line") spokenLine = value;
        else if (key === "sound_design") audioParts.push(`Sound: ${value}`);
        else if (key === "music") audioParts.push(`Music: ${value}`);
      }
    }
    if (characterExpression) visual.characterExpression = characterExpression;
    if (emotionalBeat) audioParts.unshift(`Beat: ${emotionalBeat}`);
    if (sceneNumber === 0) continue;
    scenes.push({
      sceneNumber,
      meta: duration ? `${duration}s` : undefined,
      spokenLine,
      visual,
      audioBeat: audioParts.join(" · "),
      bridgeBeat,
      isProductToShow,
    });
  }
  if (scenes.length === 0) return null;
  return { meta, scenes, preface: "" };
}

// ---------- Markdown-shape helpers ----------

function extractPixarMeta(text: string): {
  meta: ParsedFormat3Script["meta"];
  remaining: string;
} {
  const metaHeadingRx = /^[ \t]*(?:\*\*\s*Meta\s*\*\*|##+\s*Meta)[ \t]*$/im;
  const m = text.match(metaHeadingRx);
  if (!m || m.index === undefined) {
    return { meta: {}, remaining: text };
  }
  const start = m.index + m[0].length;
  const afterMeta = text.slice(start);
  const lines = afterMeta.split("\n");
  const metaLines: string[] = [];
  let sawBullet = false;
  let cutAt = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*$/.test(ln)) {
      if (sawBullet) { cutAt = i; break; }
      continue;
    }
    if (/^\s*-\s+/.test(ln)) {
      sawBullet = true;
      metaLines.push(ln);
      continue;
    }
    if (sawBullet) { cutAt = i; break; }
    metaLines.push(ln);
    cutAt = i + 1;
  }
  if (cutAt === 0 && metaLines.length > 0) cutAt = lines.length;
  const remaining = text.slice(0, m.index) + lines.slice(cutAt).join("\n");
  const meta: ParsedFormat3Script["meta"] = {};
  for (const raw of metaLines) {
    const line = raw.trim().replace(/^[-*]\s+/, "").replace(/^\*\*([^*]+)\*\*/, "$1");
    const kv = line.match(/^([A-Za-z][A-Za-z _-]+?)\s*:\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase().replace(/[\s-]+/g, "_");
    const value = kv[2].trim();
    if (key === "main_character") meta.mainCharacter = value;
    else if (key === "main_pain") meta.mainPain = value;
    else if (key === "chosen_storyline_pattern" || key === "storyline_pattern")
      meta.chosenStorylinePattern = value;
  }
  return { meta, remaining };
}

function extractSceneVisualNotes(body: string): {
  body: string;
  visual: SceneVisualNotes;
} {
  const visualRx = /^[ \t]*(?:\*\*\s*(?:Visual(?:\s+notes?)?)\s*:?\s*\*\*|(?:Visual(?:\s+notes?)?)\s*:)[ \t]*$/im;
  const m = body.match(visualRx);
  if (!m || m.index === undefined) {
    return { body: body.trim(), visual: {} };
  }
  const afterStart = m.index + m[0].length;
  const tail = body.slice(afterStart);
  const stopRx = /^[ \t]*(?:\*\*\s*(?:Audio|Beat|Audio\s*[·\-]\s*Beat|Emotional\s+Beat)\s*:?\s*\*\*|(?:Audio|Beat|Audio\s*[·\-]\s*Beat|Emotional\s+Beat)\s*:)/im;
  const stopM = tail.match(stopRx);
  const blockEnd = stopM && stopM.index !== undefined ? afterStart + stopM.index : body.length;
  const visualBlock = body.slice(afterStart, blockEnd).trim();
  const before = body.slice(0, m.index).trim();
  const after = body.slice(blockEnd);
  const visual: SceneVisualNotes = {};
  for (const raw of visualBlock.split(/\n+/)) {
    const line = raw.trim().replace(/^[-*]\s+/, "").replace(/^\*\*([^*]+)\*\*/, "$1");
    const kv = line.match(/^([A-Za-z][A-Za-z _-]+?)\s*:\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase().replace(/[\s-]+/g, "_");
    const value = kv[2].trim();
    if (key === "setting") visual.setting = value;
    else if (key === "expression" || key === "character_expression")
      visual.characterExpression = value;
    else if (key === "action" || key === "character_action")
      visual.characterAction = value;
    else if (key === "camera" || key === "camera_notes" || key === "camera_note")
      visual.camera = value;
    else if (key === "characters_in_scene" || key === "characters")
      visual.charactersInScene = value;
  }
  return { body: (before + "\n" + after).trim(), visual };
}

function extractSceneAudioBeat(body: string): { body: string; audioBeat: string } {
  const audioRx =
    /^[ \t]*(?:\*\*\s*(?:Audio|Beat|Audio\s*[·\-]\s*Beat|Emotional\s+Beat)\s*:?\s*\*\*|(?:Audio|Beat|Audio\s*[·\-]\s*Beat|Emotional\s+Beat)\s*:)\s*/im;
  const m = body.match(audioRx);
  if (!m || m.index === undefined) {
    return { body: body.trim(), audioBeat: "" };
  }
  const before = body.slice(0, m.index).trim();
  const tail = body.slice(m.index + m[0].length);
  const audioBeat = tail.trim();
  return { body: before, audioBeat };
}

function stripSpokenLabel(body: string): string {
  return body.replace(/^[ \t]*(?:\*\*\s*(?:Spoken|Line|Dialogue|VO)\s*:?\s*\*\*|(?:Spoken|Line|Dialogue|VO)\s*:)[ \t]*\n?/i, "").trim();
}

// ---------- Public API ----------

export function parseFormat3Script(text: string): ParsedFormat3Script | null {
  if (!text || typeof text !== "string") return null;
  let cleaned = text.replace(/^<!--VALIDATION_FAILED:[^>]*-->\s*\n?/, "");
  cleaned = cleaned.replace(/<script_skeleton>[\s\S]*?<\/script_skeleton>/gi, "");
  cleaned = stripCodeFence(cleaned);
  cleaned = cleaned.trim();
  const yamlResult = parseFormat3Yaml(cleaned);
  if (yamlResult && yamlResult.scenes.length >= 1) {
    return yamlResult;
  }
  const { meta, remaining } = extractPixarMeta(cleaned);
  SCENE_HEADING_RX.lastIndex = 0;
  const matches: Array<{ idx: number; len: number; num: number; meta: string }> = [];
  let m: RegExpExecArray | null;
  const localRx = new RegExp(SCENE_HEADING_RX.source, SCENE_HEADING_RX.flags);
  while ((m = localRx.exec(remaining)) !== null) {
    const num = parseInt(m[1] || m[4] || m[6] || "0", 10);
    const sceneMeta = (m[2] || m[3] || m[5] || m[7] || "").trim();
    if (!Number.isFinite(num) || num === 0) continue;
    matches.push({ idx: m.index, len: m[0].length, num, meta: sceneMeta });
  }
  if (matches.length === 0) return null;
  const preface = remaining.slice(0, matches[0].idx).trim();
  const scenes: PixarSceneData[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx + matches[i].len;
    const end = i + 1 < matches.length ? matches[i + 1].idx : remaining.length;
    const rawBody = remaining.slice(start, end).trim();
    const { body: bodyAfterVisual, visual } = extractSceneVisualNotes(rawBody);
    const { body: bodyAfterAudio, audioBeat } = extractSceneAudioBeat(bodyAfterVisual);
    const spokenLine = stripSpokenLabel(bodyAfterAudio);
    scenes.push({
      sceneNumber: matches[i].num,
      meta: matches[i].meta || undefined,
      spokenLine: stripHtmlComments(spokenLine),
      visual: {
        setting: visual.setting ? stripHtmlComments(visual.setting) : undefined,
        characterExpression: visual.characterExpression
          ? stripHtmlComments(visual.characterExpression) : undefined,
        characterAction: visual.characterAction
          ? stripHtmlComments(visual.characterAction) : undefined,
        camera: visual.camera ? stripHtmlComments(visual.camera) : undefined,
        charactersInScene: visual.charactersInScene
          ? stripHtmlComments(visual.charactersInScene) : undefined,
      },
      audioBeat: stripHtmlComments(audioBeat),
    });
  }
  return { meta, scenes, preface: stripHtmlComments(preface) };
}

/**
 * True when `text` looks like a Pixar storyboard (Format 03). Mirrors the
 * bench detectFormat "03" branch: a `Scene N` heading, OR the canonical
 * `meta:` + `storyboard:` YAML shape (possibly fenced).
 */
export function isPixarStoryboard(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const localRx = new RegExp(SCENE_HEADING_RX.source, SCENE_HEADING_RX.flags);
  if (localRx.exec(text)) return true;
  const unwrapped = stripCodeFence(text);
  if (/^[ \t]*meta\s*:/m.test(unwrapped) && /^[ \t]*storyboard\s*:/m.test(unwrapped)) {
    return true;
  }
  return false;
}
