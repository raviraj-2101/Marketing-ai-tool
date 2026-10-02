const PALETTE = [
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-800" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" },
  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-800" },
  { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-800" },
  { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-800" },
  { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-800" },
  { bg: "bg-fuchsia-50", border: "border-fuchsia-200", text: "text-fuchsia-800" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800" },
  { bg: "bg-lime-50", border: "border-lime-200", text: "text-lime-800" },
] as const;

export function brandChipClasses(name: string | null | undefined): string {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return "bg-slate-50 border-slate-200 text-slate-700";
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % PALETTE.length;
  const p = PALETTE[idx];
  return `${p.bg} ${p.border} ${p.text}`;
}
