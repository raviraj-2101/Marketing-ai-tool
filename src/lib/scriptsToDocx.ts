// scriptsToDocx.ts
//
// Build a Word (.docx) export of an assistant message that contains one or
// more UGC scripts, preserving structure (concept name, P1/P2, word counts,
// per-angle grouping, optional preface/heads-up note).
//
// Powered by the `docx` package (https://docx.js.org). Output is a Blob the
// browser can save with file-saver.

import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  PageOrientation,
  LevelFormat,
} from "docx";
import { saveAs } from "file-saver";
import type { ParsedDoc, ParsedScript } from "./parseScripts";
import { buildDocSummary } from "./parseScripts";
import type { ParsedFormat3Script } from "./parsePixar";
import type { ParsedAnimatedCharsScript } from "./parseAnimatedChars";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a multi-paragraph string into Paragraph[] for docx. */
function paragraphsFromText(text: string, opts: { italic?: boolean } = {}): Paragraph[] {
  if (!text) return [];
  const blocks = text.split(/\n{2,}/).map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
  return blocks.map(
    (b) =>
      new Paragraph({
        spacing: { after: 160, line: 312 }, // ~1.3 line spacing
        children: [new TextRun({ text: b, italics: !!opts.italic })],
      }),
  );
}

/** A bold inline section label like **P1** rendered as a small heading. */
function sectionLabel(label: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 100 },
    children: [
      new TextRun({
        text: label,
        bold: true,
        size: 22, // 11pt
      }),
    ],
  });
}

/** Build the H2 for a single script, e.g. "Script 2 — Bloating". */
function scriptHeading(num: number, total: number, script: ParsedScript): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 80 },
    children: [
      new TextRun({
        text: `Script ${num} of ${total} — ${script.angleLabel}${script.style ? ` — Style: ${script.style}` : ""}`,
        bold: true,
      }),
    ],
  });
}

/** Build the concept-line paragraph below the H2, e.g. the description. */
function conceptLine(script: ParsedScript): Paragraph {
  const baseText = script.description || script.concept || script.angleLabel;
  const prefix =
    script.angleCode ||
    (script.angleLabel && script.angleLabel !== "Other" ? script.angleLabel : "");
  const conceptText = prefix
    ? `Concept: ${prefix} — ${baseText}`
    : `Concept: ${baseText}`;
  return new Paragraph({
    spacing: { after: 160 },
    children: [
      new TextRun({
        text: conceptText,
        italics: true,
        color: "555555",
      }),
    ],
  });
}

/** Word count helper: split on whitespace, drop empties. */
function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Build the "Word count: 142" footer line for a script. */
function wordCountLine(script: ParsedScript): Paragraph {
  const count =
    script.wordCount && script.wordCount > 0
      ? script.wordCount
      : countWords(script.body || "");
  return new Paragraph({
    spacing: { before: 120, after: 200 },
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text: `Word count: ${count}`,
        italics: true,
        color: "888888",
        size: 18, // 9pt
      }),
    ],
  });
}

/**
 * Build the TSL-style intro block ("Brief") under the title.
 */
function introBlock(doc: ParsedDoc, productLabel: string | undefined): Paragraph[] {
  if (doc.scripts.length === 0) return [];
  const total = doc.scripts.length;
  const rows: Array<[string, string]> = [];
  if (productLabel) rows.push(["Brand", productLabel]);
  rows.push(["Format", doc.meta.format]);
  if (doc.meta.angleSummary) rows.push(["Angle", doc.meta.angleSummary]);
  if (doc.meta.archetypes.length > 0) {
    rows.push(["Archetype", doc.meta.archetypes.join(", ")]);
  }
  rows.push(["Scripts", `${total} · ${doc.meta.beats}`]);
  if (doc.meta.wordCountRange) rows.push(["Word count", doc.meta.wordCountRange]);
  if (doc.meta.awarenessLevel) rows.push(["Awareness level", doc.meta.awarenessLevel]);

  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      children: [new TextRun({ text: "Brief", bold: true })],
    }),
  );
  for (const [label, value] of rows) {
    out.push(
      new Paragraph({
        spacing: { after: 60, line: 280 },
        children: [
          new TextRun({ text: `${label}: `, bold: true }),
          new TextRun({ text: value }),
        ],
      }),
    );
  }
  out.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: "" })],
    }),
  );
  return out;
}

