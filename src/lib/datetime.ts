/**
 * Date/time formatters — every timestamp surfaced in the UI runs through
 * these so the whole tool reads in CET (Europe/Berlin) regardless of where
 * the user happens to be browsing from. Centralized so we don't sprinkle
 * `timeZone: "Europe/Berlin"` across 12 files.
 *
 * `Date` accepts both seconds-since-epoch and ms-since-epoch in different
 * places of the codebase (build.started_at is ms, automation_runs.run_at
 * is ms too, but Postgres-side rows can come back as seconds). Each helper
 * normalizes via `toMillis()` so callers can pass either.
 */

const TZ = "Europe/Berlin";

function toMillis(v: number | string | Date | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  const n = typeof v === "string" ? Date.parse(v) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: anything < 1e12 looks like seconds-since-epoch, not ms.
  return n < 1e12 ? n * 1000 : n;
}

/**
 * Default: "May 17, 4:24 PM" — matches the log page's compact stamp style.
 * Use `opts` to override individual fields (date-only, time-only, etc).
 */
export function fmtCET(
  v: number | string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const ms = toMillis(v);
  if (ms == null) return "";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
    ...opts,
  });
}

/** "4:24 PM" — minute-precision time of day, no date. */
export function fmtCETTime(v: number | string | Date | null | undefined): string {
  return fmtCET(v, { month: undefined, day: undefined, hour: "2-digit", minute: "2-digit" });
}

/** "May 17, 2026 · 4:24 PM CET" — fully-qualified for run-detail pages. */
export function fmtCETFull(v: number | string | Date | null | undefined): string {
  const ms = toMillis(v);
  if (ms == null) return "";
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
    timeZoneName: "short",
  });
}
