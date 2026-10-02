// analysisProse.ts — turn the structured script-analysis JSON into copywriter
// language for the operator. No field names, no JSON vocabulary.

interface CharacterShape {
  name?: string;
  age?: number | null;
  role_in_script?: string;
}
interface LocationShape {
  name?: string;
  type?: string;
}
interface OpenerArtifactShape {
  object?: string;
  location?: string;
  implied_action?: string;
}
interface MechanismShape {
  root_cause?: string;
  how_product_works?: string;
}
interface ProofMomentShape {
  milestone?: string;
}
interface ProductFormatShape {
  form?: string;
}
interface DescentArtifactShape {
  object?: string;
  scene_context?: string;
}
interface AuthorityWitnessShape {
  role?: string;
}

export interface AnalysisShape {
  characters?: CharacterShape[];
  locations?: LocationShape[];
  opener_artifact?: OpenerArtifactShape | null;
  descent_artifacts?: DescentArtifactShape[];
  authority_witness?: AuthorityWitnessShape | null;
  mechanism?: MechanismShape;
  proof_moments?: ProofMomentShape[];
  product_format?: ProductFormatShape;
  tonal_register?: string;
}

function describeFormat(form?: string): string {
  switch (form) {
    case "drops": return "a drops bottle";
    case "softgels": return "softgel capsules";
    case "pack": return "a pack of softgels";
    case "patches": return "a patch sticker";
    case "bottle": return "a tincture bottle";
    case "other": return "the product";
    default: return form ? `${form} format` : "the product";
  }
}

function describeAngle(mechanism?: MechanismShape): string {
  if (!mechanism?.root_cause) return "no specific angle named";
  const root = mechanism.root_cause.toLowerCase();
  if (root.includes("lymph")) return "lymphatic angle";
  if (root.includes("glp") || root.includes("appetite signaling") || root.includes("satiety")) return "GLP-1 appetite angle";
  if (root.includes("overgrowth") || root.includes("biofilm") || root.includes("dysbios")) return "gut-overgrowth angle";
  if (root.includes("gut") || root.includes("digest") || root.includes("intestin")) return "gut-cleanse angle";
  if (root.includes("perimenopaus") || root.includes("hormonal cascade") || root.includes("hot flash")) return "perimenopause angle";
  if (root.includes("thyroid") || root.includes("hormon")) return "hormonal angle";
  if (root.includes("circadian") || root.includes("sleep") || root.includes("insomn")) return "sleep-circuit angle";
  if (root.includes("skin") || root.includes("acne") || root.includes("rosacea")) return "skin-inflammation angle";
  if (root.includes("joint") || root.includes("arthritic") || root.includes("inflammation of the joints")) return "joint-inflammation angle";
  if (root.includes("hair") || root.includes("follicle") || root.includes("scalp")) return "hair-follicle angle";
  if (root.includes("uti") || root.includes("urinary")) return "urinary-tract angle";
  if (root.includes("inflam")) return "inflammation angle";
  if (root.includes("circulat") || root.includes("vessel") || root.includes("vein")) return "circulation angle";
  const first = mechanism.root_cause.split(/[,.;:]/)[0].trim();
  return first.length < 60 ? first.toLowerCase() : "the named root cause";
}

export function oneLineSummary(a: AnalysisShape): string {
  if (!a) return "";
  const narrator = (a.characters || []).find((c) => c.role_in_script === "narrator");
  const others = (a.characters || []).filter((c) => c !== narrator);
  const proofCount = (a.proof_moments || []).length;
  const witness = a.authority_witness?.role;
  const parts: string[] = [];
  if (narrator?.name) {
    const ageBit = narrator.age ? `, ${narrator.age}` : "";
    parts.push(`${narrator.name}${ageBit}`);
  } else if (narrator) {
    parts.push("an unnamed narrator");
  } else {
    parts.push("no clear narrator");
  }
  parts.push(describeAngle(a.mechanism));
  if (proofCount > 0) parts.push(`${proofCount} proof moment${proofCount === 1 ? "" : "s"}`);
  else parts.push("no explicit proof moments");
  if (witness) parts.push(`a ${witness} as dismissive authority`);
  else if (others.length > 0) parts.push(`${others.length} supporting character${others.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function detailParagraph(a: AnalysisShape): string {
  if (!a) return "";
  const characters = a.characters || [];
  const narrator = characters.find((c) => c.role_in_script === "narrator");
  const others = characters.filter((c) => c !== narrator);
  const sentences: string[] = [];
  if (narrator) {
    const ageBit = narrator.age ? ` (${narrator.age})` : "";
    sentences.push(`${narrator.name || "An unnamed narrator"}${ageBit} carries the script.`);
  }
  if (others.length > 0) {
    const names = others
      .map((c) => `${c.name || "an unnamed person"}${c.role_in_script ? ` (the ${c.role_in_script})` : ""}`)
      .join(", ");
    sentences.push(`Supporting cast: ${names}.`);
  }
  if (a.authority_witness?.role) {
    sentences.push(`The dismissive authority is a ${a.authority_witness.role} — the moment that turns the viewer against the establishment.`);
  }
  if (a.opener_artifact?.object) {
    const where = a.opener_artifact.location ? ` in ${a.opener_artifact.location}` : "";
    sentences.push(`The opening anchors on ${a.opener_artifact.object}${where}.`);
  }
  if (a.mechanism?.root_cause) {
    const cause = a.mechanism.root_cause;
    const how = a.mechanism.how_product_works;
    sentences.push(`The mechanism: ${cause}${how ? `. The product works by ${how}.` : "."}`);
  }
  if (a.product_format?.form) {
    sentences.push(`The product is ${describeFormat(a.product_format.form)}.`);
  }
  const proofs = (a.proof_moments || []).map((p) => p.milestone).filter(Boolean);
  if (proofs.length > 0) {
    sentences.push(`Proof moments the script delivers: ${proofs.join("; ")}.`);
  }
  const descents = (a.descent_artifacts || []).map((d) => d.object).filter(Boolean);
  if (descents.length > 0) {
    sentences.push(`Failed remedies the narrator has tried: ${descents.join(", ")}.`);
  }
  if (a.tonal_register) {
    const t = a.tonal_register;
    if (t === "extreme_emotional") sentences.push("Tone: high-emotion, urgent.");
    else if (t === "measured_authority") sentences.push("Tone: measured, authoritative.");
    else if (t === "hybrid") sentences.push("Tone: a hybrid of emotional and authoritative beats.");
  }
  return sentences.join(" ");
}