/** Build the title block at the top of the document. */
function titleBlock(doc: ParsedDoc, productLabel: string | undefined): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: productLabel ? `UGC Scripts — ${productLabel}` : "UGC Scripts",
          bold: true,
        }),
      ],
    }),
  );
  const summary = buildDocSummary(doc);
  if (summary) {
    out.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: summary,
            color: "666666",
          }),
        ],
      }),
    );
  }
  const today = new Date();
  const stamp = today.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  out.push(
    new Paragraph({
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: `Generated ${stamp}`,
          italics: true,
          color: "888888",
          size: 18,
        }),
      ],
    }),
  );
  return out;
}

/** Block of paragraphs for a single script. */
function scriptBlock(script: ParsedScript, num: number, total: number): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(scriptHeading(num, total, script));
  out.push(conceptLine(script));
  if (script.p1) {
    out.push(sectionLabel("P1"));
    out.push(...paragraphsFromText(script.p1));
  }
  if (script.p2) {
    out.push(sectionLabel("P2"));
    out.push(...paragraphsFromText(script.p2));
  }
  out.push(wordCountLine(script));
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DocxBuildOptions = {
  /** Display label for the product, e.g. "Cleantra Lymphatic Drainage Drops". */
  productLabel?: string;
  /** Optional filename hint (without extension). */
  fileNameHint?: string;
};

/** Build the docx Blob from a parsed doc. */
export async function buildScriptsDocxBlob(
  doc: ParsedDoc,
  opts: DocxBuildOptions = {},
): Promise<Blob> {
  const children: Paragraph[] = [];

  children.push(...titleBlock(doc, opts.productLabel));
  children.push(...introBlock(doc, opts.productLabel));

  if (doc.preface && doc.preface.trim()) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { after: 120 },
        children: [new TextRun({ text: "Note", bold: true })],
      }),
      ...paragraphsFromText(doc.preface, { italic: true }),
    );
  }

  const total = doc.scripts.length;
  if (total > 0) {
    for (const group of doc.byAngle) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 480, after: 120 },
          children: [
            new TextRun({
              text: group.angleLabel,
              bold: true,
            }),
          ],
        }),
      );
      for (const script of group.scripts) {
        const num = script.index + 1;
        children.push(...scriptBlock(script, num, total));
      }
    }
  }

  const docFile = new Document({
    creator: "Acentecom UGC Script Bot",
    title: opts.productLabel ? `UGC Scripts — ${opts.productLabel}` : "UGC Scripts",
    description: buildDocSummary(doc) || "UGC scripts export",
    numbering: {
      config: [
        {
          reference: "default",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 }, // 11pt body
        },
      },
    },
  });

  return await Packer.toBlob(docFile);
}

