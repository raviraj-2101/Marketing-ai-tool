// parseAds.ts — decode the hidden <!--ADS_RESULTS:base64--> marker the server
// embeds in an assistant message into typed ad data for the Ads side-panel.
// Mirrors parseScripts.ts: parse from raw content; stripMetaForClient hides it.

export interface AdRow {
  ad_id: string;
  ad_name: string | null;
  channel: string | null;
  product: string | null;
  concept_name: string | null;
  sub_angle: string | null;
  root_cause: string | null;
  main_pain_point: string | null;
  ad_format: string | null;
  funnel: string | null;
  cta: string | null;
  it_or_nn: string | null;
  launch_date: string | null;
  spend: number;
  ncROAS: number;
  ncRevenue: number;
  orders: number;
  script_id: string | null;
  clickup_link: string | null;
  ad_source_link: string | null;
  brief: string | null;
  script: string | null;
  script_source: string | null;
  ad_image_url: string | null;
  ad_video_url: string | null;
}

export interface AdsResult {
  query: Record<string, unknown> | null;
  count: number;
  total_matched: number | null;
  ads: AdRow[];
}

// Base64 alphabet only — matches the server's marker (no ">" inside).
const ADS_MARKER_RE = /<!--ADS_RESULTS:([A-Za-z0-9+/=]*)-->/;

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseAdsResults(content: string | null | undefined): AdsResult | null {
  if (!content || typeof content !== "string") return null;
  const m = ADS_MARKER_RE.exec(content);
  if (!m) return null;
  try {
    const obj = JSON.parse(decodeBase64Utf8(m[1]));
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.ads)) return null;
    return {
      query: obj.query ?? null,
      count: typeof obj.count === "number" ? obj.count : obj.ads.length,
      total_matched: typeof obj.total_matched === "number" ? obj.total_matched : null,
      ads: obj.ads as AdRow[],
    };
  } catch {
    return null;
  }
}

// Prefilled, editable composer text for "iterate this angle".
export function buildIteratePrompt(ad: AdRow): string {
  const tag = [ad.concept_name, ad.sub_angle, ad.ad_format, ad.channel]
    .filter(Boolean)
    .join(" · ");
  const roas = Number(ad.ncROAS ?? 0).toFixed(2);
  const spend = Math.round(Number(ad.spend ?? 0)).toLocaleString();
  const header =
    `Write a fresh iteration of this proven ad — ${tag || ad.ad_id} ` +
    `(ROAS ${roas}, spend $${spend}). Keep its winning structure and angle.`;
  const hasScript = !!ad.script && ad.script_source !== "brief_doc_unavailable";
  return hasScript
    ? `${header}\n\nHere is its script to iterate from:\n\n${ad.script}`
    : `${header}\n\n(Original script wasn't accessible — base the iteration on the angle/format above and the proven structures in the product config.)`;
}
