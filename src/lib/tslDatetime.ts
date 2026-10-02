// Copied from TSL-Generation-v2/client/src/lib/datetime.ts
// Date/time formatters using the operator's device-local timezone.

function toMillis(v: number | string | Date | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  const n = typeof v === "string" ? Date.parse(v) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

export function fmtLocal(
  v: number | string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const ms = toMillis(v);
  if (ms == null) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  });
}

export function fmtLocalTime(v: number | string | Date | null | undefined): string {
  const ms = toMillis(v);
  if (ms == null) return "";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
