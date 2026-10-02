import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Copy,
  Check,
  ExternalLink,
  Library,
  ImageOff,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

// ---------------------------------------------------------------------------
// Data contract (written by the S1b slice to public/tsl-bank.json):
//   { brands: [ { brand, scripts: [ {
//       rank, short_label, angle, authority_score, bucket, product,
//       main_pain_point, library_url, image, body_meta
//   } ] } ] }
// ---------------------------------------------------------------------------

type RawScript = Record<string, unknown>;

interface BankScript {
  rank: number;
  shortLabel: string;
  angle: string;
  authorityScore: number | null;
  bucket: string;
  product: string;
  mainPainPoint: string;
  libraryUrl: string;
  image: string;
  bodyMeta: string;
  format: string;
}

interface BankBrand {
  brand: string;
  scripts: BankScript[];
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function pick(o: RawScript, ...keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] != null && o[k] !== "") return o[k];
  }
  return undefined;
}

function normalizeScript(raw: RawScript, idx: number): BankScript {
  const rankRaw = pick(raw, "rank", "best_rank", "position");
  const scoreRaw = pick(raw, "authority_score", "authorityScore", "authority");
  const score =
    scoreRaw == null || scoreRaw === ""
      ? null
      : Number.isFinite(Number(scoreRaw))
      ? Number(scoreRaw)
      : null;
  return {
    rank: Number.isFinite(Number(rankRaw)) ? Number(rankRaw) : idx + 1,
    shortLabel:
      asString(pick(raw, "short_label", "shortLabel", "label", "title")) ||
      `Script ${idx + 1}`,
    angle: asString(pick(raw, "angle", "hook", "summary")),
    authorityScore: score,
    bucket: asString(pick(raw, "bucket", "tier", "band")).toLowerCase(),
    product: asString(pick(raw, "product", "page")),
    mainPainPoint: asString(
      pick(raw, "main_pain_point", "mainPainPoint", "pain", "pain_point")
    ),
    libraryUrl: asString(pick(raw, "library_url", "libraryUrl", "ad_url")),
    image: asString(pick(raw, "image", "top_variant_image", "image_local")),
    bodyMeta: asString(pick(raw, "body_meta", "bodyMeta", "body")),
    format: asString(pick(raw, "format")),
  };
}

const FORMAT_META: Record<string, { label: string; blurb: string }> = {
  "full-narrative-arc": { label: "Full Narrative Arc", blurb: "relationship build + emotional payoff" },
  "lean-linear": { label: "Lean Linear", blurb: "mechanism-forward, early ask" },
  "stakes-first-cold-open": { label: "Stakes-First Cold-Open", blurb: "a death leads" },
};

function formatLabel(fmt: string): string {
  return FORMAT_META[fmt]?.label ?? "—";
}

function normalizeBank(json: unknown): BankBrand[] {
  if (!json || typeof json !== "object") return [];
  const brandsArr = (json as { brands?: unknown }).brands;
  if (!Array.isArray(brandsArr)) return [];
  return brandsArr
    .map((b): BankBrand | null => {
      if (!b || typeof b !== "object") return null;
      const brand = asString((b as { brand?: unknown }).brand) || "Unnamed";
      const scriptsRaw = (b as { scripts?: unknown }).scripts;
      const scripts = Array.isArray(scriptsRaw)
        ? scriptsRaw
            .map((s, i) => normalizeScript(s as RawScript, i))
            .sort((a, z) => a.rank - z.rank)
        : [];
      return { brand, scripts };
    })
    .filter((b): b is BankBrand => b !== null);
}

function authorityTone(
  bucket: string,
  score: number | null
): "elite" | "strong" | "ok" | "weak" {
  const b = bucket.toLowerCase();
  if (["elite", "a", "top", "winner", "s"].includes(b)) return "elite";
  if (["strong", "b", "high", "good"].includes(b)) return "strong";
  if (["ok", "c", "mid", "average"].includes(b)) return "ok";
  if (["weak", "d", "low"].includes(b)) return "weak";
  if (score == null) return "ok";
  if (score >= 90) return "elite";
  if (score >= 80) return "strong";
  if (score >= 65) return "ok";
  return "weak";
}

