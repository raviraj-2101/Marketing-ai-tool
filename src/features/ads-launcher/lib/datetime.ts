const ZONE = "Europe/Berlin";
const LOCALE = "en-GB";

type DateInput = string | number | Date | null | undefined;

function asDate(input: DateInput): Date | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(input: DateInput, opts?: Intl.DateTimeFormatOptions): string {
  const d = asDate(input);
  if (!d) return "";
  return d.toLocaleString(LOCALE, {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
    ...opts,
  });
}

export function fmtShort(input: DateInput): string {
  const d = asDate(input);
  if (!d) return "";
  return d.toLocaleString(LOCALE, {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDate(input: DateInput): string {
  const d = asDate(input);
  if (!d) return "";
  return d.toLocaleDateString(LOCALE, {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateChip(input: DateInput): string {
  const d = asDate(input);
  if (!d) return "";
  return d.toLocaleDateString(LOCALE, {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
  });
}

export function fmtTime(input: DateInput): string {
  const d = asDate(input);
  if (!d) return "";
  return d.toLocaleTimeString(LOCALE, {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtRelative(input: DateInput): string {
  const d = asDate(input);
  if (!d) return "";
  const dKey = d.toLocaleDateString("en-CA", { timeZone: ZONE });
  const now = new Date();
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: ZONE });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const yestKey = yest.toLocaleDateString("en-CA", { timeZone: ZONE });
  if (dKey === todayKey) return `today ${fmtTime(d)}`;
  if (dKey === yestKey) return `yesterday ${fmtTime(d)}`;
  return fmtDateChip(d);
}
