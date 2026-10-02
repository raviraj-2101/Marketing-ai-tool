/** Pure free-text search predicate for a Video Build Log group.
 *  Matches the query against the group's identifiers, INCLUDING ad_id — so an ad
 *  number (from the Ads DB or a run-page deep-link `?q=<ad_id>`) finds its row.
 *  Kept here (not inline in the page) so it's unit-testable without loading the
 *  full page module. */
export interface LogSearchFields {
  generation_id?: string | null;
  ad_id?: string | null;
  brand?: string | null;
  product_name?: string | null;
  avatar_name?: string | null;
  overall_status?: string | null;
  concept?: string | null;
  cs?: string | null;
}

export function logSearchMatches(g: LogSearchFields, query: string): boolean {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;
  return (
    !!g.generation_id?.toLowerCase().includes(q) ||
    !!g.ad_id?.toLowerCase().includes(q) ||
    !!g.brand?.toLowerCase().includes(q) ||
    !!g.product_name?.toLowerCase().includes(q) ||
    !!g.avatar_name?.toLowerCase().includes(q) ||
    !!g.overall_status?.toLowerCase().includes(q) ||
    !!g.concept?.toLowerCase().includes(q) ||
    !!g.cs?.toLowerCase().includes(q)
  );
}
