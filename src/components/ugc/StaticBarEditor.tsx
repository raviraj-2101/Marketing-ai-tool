import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

export interface StaticBarValue {
  enabled: boolean;
  text: string;
  bgColor: string;
  textColor: string;
  durationSec: number;
  captionPlacement: string;   // e.g. "bottom:20"
  staticBarPlacement: string; // e.g. "top:40" or "" for auto (above captions)
}

export const DEFAULT_STATIC_BAR: StaticBarValue = {
  enabled: true,
  text: "",
  bgColor: "#E53935",
  textColor: "#FFFFFF",
  durationSec: 8,
  captionPlacement: "bottom:22",
  staticBarPlacement: "",
};

const SWATCHES: Array<{ label: string; bg: string; fg: string }> = [
  { label: "FB Red",   bg: "#E53935", fg: "#FFFFFF" },
  { label: "Cobalt",   bg: "#1A73E8", fg: "#FFFFFF" },
  { label: "Emerald",  bg: "#0F9D58", fg: "#FFFFFF" },
  { label: "Amber",    bg: "#F4B400", fg: "#1F1F1F" },
  { label: "Black",    bg: "#1F1F1F", fg: "#FFFFFF" },
  { label: "White",    bg: "#FFFFFF", fg: "#1F1F1F" },
  { label: "Hot Pink", bg: "#E91E63", fg: "#FFFFFF" },
  { label: "Purple",   bg: "#7E57C2", fg: "#FFFFFF" },
];

interface Props {
  value: StaticBarValue;
  onChange: (v: StaticBarValue) => void;
  scriptText?: string;
  productSlug?: string;
}

