// Bonuses = salary data. Visible ONLY to a named allow-list of emails — this is the
// SOLE gate for the /bonuses tab (it deliberately bypasses the generic route-permission
// model, which would otherwise expose salaries to every admin/dev).
//
// Keep this list in sync with the backend BONUSES_ALLOWED_EMAILS (new-pipeline
// bonusesController.js). The backend 403 is the real security boundary; this only
// controls what the current user sees in the UI.
//
// Can also be overridden at build time via VITE_BONUSES_ALLOWED_EMAILS (comma-separated).
const RAW =
  (import.meta.env.VITE_BONUSES_ALLOWED_EMAILS as string | undefined) ||
  "carly@acentecom.com,rasul@acentecom.com";

export const BONUSES_ALLOWED_EMAILS = RAW.split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function canSeeBonuses(user?: { email?: string } | null): boolean {
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  return BONUSES_ALLOWED_EMAILS.includes(email);
}
