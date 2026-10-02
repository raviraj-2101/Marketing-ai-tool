// VerificationTraceCard.tsx
//
// The human-readable QA trace: ✓/✗ rows per gate, a prominent Authority NN/100
// badge, and the 6 authority subscores.

import { Check, CheckCircle2, XCircle } from "lucide-react";
import type { VerificationTrace } from "@/lib/tslResult";

// ---------------------------------------------------------------------------
// Authority badge color band
// ---------------------------------------------------------------------------

function authorityBand(score: number): { ring: string; text: string; bg: string; label: string } {
  if (score >= 90)
    return { ring: "border-emerald-500/40", text: "text-emerald-700", bg: "bg-emerald-500/10", label: "Excellent" };
  if (score >= 80)
    return { ring: "border-emerald-500/40", text: "text-emerald-700", bg: "bg-emerald-500/10", label: "Winner" };
  if (score >= 70)
    return { ring: "border-amber-500/40", text: "text-amber-700", bg: "bg-amber-500/10", label: "Close" };
  return { ring: "border-destructive/40", text: "text-destructive", bg: "bg-destructive/10", label: "Below bar" };
}

function prettySubscore(key: string): string {
  // Subscore keys arrive as snake_case or kebab-case from the LLM-judge.
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// VerificationTraceCard
// ---------------------------------------------------------------------------

export function VerificationTraceCard({
  trace,
}: {
  trace: VerificationTrace;
}) {
  const score = trace.authority?.score ?? 0;
  const band = authorityBand(score);
  const subscores = Object.entries(trace.authority?.subscores ?? {});

  return (
    <section
      className="rounded-xl border border-card-border bg-card overflow-hidden"
      data-testid="verification-trace"
    >
      {/* Header — Authority badge + attempts */}
      <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Verification
          </span>
          {typeof trace.attempts === "number" && trace.attempts > 0 && (
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">
              · {trace.attempts} {trace.attempts === 1 ? "pass" : "passes"}
            </span>
          )}
        </div>
        <div
          className={`inline-flex items-baseline gap-1.5 rounded-lg border ${band.ring} ${band.bg} px-2.5 py-1`}
          data-testid="authority-badge"
          title={`Authority score: ${score}/100 (${band.label})`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Authority
          </span>
          <span className={`text-lg font-bold tabular-nums leading-none ${band.text}`}>
            {score}
          </span>
          <span className="text-[11px] text-muted-foreground/70">/100</span>
        </div>
      </header>

      {/* Gates checklist */}
      <ul className="divide-y divide-border/50" data-testid="gate-list">
        {trace.gates.map((g) => (
          <li
            key={g.id}
            className="flex items-start gap-2.5 px-4 py-2.5"
            data-testid={`gate-${g.id}`}
          >
            {g.pass ? (
              <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-emerald-600" aria-label="pass" />
            ) : (
              <XCircle className="size-4 mt-0.5 shrink-0 text-destructive" aria-label="fail" />
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-foreground">{g.label}</span>
                <span className="text-[10px] font-mono text-muted-foreground/60">{g.id}</span>
              </div>
              {g.detail && (
                <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
                  {g.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Authority subscores */}
      {subscores.length > 0 && (
        <div className="border-t border-border/60 bg-muted/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">
            Authority breakdown
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5" data-testid="subscores">
            {subscores.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="text-[12px] text-muted-foreground truncate">{prettySubscore(k)}</dt>
                <dd className="text-[12px] font-semibold tabular-nums text-foreground shrink-0">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Sections presence (optional, compact) */}
      {trace.sections && trace.sections.length > 0 && (
        <div className="border-t border-border/60 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">
            Sections
          </div>
          <ul className="flex flex-wrap gap-1.5" data-testid="sections-list">
            {trace.sections.map((s, i) => (
              <li
                key={`${s.name}-${i}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                  s.present
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                {s.present ? (
                  <Check className="size-3" />
                ) : (
                  <XCircle className="size-3" />
                )}
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
