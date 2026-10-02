type Tone = {
  bg: string;
  text: string;
  dot: string;
  pulse?: boolean;
};

const TONE: Record<string, Tone> = {
  ACTIVE: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", pulse: true },
  PAUSED: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  IN_PROCESS: { bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500", pulse: true },
  WITH_ISSUES: { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
  ARCHIVED: { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400" },
  DELETED: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  // Nullable: the API can send null (e.g. effective status not yet known).
  status: string | null | undefined;
  size?: "sm" | "md";
}) {
  // Fall back to a neutral "—" label + tone so a null/unknown status never
  // renders as an empty badge (just a colored dot with no text).
  const label = status && status.trim() ? status : "—";
  const tone = (status && TONE[status]) || TONE.PAUSED;
  const cls =
    size === "md"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ${cls} ${tone.bg} ${tone.text}`}>
      <span className="relative inline-flex items-center justify-center">
        {tone.pulse && (
          <span
            className={`absolute inline-flex h-2 w-2 rounded-full opacity-75 ${tone.dot} animate-ping`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      </span>
      {label}
    </span>
  );
}