const TONE_CLASS: Record<string, string> = {
  elite:
    "border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-500",
  strong:
    "border-transparent bg-primary text-primary-foreground hover:bg-primary",
  ok: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
  weak: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
};

type FetchState = "loading" | "pending" | "ready" | "error";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onCopy}
      data-testid="bank-copy-button"
    >
      {copied ? (
        <>
          <Check className="text-emerald-600" /> Copied
        </>
      ) : (
        <>
          <Copy /> Copy script
        </>
      )}
    </Button>
  );
}

function ScriptImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-card-border bg-muted text-muted-foreground">
        <div className="flex flex-col items-center gap-2 text-xs">
          <ImageOff className="h-6 w-6" />
          <span>No creative</span>
        </div>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className="w-full rounded-lg border border-card-border object-cover"
    />
  );
}

function ScriptCard({ script }: { script: BankScript }) {
  const tone = authorityTone(script.bucket, script.authorityScore);
  return (
    <Card data-testid="bank-script-card" className="overflow-hidden">
      <CardHeader className="gap-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-lg leading-tight">
              <span className="text-muted-foreground tabular-nums">
                #{script.rank}
              </span>{" "}
              {script.shortLabel}
            </CardTitle>
            {script.angle ? (
              <CardDescription className="text-sm">
                {script.angle}
              </CardDescription>
            ) : null}
          </div>
          {script.authorityScore != null ? (
            <Badge
              className={cn("shrink-0", TONE_CLASS[tone])}
              data-testid="bank-authority-badge"
              title={`Authority bucket: ${script.bucket || tone}`}
            >
              Authority {script.authorityScore}/100
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {script.format && FORMAT_META[script.format] ? (
            <Badge
              variant="outline"
              className="shrink-0 font-medium"
              data-testid="bank-format-badge"
              title={FORMAT_META[script.format].blurb}
            >
              {formatLabel(script.format)}
            </Badge>
          ) : null}
          {script.product ? (
            <span>
              <span className="font-medium text-foreground">Product:</span>{" "}
              {script.product}
            </span>
          ) : null}
          {script.mainPainPoint ? (
            <span>
              <span className="font-medium text-foreground">Pain:</span>{" "}
              {script.mainPainPoint}
            </span>
          ) : null}
          {script.libraryUrl ? (
            <a
              href={script.libraryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
              data-testid="bank-live-ad-link"
            >
              View live ad <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-5 md:grid-cols-[200px_1fr]">
          <div className="md:sticky md:top-4 md:self-start">
            <ScriptImage src={script.image} alt={`${script.shortLabel} creative`} />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Verbatim copy
              </span>
              <CopyButton text={script.bodyMeta} />
            </div>
            <div
              data-testid="bank-script-body"
              className="max-h-[460px] overflow-y-auto rounded-lg border border-card-border bg-background p-4 font-mono text-[13px] leading-relaxed text-foreground"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {script.bodyMeta || (
                <span className="text-muted-foreground">No copy available.</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="gap-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 md:grid-cols-[200px_1fr]">
              <Skeleton className="aspect-[4/5] w-full rounded-lg" />
              <Skeleton className="h-[300px] w-full rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TslScriptBankContent() {
  const [state, setState] = useState<FetchState>("loading");
  const [brands, setBrands] = useState<BankBrand[]>([]);
  const [activeBrand, setActiveBrand] = useState<string>("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const res = await fetch("/tsl-bank.json", { cache: "no-cache" });
        if (res.status === 404) {
          if (!cancelled) setState("pending");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          if (!cancelled) setState("pending");
          return;
        }
        const parsed = normalizeBank(json);
        if (cancelled) return;
        setBrands(parsed);
        setActiveBrand((prev) =>
          prev && parsed.some((b) => b.brand === prev)
            ? prev
            : parsed[0]?.brand ?? ""
        );
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const totalScripts = useMemo(
    () => brands.reduce((n, b) => n + b.scripts.length, 0),
    [brands]
  );

  const header = (
    <div className="mb-6 flex flex-col gap-2 border-b border-card-border pb-5">
      <div className="flex items-center gap-2">
        <Library className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Script Bank</h1>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Proven, top-performing TSLs reverse-engineered from competitor ad
        libraries. Verbatim copy in Meta double-line-break format — read it,
        learn the shape, copy it straight into a post.
        {state === "ready" && totalScripts > 0
          ? ` ${totalScripts} script${totalScripts === 1 ? "" : "s"} across ${
              brands.length
            } brand${brands.length === 1 ? "" : "s"}.`
          : ""}
      </p>
    </div>
  );

  let body: React.ReactNode;
  if (state === "loading") {
    body = <LoadingState />;
  } else if (state === "pending") {
    body = (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <RefreshCw className="h-7 w-7 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="font-medium">Bank loading…</p>
            <p className="text-sm text-muted-foreground">
              The script bank is still being assembled. Check back in a moment.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            data-testid="bank-retry"
          >
            <RefreshCw /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  } else if (state === "error") {
    body = (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-7 w-7 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">Couldn't load the bank</p>
            <p className="text-sm text-muted-foreground">
              Something went wrong reading the script bank.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            data-testid="bank-retry"
          >
            <RefreshCw /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  } else if (brands.length === 0) {
    body = (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Library className="h-7 w-7 text-muted-foreground" />
          <p className="font-medium">No scripts in the bank yet</p>
          <p className="text-sm text-muted-foreground">
            Once scripts are added they'll appear here, grouped by brand.
          </p>
        </CardContent>
      </Card>
    );
  } else {
    const matchesFormat = (s: BankScript) => formatFilter === "all" || s.format === formatFilter;
    const formatCount = (fmt: string) =>
      brands.reduce((n, b) => n + b.scripts.filter((s) => fmt === "all" || s.format === fmt).length, 0);
    const FORMAT_FILTERS: { id: string; label: string }[] = [
      { id: "all", label: "All formats" },
      { id: "full-narrative-arc", label: "Full Narrative Arc" },
      { id: "lean-linear", label: "Lean Linear" },
      { id: "stakes-first-cold-open", label: "Stakes-First Cold-Open" },
    ];
    body = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5" data-testid="bank-format-filter">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Format:</span>
          {FORMAT_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormatFilter(f.id)}
              data-testid={`bank-format-filter-${f.id}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                formatFilter === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums opacity-70">{formatCount(f.id)}</span>
            </button>
          ))}
        </div>
        <Tabs value={activeBrand} onValueChange={setActiveBrand} className="w-full">
          <TabsList className="mb-2 h-auto flex-wrap justify-start">
            {brands.map((b) => {
              const count = b.scripts.filter(matchesFormat).length;
              return (
                <TabsTrigger key={b.brand} value={b.brand} data-testid={`bank-brand-tab-${b.brand}`}>
                  {b.brand}
                  <span className="ml-2 rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          {brands.map((b) => {
            const visible = b.scripts.filter(matchesFormat);
            return (
              <TabsContent key={b.brand} value={b.brand} className="space-y-6">
                {visible.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No {formatFilter === "all" ? "" : formatLabel(formatFilter) + " "}scripts for {b.brand}.
                  </p>
                ) : (
                  visible.map((s) => (
                    <ScriptCard key={`${b.brand}-${s.rank}-${s.shortLabel}`} script={s} />
                  ))
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        {header}
        {body}
      </div>
    </div>
  );
}

export default function TslScriptBankPage() {
  return (
    <DashboardLayout>
      <TslScriptBankContent />
    </DashboardLayout>
  );
}
