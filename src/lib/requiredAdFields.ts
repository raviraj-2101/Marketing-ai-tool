// MIRROR of pipeline-node/src/constants/requiredAdFields.js — keep in sync.
// (Separate repos, so this is a hand-synced mirror, not a shared import.)
//
// Fields that must be filled before a VID ad's Stage can move to "Editing".
// This is an advisory UX pre-check; the backend (PUT /update-ad) re-validates
// authoritatively and its error drives the same toast. Scope: VID/ads only.
//
// `col` is the `ads` table column (= the AG Grid row key for VID).

export interface RequiredAdField {
  label: string;
  col: string;
}

export const REQUIRED_AD_FIELDS_FOR_EDITING: RequiredAdField[] = [
  { label: 'Concept Name',    col: 'concept_name' },
  { label: 'Points',          col: 'points' },
];

/**
 * Returns the labels of required fields that are present-but-empty on the row.
 *
 * Important: a column that is `undefined` (i.e. not loaded into the grid row,
 * because it isn't a displayed column for this tab) is treated as "unknown" and
 * skipped — the authoritative backend check catches it. This avoids false
 * positives where the pre-check would block on a field it simply can't see.
 */
export function findMissingRequiredFields(row: Record<string, unknown>): string[] {
  if (!row) return [];
  const missing: string[] = [];
  for (const { label, col } of REQUIRED_AD_FIELDS_FOR_EDITING) {
    const value = row[col];
    if (value === undefined) continue; // not loaded → defer to backend
    if (value === null) { missing.push(label); continue; }
    if (typeof value === 'number') continue; // 0 counts as set
    if (String(value).trim() === '') missing.push(label);
  }
  return missing;
}
