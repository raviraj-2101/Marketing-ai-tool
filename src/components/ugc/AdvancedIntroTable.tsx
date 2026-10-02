// AdvancedIntroTable.tsx
//
// Renders the "Advanced Intro" section of a Format 02a/02b ("unique-intro")
// script as a 2-column table instead of the standard side-pane layout used
// for "No-Product Body" + "Product Reveal".
//
// Why a table here specifically: Advanced Intros are hectic — the avatar
// makes 3 fast symptom-callouts ("This is a clogged lymphatic system",
// repeated 3× with subtle variation in some scripts, or 3 different mirror-
// symptom lines in 02b). Each callout has a TIGHT visual sync — the
// avatar's gesture or close-up matches the line they're saying. A row-per-
// line table makes that line-↔-visual mapping unmissable; the side-pane
// "Visual notes" grid that works for slower-paced sections (Body, Reveal)
// would force the user to mentally pair up which note goes with which line.
//
// Parsing strategy
// ----------------
// As of 2026-05-26 the parser pre-splits the section into:
//   - spokenLines: 3 (or N) callout sentences, paragraph- / sentence-split
//     from the body.
//   - visualParts: labeled visual notes (Scenery / Action / Body parts /
//     Continuity). When an Action note carries "on first/second/third
//     line" markers, it's further split into sub-rows that pair with
//     each spoken callout.
//
// Rendering:
//   - N rows = number of spoken callouts.
//   - Spoken column = the callout sentence.
//   - Visual column = the matching Action sub-row (if present) for that
//     row; first row also shows Scenery + Body parts header notes.
//   - Continuity (and Scenery if not header-rendered) collapses to a
//     footer row spanning both columns.
//
// Legacy callers without the pre-parsed shape still work — the component
// falls back to the old "split body into sentences, mirror visual block
// on every row" path via the `body` + `visual` props.

import type { SectionVisualNotes } from "./ScriptSection";
import type {
  AdvancedIntroCallout,
  AdvancedIntroParsed,
  AdvancedIntroVisualPart,
} from "@/lib/parseScripts";

type AdvancedIntroTableProps = {
  body: string;
  visual: SectionVisualNotes;
  /** Pre-parsed {spokenLines, visualParts} from parseFormat2Script.
   *  When supplied, the renderer pairs each spoken callout with its
   *  matching Action sub-row (per-callout) and collapses Continuity
   *  to a footer row. */
  parsed?: AdvancedIntroParsed;
};

/** LEGACY fallback — split a section body into per-line rows when no
 *  pre-parsed shape was supplied. */
function splitIntoLines(body: string): string[] {
  if (!body) return [];
  const trimmed = body.trim();
  // Strategy A: explicit bullets / numbered list.
  const bulletRows = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^(?:[-*•]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  if (bulletRows.length >= 2 && bulletRows.length <= 6) return bulletRows;
  // Strategy A2: paragraph (blank-line) split — the production shape.
  const paraRows = trimmed
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paraRows.length >= 2 && paraRows.length <= 6) return paraRows;
  // Strategy B: sentence split.
  const sentRows = trimmed
    .replace(/\.{3,}/g, "…")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentRows.length >= 2 && sentRows.length <= 6) return sentRows;
  // Strategy C: em-dash / en-dash split.
  const dashRows = trimmed.split(/\s+[—–]\s+/).map((s) => s.trim()).filter(Boolean);
  if (dashRows.length >= 2 && dashRows.length <= 6) return dashRows;
  return trimmed ? [trimmed] : [];
}

/** LEGACY fallback — build a stacked visual cell from the raw visual
 *  notes (mirrored on every row, like the pre-2026-05-26 shape). */
function buildVisualCellLegacy(visual: SectionVisualNotes): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (visual.scenery) rows.push({ label: "Scenery", value: visual.scenery });
  if (visual.action) rows.push({ label: "Action", value: visual.action });
  if (visual.bodyPart) rows.push({ label: "Body part", value: visual.bodyPart });
  if (visual.continuity) rows.push({ label: "Continuity", value: visual.continuity });
  return rows;
}