export function StaticBarEditor({ value, onChange, scriptText, productSlug }: Props) {
  const { toast } = useToast();
  const [suggesting, setSuggesting] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const set = (patch: Partial<StaticBarValue>) => onChange({ ...value, ...patch });

  const doSuggest = async () => {
    if (!scriptText || scriptText.trim().length < 20) {
      toast({
        title: "Need a script first",
        description: "Enter or generate the script body before auto-suggesting a title bar.",
        variant: "destructive",
      });
      return;
    }
    setSuggesting(true);
    try {
      // apiRequest() already prepends API_BASE — pass a relative path so the
      // base isn't doubled (e.g. http://localhost:8000http://localhost:8000/...).
      const r = await apiRequest("POST", `/api/static-bar/suggest`, {
        scriptText,
        productSlug,
        excludeTitles: rejected,
      });
      const j = await r.json();
      if (!j.ok || !j.suggested) {
        toast({ title: "Auto-suggest failed", description: j.message || "Skill returned no candidate", variant: "destructive" });
      } else {
        if (value.text && value.text.trim()) {
          setRejected((prev) => Array.from(new Set([...prev, value.text.trim()])).slice(-20));
        }
        set({ text: j.suggested });
      }
    } catch (e: any) {
      toast({ title: "Auto-suggest failed", description: e?.message || "Network error", variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-3">

      {/* Header — checkbox always active */}
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => {
              if (!e.target.checked) {
                onChange({
                  ...value,
                  enabled: false,
                  text: "",
                  bgColor: DEFAULT_STATIC_BAR.bgColor,
                  textColor: DEFAULT_STATIC_BAR.textColor,
                  durationSec: DEFAULT_STATIC_BAR.durationSec,
                  staticBarPlacement: "",
                });
              } else {
                set({ enabled: true });
              }
            }}
            className="size-4 accent-primary"
          />
          <span className="text-[13.5px] font-semibold">Static title bar</span>
        </label>
        <span className="text-[11px] text-muted-foreground">
          Shows for the first <b>{value.durationSec}s</b> above the captions
        </span>
      </div>

      {/* Main content — always visible; only left column dims */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">

        {/* LEFT — static bar config, dims when disabled */}
        <div className={`space-y-3 min-w-0 transition-opacity ${!value.enabled ? "opacity-40 pointer-events-none" : ""}`}>

          {/* Bar text */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Bar text
            </label>
            <div className="flex gap-2">
              <textarea
                value={value.text}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="e.g. What no one tells you about lymphatic drainage"
                maxLength={200}
                rows={4}
                className="flex-1 rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {/* Auto-generate the bar text from the script. */}
              <button
                type="button"
                onClick={doSuggest}
                disabled={suggesting || !scriptText || scriptText.trim().length < 20}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-3 py-2 text-[12px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {suggesting
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : (value.text ? <RotateCcw className="size-3.5" /> : <Sparkles className="size-3.5" />)}
                {value.text ? "Re-roll" : "Auto-generate"}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10.5px] text-muted-foreground/80">
              <span>{value.text.length} / 200 chars</span>
              <span>Tip: press Enter for a manual line break · max 4 lines</span>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Background" value={value.bgColor} onChange={(c) => set({ bgColor: c })} />
            <ColorField label="Text" value={value.textColor} onChange={(c) => set({ textColor: c })} />
          </div>

          {/* Presets */}
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/85 mb-1.5">Presets</div>
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((s) => {
                const active = value.bgColor.toUpperCase() === s.bg.toUpperCase() && value.textColor.toUpperCase() === s.fg.toUpperCase();
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => set({ bgColor: s.bg, textColor: s.fg })}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold border transition-all ${
                      active ? "ring-2 ring-primary/40 border-primary/40" : "border-border/40 hover:border-border"
                    }`}
                    style={{ background: s.bg, color: s.fg }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">
              Duration
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={2}
                max={15}
                step={1}
                value={value.durationSec}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return;
                  const n = parseInt(raw, 10);
                  if (!Number.isFinite(n)) return;
                  set({ durationSec: Math.max(2, Math.min(15, n)) });
                }}
                className="w-24 rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-[12px] text-muted-foreground">seconds (2–15, default 8)</span>
            </div>
          </div>

        </div>

        {/* RIGHT — live preview */}
        <div className="md:pt-0">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/85 mb-2">Live preview</div>
          <PreviewFrame value={value} />
        </div>
      </div>

      {/* Placement row — caption always active, bar dims with the rest */}
      <div className="grid grid-cols-2 gap-3">
        <PlacementInput
          label="Caption Placement"
          value={value.captionPlacement}
          onChange={(v) => set({ captionPlacement: v })}
          defaultValue="bottom:22"
        />
        <div className={`transition-opacity ${!value.enabled ? "opacity-40 pointer-events-none" : ""}`}>
          <PlacementInput
            label="Title Bar Placement"
            value={value.staticBarPlacement}
            onChange={(v) => set({ staticBarPlacement: v })}
            defaultValue=""
            allowAuto
          />
        </div>
      </div>
    </div>
  );
}

// ─── PlacementInput ────────────────────────────────────────────────────────────

function parsePlacement(s: string): { anchor: "top" | "bottom"; pct: number } | null {
  const m = /^(top|bottom):(\d+(?:\.\d+)?)$/.exec(s?.trim() ?? "");
  if (!m) return null;
  return { anchor: m[1] as "top" | "bottom", pct: Math.round(parseFloat(m[2])) };
}

function PlacementInput({
  label,
  value,
  onChange,
  defaultValue,
  allowAuto = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  defaultValue: string;
  allowAuto?: boolean;
}) {
  const isAuto = allowAuto && !value;
  const effective = value || defaultValue;
  const parsed = parsePlacement(effective);
  const anchor = parsed?.anchor ?? "bottom";
  const pct = parsed?.pct ?? 22;
  const isDefault = !!defaultValue && value === defaultValue;

  const emit = (a: "top" | "bottom", p: number) => onChange(`${a}:${p}`);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </label>
        {isDefault && (
          <span className="text-[10px] text-muted-foreground/55 normal-case tracking-normal">default</span>
        )}
        {isAuto && (
          <span className="text-[10px] text-muted-foreground/55 normal-case tracking-normal">auto — above captions</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={isAuto ? "auto" : anchor}
          onChange={(e) => {
            if (e.target.value === "auto") { onChange(""); return; }
            emit(e.target.value as "top" | "bottom", pct);
          }}
          className="rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {allowAuto && <option value="auto">Auto</option>}
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
        </select>
        <input
          type="number"
          min={1}
          max={99}
          step={1}
          value={isAuto ? "" : pct}
          disabled={isAuto}
          placeholder={isAuto ? "—" : undefined}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) emit(anchor, Math.max(1, Math.min(99, n)));
          }}
          className="w-16 rounded-md border border-border/60 bg-background px-2 py-2 text-[13px] tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-40"
        />
        <span className="text-[12px] text-muted-foreground">%</span>
        {!isAuto && !isDefault && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground underline ml-1"
          >
            reset
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ColorField ───────────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded-md border border-border/60 bg-background cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#?[0-9a-fA-F]{3,8}$/.test(v)) {
              onChange(v.startsWith("#") ? v : `#${v}`);
            } else {
              onChange(v);
            }
          }}
          className="flex-1 rounded-md border border-border/60 bg-background px-3 py-2 text-[13px] font-mono"
          maxLength={9}
        />
      </div>
    </div>
  );
}

// ─── PreviewFrame ─────────────────────────────────────────────────────────────

function parsePlacementFrac(placement: string, defaultFrac: number): number {
  const m = /^(top|bottom):(\d+(?:\.\d+)?)$/.exec(placement?.trim().toLowerCase() ?? "");
  if (!m) return defaultFrac;
  const pct = parseFloat(m[2]) / 100;
  return m[1] === "top" ? pct : 1 - pct;
}

function PreviewFrame({ value }: { value: StaticBarValue }) {
  const SCALE        = 0.19;
  const CANVAS_W     = 1080;
  const CANVAS_H     = 1920;
  const CAPTION_H    = 120; // caption-height FALLBACK until the real pill loads
  const BAR_GAP      = 16;  // on-canvas gap (1080×1920 space) above the REAL caption top — mirrors captionBurn.js TITLE_BAR_GAP (~12px); nudged up so it reads clearly at SCALE

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const lastReqRef                  = useRef<number>(0);

  // Real caption pill, rendered server-side by the SAME renderer the video uses
  // (a fixed sample — real captions are dynamic per-video). Falls back to a CSS
  // box if the request fails.
  const [capUrl, setCapUrl]   = useState<string | null>(null);
  const [capDims, setCapDims] = useState<{ w: number; h: number } | null>(null);
  // Real bar PNG dimensions (set on img onLoad) — used to center an explicitly
  // placed bar by its true height, mirroring captionBurn.js.
  const [barDims, setBarDims] = useState<{ w: number; h: number } | null>(null);

  // Caption center Y from captionPlacement (default bottom:22 → 78% from top)
  const captionFrac    = parsePlacementFrac(value.captionPlacement || "bottom:22", 0.78);
  const captionCenterY = CANVAS_H * captionFrac;
  // Use the REAL caption pill height once known; fall back to CAPTION_H until it loads.
  const captionHalf    = capDims ? capDims.h / 2 : CAPTION_H / 2;
  const captionTopY    = captionCenterY - captionHalf;

  // Bar bottom Y. AUTO: a clear gap above the REAL caption top (mirrors
  // captionBurn.js: tbY = realCaptionTop - TITLE_BAR_GAP - barHeight). EXPLICIT:
  // center the bar at the placement Y using the bar's REAL half-height
  // (mirrors captionBurn.js: tbY = centerPx - titleBarHeight/2). Falls back to
  // CAPTION_H/2 for the bar half-height until the bar PNG loads.
  const barHalf    = barDims ? barDims.h / 2 : CAPTION_H / 2;
  const barBottomY = value.staticBarPlacement
    ? CANVAS_H * parsePlacementFrac(value.staticBarPlacement, captionFrac - 0.1) + barHalf
    : captionTopY - BAR_GAP;

  useEffect(() => {
    const text = value.text.trim();
    if (!text) { setPreviewUrl(null); setBarDims(null); return; }
    const reqId = ++lastReqRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/static-bar/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, bgColor: value.bgColor, textColor: value.textColor }),
        });
        if (reqId !== lastReqRef.current) return;
        if (!r.ok) { setPreviewUrl(null); return; }
        const blob = await r.blob();
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch {
        if (reqId === lastReqRef.current) setPreviewUrl(null);
      } finally {
        if (reqId === lastReqRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value.text, value.bgColor, value.textColor]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the real caption pill once on mount.
  useEffect(() => {
    let cancelled = false;
    let objUrl: string | null = null;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/caption/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "spoken captions appear here" }),
        });
        if (!r.ok || cancelled) return;
        const blob = await r.blob();
        if (cancelled) return;
        objUrl = URL.createObjectURL(blob);
        setCapUrl(objUrl);
      } catch { /* fall back to CSS box */ }
    })();
    return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, []);

  return (
    <div
      className="relative rounded-xl overflow-hidden ring-1 ring-border/60"
      style={{
        width:      CANVAS_W * SCALE,
        height:     CANVAS_H * SCALE,
        background: "linear-gradient(180deg,#3a4a5e 0%,#2d3a4d 60%,#23303f 100%)",
      }}
    >
      {/* Faux avatar */}
      <div className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: 80 * SCALE, width: 380 * SCALE, height: 380 * SCALE, background: "radial-gradient(circle,#6b7a8f 0%,#4a5566 70%,transparent 100%)", opacity: 0.6 }} />
      <div className="absolute left-1/2 -translate-x-1/2 rounded-t-[40%]" style={{ top: 380 * SCALE, width: 720 * SCALE, height: 900 * SCALE, background: "linear-gradient(180deg,#5a677a 0%,#4a5566 100%)", opacity: 0.55 }} />

      {/* Static title bar PNG — bottom anchored */}
      {previewUrl && (
        <img
          src={previewUrl}
          alt="static title bar preview"
          onLoad={(e) => {
            const im = e.currentTarget;
            setBarDims({ w: im.naturalWidth, h: im.naturalHeight });
          }}
          style={{ position: "absolute", left: 0, width: CANVAS_W * SCALE, bottom: (CANVAS_H - barBottomY) * SCALE, imageRendering: "auto" }}
        />
      )}
      {loading && !previewUrl && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center text-white/60" style={{ bottom: (CANVAS_H - barBottomY) * SCALE, height: 60 * SCALE }}>
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}

      {/* Caption block — real server-rendered pill (pixel-identical to the video),
          centered at the caption position. Falls back to a CSS box if unavailable. */}
      {capUrl ? (
        <img
          src={capUrl}
          alt="caption preview"
          onLoad={(e) => {
            const im = e.currentTarget;
            if (!capDims) setCapDims({ w: im.naturalWidth, h: im.naturalHeight });
          }}
          style={{
            position:  "absolute",
            left:      "50%",
            top:       captionCenterY * SCALE,
            transform: "translate(-50%,-50%)",
            width:     capDims ? capDims.w * SCALE : undefined,
            height:    capDims ? capDims.h * SCALE : undefined,
            opacity:   capDims ? 1 : 0,
          }}
        />
      ) : (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-white text-black rounded-[8px] flex items-center justify-center font-bold text-center"
          style={{
            top:        captionTopY * SCALE,
            width:      880 * SCALE,
            height:     CAPTION_H * SCALE,
            fontSize:   Math.max(7, 56 * SCALE),
            padding:    `${16 * SCALE}px ${24 * SCALE}px`,
            opacity:    0.92,
            fontFamily: "-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
          }}
        >
          spoken captions appear here
        </div>
      )}

      <div className="absolute bottom-1 right-1 text-white/40 font-mono" style={{ fontSize: 9 }}>
        pixel-identical preview
      </div>
    </div>
  );
}
