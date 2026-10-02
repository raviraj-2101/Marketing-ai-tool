import { useState } from "react";
import {
  Settings2,
  RefreshCcw,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Boxes,
  GitBranch,
  ShieldCheck,
  Code2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PIPELINE_API_BASE as API_BASE, pipelineQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";

interface TslSettingsPayload {
  chatModel: string;
  scriptAnalysisModel: string;
  promptFanoutModel: string;
  imageModel: string;
  pipelinePushEnabled: boolean;
  devMode: boolean;
  productConfigsRepo: string;
  productCount: number;
  githubTokenSet: boolean;
  anthropicKeySet: boolean;
}

export default function TslSettingsPage() {
  const { getToken } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const { data: cfg, isLoading, isError } = useQuery<TslSettingsPayload>({
    queryKey: ["/api/tsl/settings"],
    queryFn: pipelineQueryFn,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/tsl/refresh-configs`, {
        method: "POST",
        headers: { authorization: `Bearer ${getToken() || ""}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      setRefreshResult({
        ok: true,
        msg: `Cache cleared — ${data.cleared ?? 0} entries dropped. Next request re-fetches from GitHub.`,
      });
    } catch (err) {
      setRefreshResult({
        ok: false,
        msg: err instanceof Error ? err.message : "Refresh failed",
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">

          <header className="flex items-center gap-3">
            <Settings2 className="size-5 text-primary" />
            <h1 className="text-lg font-semibold">TSL Settings</h1>
            {isLoading && (
              <span className="text-xs text-muted-foreground ml-auto animate-pulse">Loading…</span>
            )}
            {isError && (
              <span className="text-xs text-destructive ml-auto">Failed to load settings</span>
            )}
          </header>

          {/* Models */}
          <section className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="size-4 text-primary" />
              <h2 className="text-sm font-medium">Models</h2>
            </div>
            <dl className="space-y-2.5">
              {(
                [
                  ["Chat model", cfg?.chatModel],
                  ["Script analysis model", cfg?.scriptAnalysisModel],
                  ["Prompt fanout model", cfg?.promptFanoutModel],
                  ["Image model", cfg?.imageModel],
                ] as [string, string | undefined][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-foreground bg-muted/50 px-2 py-0.5 rounded text-[11px]">
                    {value ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* API Keys */}
          <section className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="size-4 text-primary" />
              <h2 className="text-sm font-medium">API Keys</h2>
            </div>
            <dl className="space-y-2.5">
              {(
                [
                  ["Anthropic API key", cfg?.anthropicKeySet],
                  ["GitHub token", cfg?.githubTokenSet],
                ] as [string, boolean | undefined][]
              ).map(([label, set]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd
                    className={
                      set === undefined
                        ? "text-muted-foreground"
                        : set
                          ? "font-medium text-emerald-400"
                          : "font-medium text-destructive"
                    }
                  >
                    {set === undefined ? "—" : set ? "Set ✓" : "Missing — add to .env"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Pipeline push */}
          <section className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Boxes className="size-4 text-primary" />
              <h2 className="text-sm font-medium">Pipeline push</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              When disabled, every push creates a dry-run with synthesized{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">DRY-xxxxxx</code> ad IDs.
              Enable by setting{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">PIPELINE_PUSH_ENABLED=true</code>{" "}
              in the server{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">.env</code>.
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Current state:</span>
              {cfg === undefined ? (
                <span className="text-muted-foreground">—</span>
              ) : cfg.pipelinePushEnabled ? (
                <span className="font-semibold text-emerald-400">Live — pushes to pipeline</span>
              ) : (
                <span className="font-semibold text-amber-400">Dry-run only</span>
              )}
            </div>
          </section>

          {/* Product configs cache */}
          <section className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="size-4 text-primary" />
              <h2 className="text-sm font-medium">Product configs cache</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Source repo:{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                {cfg?.productConfigsRepo ?? "Acentecom/product-configs"}
              </code>
              {cfg?.productCount !== undefined && (
                <>
                  {" "}·{" "}
                  <span className="text-foreground font-medium">{cfg.productCount}</span>{" "}
                  products currently visible in the picker
                </>
              )}
            </p>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 bg-primary/10 hover:bg-primary/20 disabled:opacity-50 text-primary px-3 py-2 rounded-md text-xs font-medium transition-colors"
            >
              <RefreshCcw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
              {refreshing ? "Refreshing…" : "Refresh from product-configs"}
            </button>
            {refreshResult && (
              <div
                className={`mt-3 flex items-start gap-2 text-xs ${
                  refreshResult.ok ? "text-emerald-400" : "text-destructive"
                }`}
              >
                {refreshResult.ok ? (
                  <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                )}
                <p>{refreshResult.msg}</p>
              </div>
            )}
          </section>

          {/* Dev mode — only shown when DEV_MODE=1 on server */}
          {cfg?.devMode && (
            <section className="bg-card border border-amber-500/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Code2 className="size-4 text-amber-400" />
                <h2 className="text-sm font-medium text-amber-400">Dev mode</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">DEV_MODE=1</code> is
                active on the server. The following debug endpoints are available:
              </p>
              <ul className="text-[11px] font-mono text-muted-foreground space-y-1.5">
                <li>
                  <span className="text-primary/70">GET</span>{" "}
                  /api/tsl/debug-env — verify which env vars are loaded
                </li>
                <li>
                  <span className="text-primary/70">GET</span>{" "}
                  /api/tsl/_debug/product-facts/:slug — inspect parsed product config
                </li>
              </ul>
            </section>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