export function AdvancedIntroTable({ body, visual, parsed }: AdvancedIntroTableProps) {
  // PREFERRED PATH (Liam directive 2026-05-26): per-callout visual rows
  // when the LLM emitted `### Callout N` sub-blocks. Each row gets its
  // own scenery/body-parts/action/continuity cell (with literal "same as
  // previous" preserved when applicable).
  if (parsed?.callouts && parsed.callouts.length > 0) {
    return <AdvancedIntroTablePerCallout callouts={parsed.callouts} />;
  }
  // Legacy paired path — used when only spokenLines + visualParts are
  // available (older skill.md schema or LLM didn't emit `### Callout`).
  if (parsed && parsed.spokenLines.length > 0) {
    return <AdvancedIntroTablePaired parsed={parsed} />;
  }
  const lines = splitIntoLines(body);
  const visualRows = buildVisualCellLegacy(visual);
  const rows = lines.length > 0 ? lines : [body];
  return (
    <div
      className="overflow-hidden border border-border/60 rounded-md bg-card/30"
      data-testid="advanced-intro-table"
    >
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground/90 px-3 py-2 w-[55%] border-b border-border/60">
              Spoken line
            </th>
            <th className="text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground/90 px-3 py-2 border-b border-border/60">
              Visual
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line, i) => {
            const isLast = i === rows.length - 1;
            return (
              <tr
                key={i}
                className={isLast ? "" : "border-b border-border/40"}
                data-testid={`advanced-intro-table-row-${i}`}
              >
                <td className="px-3 py-2.5 align-top text-foreground/95 leading-relaxed">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tabular-nums px-1.5 py-0.5 mr-2 align-middle">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </td>
                <td className="px-3 py-2.5 align-top bg-card/40">
                  {visualRows.length === 0 ? (
                    <span className="text-[11.5px] italic text-muted-foreground/60">
                      No visual notes supplied.
                    </span>
                  ) : (
                    <dl className="space-y-1.5 text-[12px] leading-snug">
                      {visualRows.map((r) => (
                        <div key={r.label}>
                          <dt className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80">
                            {r.label}
                          </dt>
                          <dd className="text-foreground/90 mt-0.5 whitespace-pre-wrap">
                            {r.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** New paired-rendering path — used when `parsed` is supplied. Pairs each
 *  spoken callout with its matching Action sub-row, shows Scenery + Body
 *  parts in the first row header, and collapses Continuity to a footer. */
function AdvancedIntroTablePaired({ parsed }: { parsed: AdvancedIntroParsed }) {
  const { spokenLines, visualParts } = parsed;
  // Identify the labeled parts we want to render in special slots.
  const action = visualParts.find((p) => /^action$/i.test(p.label));
  const scenery = visualParts.find((p) => /^scenery$/i.test(p.label));
  const bodyParts = visualParts.find((p) => /^body\s*parts?(?:\s+shown)?$/i.test(p.label));
  const continuity = visualParts.find((p) => /^continuity$/i.test(p.label));
  // Other labels we didn't recognize — render them in the first row's
  // visual cell so nothing is lost.
  const otherParts: AdvancedIntroVisualPart[] = visualParts.filter(
    (p) =>
      p !== action && p !== scenery && p !== bodyParts && p !== continuity,
  );
  // Per-callout action sub-rows when available.
  const actionSubRows = action?.subRows;
  return (
    <div
      className="overflow-hidden border border-border/60 rounded-md bg-card/30"
      data-testid="advanced-intro-table"
    >
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground/90 px-3 py-2 w-[55%] border-b border-border/60">
              Spoken line
            </th>
            <th className="text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground/90 px-3 py-2 border-b border-border/60">
              Visual
            </th>
          </tr>
        </thead>
        <tbody>
          {spokenLines.map((line, i) => {
            // Row-by-row pairing:
            //   - If Action has sub-rows AND the count aligns, show the
            //     i-th sub-row.
            //   - Else, show the FULL Action note on the first row only
            //     (mirroring would echo identical text across all rows,
            //     which is just visual noise).
            const actionForRow =
              actionSubRows && actionSubRows[i]
                ? actionSubRows[i]
                : i === 0 && action
                  ? action.content
                  : "";
            const isFirst = i === 0;
            const isLast = i === spokenLines.length - 1;
            return (
              <tr
                key={i}
                className={isLast ? "" : "border-b border-border/40"}
                data-testid={`advanced-intro-table-row-${i}`}
              >
                <td className="px-3 py-2.5 align-top text-foreground/95 leading-relaxed">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tabular-nums px-1.5 py-0.5 mr-2 align-middle">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </td>
                <td className="px-3 py-2.5 align-top bg-card/40">
                  <dl className="space-y-1.5 text-[12px] leading-snug">
                    {/* Scenery shows only on the first row — it's the
                        held-throughout backdrop, not a per-callout cue. */}
                    {isFirst && scenery && (
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80">
                          Scenery
                        </dt>
                        <dd className="text-foreground/90 mt-0.5 whitespace-pre-wrap">
                          {scenery.content}
                        </dd>
                      </div>
                    )}
                    {/* Body parts shown — header-only, like Scenery. */}
                    {isFirst && bodyParts && (
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80">
                          Body parts shown
                        </dt>
                        <dd className="text-foreground/90 mt-0.5 whitespace-pre-wrap">
                          {bodyParts.content}
                        </dd>
                      </div>
                    )}
                    {/* Action — per-row when sub-rows exist; first-row-only
                        otherwise. */}
                    {actionForRow && (
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80">
                          Action
                        </dt>
                        <dd className="text-foreground/90 mt-0.5 whitespace-pre-wrap">
                          {actionForRow}
                        </dd>
                      </div>
                    )}
                    {/* Any unrecognized labels land on the first row. */}
                    {isFirst &&
                      otherParts.map((p) => (
                        <div key={p.label}>
                          <dt className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80">
                            {p.label}
                          </dt>
                          <dd className="text-foreground/90 mt-0.5 whitespace-pre-wrap">
                            {p.content}
                          </dd>
                        </div>
                      ))}
                    {/* When NO visual cue applies to a non-first row (no
                        sub-rows, action already rendered above), show a
                        soft dash so the cell isn't visually empty. */}
                    {!isFirst && !actionForRow && !continuity && (
                      <span className="text-[11.5px] italic text-muted-foreground/50">
                        —
                      </span>
                    )}
                  </dl>
                </td>
              </tr>
            );
          })}
          {/* Continuity footer row — spans both columns so the held-
              throughout note reads as a directorial reminder, not a per-
              callout cue. */}
          {continuity && (
            <tr
              className="border-t border-border/40 bg-muted/20"
              data-testid="advanced-intro-table-continuity"
            >
              <td colSpan={2} className="px-3 py-2 align-top">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 shrink-0">
                    Continuity
                  </span>
                  <span className="text-[12px] text-foreground/85 leading-snug whitespace-pre-wrap">
                    {continuity.content}
                  </span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** NEW (Liam directive 2026-05-26) — per-callout rendering. Each row shows
 *  ALL FOUR visual fields (Scenery / Body parts shown / Action / Continuity)
 *  for that specific callout. When the LLM wrote the literal string
 *  "same as previous", we render it dimmed/italicized so the editor knows
 *  the field was intentionally repeated, not omitted. */
function AdvancedIntroTablePerCallout({ callouts }: { callouts: AdvancedIntroCallout[] }) {
  const isSameAsPrev = (v: string): boolean =>
    /^\s*same\s+as\s+(?:previous|prev|above)\s*\.?\s*$/i.test(v || "");
  const VisualField = ({ label, value }: { label: string; value: string }) => {
    if (!value) return null;
    const same = isSameAsPrev(value);
    return (
      <div>
        <dt className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80">
          {label}
        </dt>
        <dd
          className={
            same
              ? "text-muted-foreground/70 italic mt-0.5 whitespace-pre-wrap"
              : "text-foreground/90 mt-0.5 whitespace-pre-wrap"
          }
        >
          {same ? "↑ same as previous" : value}
        </dd>
      </div>
    );
  };
  return (
    <div
      className="overflow-hidden border border-border/60 rounded-md bg-card/30"
      data-testid="advanced-intro-table"
    >
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground/90 px-3 py-2 w-[40%] border-b border-border/60">
              Spoken line
            </th>
            <th className="text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground/90 px-3 py-2 border-b border-border/60">
              Visual
            </th>
          </tr>
        </thead>
        <tbody>
          {callouts.map((c, i) => {
            const isLast = i === callouts.length - 1;
            return (
              <tr
                key={i}
                className={isLast ? "" : "border-b border-border/40"}
                data-testid={`advanced-intro-table-row-${i}`}
              >
                <td className="px-3 py-2.5 align-top text-foreground/95 leading-relaxed">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tabular-nums px-1.5 py-0.5 mr-2 align-middle">
                    {i + 1}
                  </span>
                  <span>{c.spoken || "(spoken line missing)"}</span>
                </td>
                <td className="px-3 py-2.5 align-top bg-card/40">
                  <dl className="space-y-1.5 text-[12px] leading-snug">
                    <VisualField label="Scenery" value={c.scenery} />
                    <VisualField label="Scene" value={c.scene} />
                    {/* Legacy fields (pre-2026-05-26 round 3) — only render
                        when present AND no new `scene` field, so older saved
                        scripts still surface their detail. */}
                    {!c.scene && c.bodyParts && (
                      <VisualField label="Body parts shown" value={c.bodyParts} />
                    )}
                    {!c.scene && c.action && (
                      <VisualField label="Action" value={c.action} />
                    )}
                    <VisualField label="Continuity" value={c.continuity} />
                  </dl>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