/** Slug a string into a safe filename component. */
function slug(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Build a sensible default filename like "ugc-scripts-cleantra-3wl-1bl-2026-05-01.docx". */
export function defaultDocxFileName(doc: ParsedDoc, productLabel?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const productPart = productLabel ? slug(productLabel) : "";
  const counts = doc.byAngle
    .map((g) => `${g.count}${slug(g.angleLabel).split("-")[0].slice(0, 3)}`)
    .join("-");
  const parts = ["ugc-scripts", productPart, counts, date].filter(Boolean);
  return `${parts.join("_")}.docx`;
}

/** One-shot helper: build the docx and trigger a download in the browser. */
export async function downloadScriptsDocx(
  doc: ParsedDoc,
  opts: DocxBuildOptions = {},
): Promise<void> {
  const blob = await buildScriptsDocxBlob(doc, opts);
  const filename =
    opts.fileNameHint && opts.fileNameHint.endsWith(".docx")
      ? opts.fileNameHint
      : `${opts.fileNameHint || defaultDocxFileName(doc, opts.productLabel)}`;
  saveAs(blob, filename);
}

// ---------------------------------------------------------------------------
// Format 03 — Pixar storyboard export
// ---------------------------------------------------------------------------

function pixarSceneBlock(scene: ParsedFormat3Script["scenes"][number]): Paragraph[] {
  const out: Paragraph[] = [];
  out.push(sectionLabel(`Scene ${scene.sceneNumber}${scene.meta ? ` · ${scene.meta}` : ""}`));
  const bridge = scene.bridgeBeat?.trim();
  if (bridge && !/opening\s+scene|no\s+prior|n\/?a/i.test(bridge)) {
    out.push(...paragraphsFromText(`Bridge from prior: ${bridge}`, { italic: true }));
  }
  if (scene.spokenLine && scene.spokenLine.trim()) {
    out.push(...paragraphsFromText(scene.spokenLine));
  }
  const visualLines: string[] = [];
  if (scene.visual.charactersInScene) visualLines.push(`Characters: ${scene.visual.charactersInScene}`);
  if (scene.visual.setting) visualLines.push(`Setting: ${scene.visual.setting}`);
  if (scene.visual.characterExpression) visualLines.push(`Expression: ${scene.visual.characterExpression}`);
  if (scene.visual.characterAction) visualLines.push(`Action: ${scene.visual.characterAction}`);
  if (scene.visual.camera) visualLines.push(`Camera: ${scene.visual.camera}`);
  visualLines.push(`Product showcase: ${scene.isProductToShow ? "Yes" : "No"}`);
  if (visualLines.length) {
    out.push(...paragraphsFromText(`Visual notes —\n\n${visualLines.join("\n\n")}`, { italic: true }));
  }
  if (scene.audioBeat && scene.audioBeat.trim()) {
    out.push(...paragraphsFromText(`Audio · emotional beat: ${scene.audioBeat}`, { italic: true }));
  }
  return out;
}

export async function buildPixarDocxBlob(
  parsed: ParsedFormat3Script,
  opts: DocxBuildOptions = {},
): Promise<Blob> {
  const children: Paragraph[] = [];
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: opts.productLabel
            ? `Pixar-Style Storyboard — ${opts.productLabel}`
            : "Pixar-Style Storyboard",
          bold: true,
        }),
      ],
    }),
  );
  const metaLines: string[] = [];
  if (parsed.meta.characters && parsed.meta.characters.length > 0) {
    for (const c of parsed.meta.characters) metaLines.push(`${c.label}: ${c.value}`);
  } else if (parsed.meta.mainCharacter) {
    metaLines.push(`Main character: ${parsed.meta.mainCharacter}`);
  }
  if (parsed.meta.mainPain) metaLines.push(`Main pain: ${parsed.meta.mainPain}`);
  if (parsed.meta.chosenStorylinePattern) metaLines.push(`Storyline pattern: ${parsed.meta.chosenStorylinePattern}`);
  metaLines.push(`Scenes: ${parsed.scenes.length}`);
  children.push(...paragraphsFromText(metaLines.join("\n\n"), { italic: true }));

  if (parsed.preface && parsed.preface.trim()) {
    children.push(...paragraphsFromText(parsed.preface, { italic: true }));
  }
  for (const scene of parsed.scenes) {
    children.push(...pixarSceneBlock(scene));
  }

  const docFile = new Document({
    creator: "Acentecom UGC Script Bot",
    title: opts.productLabel ? `Pixar Storyboard — ${opts.productLabel}` : "Pixar Storyboard",
    description: "Pixar-style video-ad storyboard export",
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
  });
  return await Packer.toBlob(docFile);
}

