// ScriptSection.tsx
//
// Renders one of the three sections of a Format 02a/02b ("unique-intro")
// script: Advanced Intro / No-Product Body / Product Reveal. Two-column
// layout on ≥1024px (text left, visual-explanation pane right); stacks
// vertically below 1024px.
//
// The visual-explanation pane is a labeled field grid with four slots:
// scenery / action / body-part / continuity. Any subset can be empty —
// missing fields are simply omitted so a partial breakdown still reads
// cleanly. Continuity-locked staging is highlighted (per skill 02 law:
// authority pose + background must persist intro → body → reveal).

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { RotateCcw } from "lucide-react";
import { AdvancedIntroTable } from "./AdvancedIntroTable";
import type { AdvancedIntroParsed } from "@/lib/parseScripts";

export type SectionVisualNotes = {
  scenery?: string;
  action?: string;
  /** e.g. "torso", "hands holding bottle", "face — chin tilt down". */
  bodyPart?: string;
  /** e.g. "same authority pose as intro; bottle introduced at the right hip". */
  continuity?: string;
};

export type ScriptSectionData = {
  /** "Advanced Intro" | "No-Product Body" | "Product Reveal" — model-supplied. */
  heading: string;
  /** Optional 1-line label under the heading (e.g. word count, on-screen time). */
  meta?: string;
  /** The markdown body of this section's spoken script. */
  body: string;
  visual: SectionVisualNotes;
  /** Advanced-Intro-only: pre-parsed {spokenLines, visualParts} pairing
   *  so the AdvancedIntroTable can render row-by-row alignment of each
   *  spoken callout with its matching action sub-cue. Undefined for the
   *  other Format-02 sections (No-Product Body / Product Reveal). */
  advancedIntroParsed?: AdvancedIntroParsed;
};

type ScriptSectionProps = {
  section: ScriptSectionData;
  /** Index in the parent's 3-section list (0-based). Used for section
   *  numbering badge on the left column. */
  index: number;
  /** When provided AND the section is the Advanced Intro, renders a
   *  "Regenerate intro" button in the section header (Liam directive
   *  2026-05-27 round 9 — the intro is the riskiest section and
   *  sometimes lands wrong even when body+reveal are good). */
  onRegenerateIntro?: () => void;
};

export function ScriptSection({ section, index, onRegenerateIntro }: ScriptSectionProps) {
  const { heading, meta, body, visual } = section;
  const visualRows: Array<{ label: string; value: string }> = [];
  if (visual.scenery) visualRows.push({ label: "Scenery", value: visual.scenery });
  if (visual.action) visualRows.push({ label: "Action", value: visual.action });
  if (visual.bodyPart) visualRows.push({ label: "Body part", value: visual.bodyPart });
  if (visual.continuity) visualRows.push({ label: "Continuity", value: visual.continuity });

  // Advanced Intro renders as a TABLE (per Liam's UX directive — the intro
  // is the hectic line-by-line block with 3 symptom-callouts, and a 2-col
  // table makes the line-↔-visual sync obvious). All other sections keep
  // the existing side-pane layout.
  const isAdvancedIntro = /^advanced\s+intro$/i.test(heading.trim());

  if (isAdvancedIntro) {
    return (
      <article
        className="rounded-lg border border-border bg-background overflow-hidden"
        data-testid={`script-section-${index}`}
      >
        <header className="border-b border-border/60 bg-muted/30 px-4 py-2.5 flex items-baseline gap-2 flex-wrap">
          <span className="inline-flex items-center justify-center rounded-md bg-primary/15 text-primary text-[10px] font-bold uppercase leading-none px-2 py-1 min-w-[1.5rem] tabular-nums">
            P{index + 1}
          </span>
          <h3 className="text-sm font-semibold leading-snug">{heading}</h3>
          {meta && (
            <span className="text-[11px] text-muted-foreground/80 tabular-nums">
              {meta}
            </span>
          )}
          {onRegenerateIntro && (
            <button
              type="button"
              onClick={onRegenerateIntro}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-card-border bg-background hover:bg-muted px-2 py-1 text-[11px] font-medium text-foreground transition-colors"
              data-testid={`script-section-${index}-regenerate-intro`}
              title="Regenerate just this Advanced Intro — keeps the body + reveal exactly as they are"
            >
              <RotateCcw className="size-3" />
              <span>Regenerate intro</span>
            </button>
          )}
        </header>
        <div className="p-3" data-testid={`script-section-${index}-table`}>
          <AdvancedIntroTable
            body={body}
            visual={visual}
            parsed={section.advancedIntroParsed}
          />
        </div>
      </article>
    );
  }

  return (
    <article
      className="rounded-lg border border-border bg-background overflow-hidden"
      data-testid={`script-section-${index}`}
    >
      {/* Section header — full width across both columns */}
      <header className="border-b border-border/60 bg-muted/30 px-4 py-2.5 flex items-baseline gap-2">
        <span className="inline-flex items-center justify-center rounded-md bg-primary/15 text-primary text-[10px] font-bold uppercase leading-none px-2 py-1 min-w-[1.5rem] tabular-nums">
          P{index + 1}
        </span>
        <h3 className="text-sm font-semibold leading-snug">{heading}</h3>
        {meta && (
          <span className="ml-auto text-[11px] text-muted-foreground/80 tabular-nums">
            {meta}
          </span>
        )}
      </header>

      {/* Two-column body: text left, visual notes right; stacks <1024px */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(180px,260px)] divide-y lg:divide-y-0 lg:divide-x divide-border/60">
        {/* LEFT: spoken script */}
        <div
          className="p-4 prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:font-semibold"
          data-testid={`script-section-${index}-text`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>

        {/* RIGHT: visual-explanation pane */}
        <aside
          className="p-4 bg-card/30"
          data-testid={`script-section-${index}-visual`}
        >
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">
            Visual notes
          </div>
          {visualRows.length === 0 ? (
            <p className="text-[11.5px] italic text-muted-foreground/60">
              No visual notes supplied for this section.
            </p>
          ) : (
            <dl className="space-y-2 text-[12px] leading-snug">
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
        </aside>
      </div>
    </article>
  );
}
