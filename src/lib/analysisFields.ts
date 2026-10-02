// analysisFields.ts — turns the structured script analysis into a rendered-ready row list.

import type { AnalysisShape } from "./analysisProse";

export interface AnalysisRow {
  label: string;
  value: string;
  fullValue?: string;
  emphasis?: "normal" | "muted";
}

const EM_DASH = "—";

function truncate(s: string, max: number): { value: string; full?: string } {
  if (s.length <= max) return { value: s };
  return { value: s.slice(0, max).trim() + "…", full: s };
}

function narratorValue(a: AnalysisShape): string {
  const chars = a.characters || [];
  const narrator = chars.find((c) => c.role_in_script === "narrator");
  if (!narrator) return EM_DASH;
  const ageBit = narrator.age ? ` · ${narrator.age}` : "";
  return `${narrator.name || "Unnamed narrator"}${ageBit}`;
}

function supportingCastValue(a: AnalysisShape): string {
  const chars = a.characters || [];
  const others = chars.filter((c) => c.role_in_script !== "narrator");
  if (others.length === 0) return EM_DASH;
  return others
    .map((c) => `${c.name || "an unnamed person"}${c.role_in_script ? ` (${c.role_in_script})` : ""}`)
    .join(", ");
}

function openerValue(a: AnalysisShape): { value: string; full?: string } {
  const o = a.opener_artifact;
  if (!o || !o.object) return { value: EM_DASH };
  const loc = o.location ? ` (in ${o.location})` : "";
  return truncate(`${o.object}${loc}`, 80);
}

function mechanismValue(a: AnalysisShape): { value: string; full?: string } {
  const m = a.mechanism;
  if (!m || !m.root_cause) return { value: EM_DASH };
  return truncate(m.root_cause, 110);
}

function howItWorksValue(a: AnalysisShape): { value: string; full?: string } {
  const m = a.mechanism;
  if (!m || !m.how_product_works) return { value: EM_DASH };
  return truncate(m.how_product_works, 110);
}

function authorityValue(a: AnalysisShape): string {
  const w = a.authority_witness;
  if (!w || !w.role) return EM_DASH;
  return w.role;
}

function proofCountValue(a: AnalysisShape): string {
  const n = (a.proof_moments || []).length;
  if (n === 0) return EM_DASH;
  return `${n} moment${n === 1 ? "" : "s"}`;
}

function descentCountValue(a: AnalysisShape): string {
  const xs = (a.descent_artifacts || []).map((d) => d.object).filter(Boolean);
  if (xs.length === 0) return EM_DASH;
  return xs.join(", ");
}

function formatValue(a: AnalysisShape): string {
  const f = a.product_format?.form;
  if (!f) return EM_DASH;
  return f;
}

function toneValue(a: AnalysisShape): string {
  const t = a.tonal_register;
  if (!t) return EM_DASH;
  if (t === "extreme_emotional") return "Extreme emotional";
  if (t === "measured_authority") return "Measured authority";
  if (t === "hybrid") return "Hybrid";
  return t;
}

export function analysisRows(a: AnalysisShape | undefined | null): AnalysisRow[] {
  if (!a) return [];
  const rows: AnalysisRow[] = [];

  const narrator = narratorValue(a);
  rows.push({ label: "Narrator", value: narrator, emphasis: narrator === EM_DASH ? "muted" : "normal" });

  const supporting = supportingCastValue(a);
  rows.push({ label: "Supporting cast", value: supporting, emphasis: supporting === EM_DASH ? "muted" : "normal" });

  const opener = openerValue(a);
  rows.push({ label: "Opener artifact", value: opener.value, fullValue: opener.full, emphasis: opener.value === EM_DASH ? "muted" : "normal" });

  const mech = mechanismValue(a);
  rows.push({ label: "Mechanism (root cause)", value: mech.value, fullValue: mech.full, emphasis: mech.value === EM_DASH ? "muted" : "normal" });

  const how = howItWorksValue(a);
  rows.push({ label: "How the product works", value: how.value, fullValue: how.full, emphasis: how.value === EM_DASH ? "muted" : "normal" });

  const auth = authorityValue(a);
  rows.push({ label: "Authority dismissed", value: auth, emphasis: auth === EM_DASH ? "muted" : "normal" });

  const proof = proofCountValue(a);
  rows.push({ label: "Proof moments", value: proof, emphasis: proof === EM_DASH ? "muted" : "normal" });

  const descent = descentCountValue(a);
  rows.push({ label: "Descent artifacts", value: descent, fullValue: descent.length > 80 ? descent : undefined, emphasis: descent === EM_DASH ? "muted" : "normal" });

  const fmt = formatValue(a);
  rows.push({ label: "Product format", value: fmt, emphasis: fmt === EM_DASH ? "muted" : "normal" });

  const tone = toneValue(a);
  rows.push({ label: "Tone", value: tone, emphasis: tone === EM_DASH ? "muted" : "normal" });

  return rows;
}