export async function downloadPixarDocx(
  parsed: ParsedFormat3Script,
  opts: DocxBuildOptions = {},
): Promise<void> {
  const blob = await buildPixarDocxBlob(parsed, opts);
  const date = new Date().toISOString().slice(0, 10);
  const productPart = opts.productLabel ? slug(opts.productLabel) : "";
  const filename =
    opts.fileNameHint && opts.fileNameHint.endsWith(".docx")
      ? opts.fileNameHint
      : `${["pixar-storyboard", productPart, date].filter(Boolean).join("_")}.docx`;
  saveAs(blob, filename);
}

// ---------------------------------------------------------------------------
// Format 04 — Animated Characters storyboard export
// ---------------------------------------------------------------------------

function animatedCharacterBlock(
  ch: ParsedAnimatedCharsScript["characters"][number],
  index: number,
): Paragraph[] {
  const out: Paragraph[] = [];
  const dur = ch.durationS ? ` · ${ch.durationS}s` : "";
  const roleLabel = ch.role ? ` · ${ch.role}` : "";
  out.push(sectionLabel(`Character ${ch.characterId ?? index + 1}${roleLabel}${dur}`));
  if (ch.characterConcept && ch.characterConcept.trim()) {
    out.push(...paragraphsFromText(`Character: ${ch.characterConcept}`, { italic: true }));
  }
  if (ch.firstFramePrompt && ch.firstFramePrompt.trim()) {
    out.push(...paragraphsFromText(`First frame (image): ${ch.firstFramePrompt}`, { italic: true }));
  }
  if (ch.visual && ch.visual.trim()) {
    out.push(...paragraphsFromText(`Motion / video: ${ch.visual}`, { italic: true }));
  }
  if (ch.spokenLine && ch.spokenLine.trim()) {
    out.push(...paragraphsFromText(ch.spokenLine));
  }
  if (ch.voiceTone && ch.voiceTone.trim()) {
    out.push(...paragraphsFromText(`Voice / tone: ${ch.voiceTone}`, { italic: true }));
  }
  return out;
}

export async function buildAnimatedDocxBlob(
  parsed: ParsedAnimatedCharsScript,
  opts: DocxBuildOptions = {},
): Promise<Blob> {
  const children: Paragraph[] = [];
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: opts.productLabel
            ? `Animated Characters Ad — ${opts.productLabel}`
            : "Animated Characters Ad",
          bold: true,
        }),
      ],
    }),
  );
  const metaLines: string[] = [];
  if (parsed.meta.chosenFramework) metaLines.push(`Framework: ${parsed.meta.chosenFramework}`);
  if (parsed.meta.mainPain) metaLines.push(`Main pain: ${parsed.meta.mainPain}`);
  metaLines.push(`Characters: ${parsed.characters.length}`);
  if (parsed.meta.totalSpokenWords) metaLines.push(`Total spoken words: ${parsed.meta.totalSpokenWords}`);
  if (parsed.meta.estimatedSeconds) metaLines.push(`Estimated seconds: ${parsed.meta.estimatedSeconds}`);
  children.push(...paragraphsFromText(metaLines.join("\n\n"), { italic: true }));
  children.push(...paragraphsFromText(`Background music: ${parsed.musicDirection}`, { italic: true }));

  parsed.characters.forEach((ch, i) => {
    children.push(...animatedCharacterBlock(ch, i));
  });

  const docFile = new Document({
    creator: "Acentecom UGC Script Bot",
    title: opts.productLabel ? `Animated Characters — ${opts.productLabel}` : "Animated Characters",
    description: "Animated-characters video-ad storyboard export",
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
  });
  return await Packer.toBlob(docFile);
}

export async function downloadAnimatedDocx(
  parsed: ParsedAnimatedCharsScript,
  opts: DocxBuildOptions = {},
): Promise<void> {
  const blob = await buildAnimatedDocxBlob(parsed, opts);
  const date = new Date().toISOString().slice(0, 10);
  const productPart = opts.productLabel ? slug(opts.productLabel) : "";
  const filename =
    opts.fileNameHint && opts.fileNameHint.endsWith(".docx")
      ? opts.fileNameHint
      : `${["animated-characters-ad", productPart, date].filter(Boolean).join("_")}.docx`;
  saveAs(blob, filename);
}
