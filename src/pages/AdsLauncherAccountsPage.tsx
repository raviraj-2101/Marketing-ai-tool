import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api, AudienceTemplate, FbPage, IgAccount, MetaAccount, Pixel, Product } from "@/features/ads-launcher/lib/api";
import { useBrands } from "@/hooks/useBrands";
import { UniversalMetaEditor, type UniversalPreset } from "@/pages/UploadPresetsPage";
import { EmptyState, ListSkeleton, Plus } from "@/features/ads-launcher/components/ListShells";
import { useConfirm } from "@/features/ads-launcher/components/Confirm";
import { useToast } from "@/features/ads-launcher/components/Toast";
import { useOnlineStatus } from "@/features/ads-launcher/lib/online";
import { brandChipClasses } from "@/features/ads-launcher/lib/brandColor";

export default function AccountsPage() {
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ["meta-accounts"],
    queryFn: () => api.get<{ ok: boolean; accounts: MetaAccount[] }>("/api/meta-accounts"),
  });
  const accounts = (Array.isArray(accountsData) ? accountsData : accountsData?.accounts) ?? [];
  // Cycle 418 — brand filter for the sidebar. Empty = show all. Lets
  // the operator narrow to one brand's accounts when they have many.
  const { data: brands = [] } = useBrands();
  const [brandFilter, setBrandFilter] = useState<string>("");
  const filteredAccounts = brandFilter
    ? accounts.filter((a) => (a.allowed_brand_ids ?? []).includes(brandFilter))
    : accounts;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = filteredAccounts.find((a) => a.id === selectedId) ?? filteredAccounts[0] ?? null;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Meta Accounts</h1>
      </div>
      {/* Cycle 367 — Universal Standard editor surfaced at the top of
          Accounts so the singleton can be tuned without a separate page.
          New accounts auto-copy this on import; per-account rows reset
          back to it via the "Reset to Universal Standard" button below. */}
      <UniversalStandardCard />
      {isLoading ? (
        <div className="al-card">
          <ListSkeleton rows={3} />
        </div>
      ) : accounts.length === 0 ? (
        <div className="al-card">
          <EmptyState
            icon={<Plus />}
            title="Add your first Meta account"
            description="A Meta ad account is the parent of pixels, FB Pages, IG accounts, and audience templates. Add one to start launching."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          <div>
            {brands.length > 0 && (
              <div className="al-card mb-2 py-2 px-3">
                <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1">Brand filter</label>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setBrandFilter("")}
                    className={`chip text-[10px] ${brandFilter === "" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}
                  >
                    All
                  </button>
                  {brands.map((b) => {
                    // Cycle 467 — count accounts scoped to this brand
                    // for the chip badge. allowed_brand_ids empty =
                    // "all brands"; those aren't attributed to any
                    // single brand, so we count exact matches only.
                    const count = accounts.filter((a) => (a.allowed_brand_ids ?? []).includes(b.id)).length;
                    const active = brandFilter === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBrandFilter(b.id)}
                        className={`chip text-[10px] ${active ? "bg-brand-500 text-white border-brand-500" : `${brandChipClasses(b.name)} hover:opacity-80`}`}
                        title={`${count} account${count === 1 ? "" : "s"} scoped to ${b.name}`}
                      >
                        {b.name}
                        <span className={`ml-1 font-mono text-[9px] ${active ? "opacity-80" : "opacity-60"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <AccountSidebar accounts={filteredAccounts} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          </div>
          {selected && <AccountDetail key={selected.id} account={selected} />}
        </div>
      )}
    </div>
  );
}

function AccountSidebar({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: MetaAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  // Manual "+ Add Account" removed — ad accounts now come exclusively from
  // Refresh-from-Meta which pulls `/me/adaccounts` and inserts every ad
  // account the System User token can see. Operators no longer need to
  // type act_<id>s by hand. The Edit modal (on AccountDetail) is still used
  // to tweak local-only metadata: allowed_product_ids, notes, helper_copy.
  const [refreshResult, setRefreshResult] = useState<null | {
    added: any[];
    already_synced: any[];
    renamed?: { account_id: string; local_name: string; meta_name: string }[];
    error?: string;
  }>(null);
  const refresh = useMutation({
    mutationFn: () => api.post<any>("/api/meta-accounts/refresh-from-meta"),
    onSuccess: (r) => {
      setRefreshResult(r);
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      // Auto-dismiss only when nothing actionable came back. If there are
      // added rows OR rename-drift entries, keep the panel up so the
      // operator can act on it.
      const hasNews = (r?.added?.length ?? 0) > 0 || (r?.renamed?.length ?? 0) > 0;
      if (!hasNews) setTimeout(() => setRefreshResult(null), 4000);
    },
    onError: (e: any) => setRefreshResult({ added: [], already_synced: [], error: e?.message ?? "Sync failed" }),
  });
  return (
    <div className="al-card p-3">
      <button
        className="btn-primary w-full mb-2"
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        title="Pull every ad account the System User token can see from /me/adaccounts and add new ones. Existing rows are preserved."
      >
        {refresh.isPending ? "Refreshing from Meta…" : "↻ Refresh from Meta"}
      </button>
      {refreshResult && (
        <div className={`mb-3 rounded-md border px-2 py-1.5 text-[11px] ${
          refreshResult.error ? "border-rose-200 bg-rose-50 text-rose-800"
          : refreshResult.added.length > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : (refreshResult.renamed?.length ?? 0) > 0 ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
        }`}>
          {refreshResult.error ? (
            <div className="space-y-1">
              <div>Sync failed: {refreshResult.error}</div>
              {/* Cycle 158 — when Meta returns nothing, the most common
                  root cause is a stale SYSTEM_USER token. Point operators
                  at the place to check rather than just showing a generic
                  failure message. */}
              <div className="opacity-80">
                Check the Meta token health pill on <a href="/dev" className="underline hover:no-underline">Dev Overview</a>, or open Business Manager to re-issue the System User token.
              </div>
            </div>
          ) : refreshResult.added.length === 0
              && refreshResult.already_synced.length === 0
              && (refreshResult.renamed?.length ?? 0) === 0 ? (
            // Cycle 158 — Meta returned zero accounts. Either the token
            // doesn't have ads_read scope on any BM, or the operator is
            // looking at a BM with no accounts. Explicit empty state with
            // next steps.
            <div className="space-y-1">
              <div className="font-semibold">Meta returned no ad accounts.</div>
              <div className="opacity-80">
                The System User token may have lost ads_read on every Business Manager. Check the Meta token health pill on <a href="/dev" className="underline hover:no-underline">Dev Overview</a> and re-issue if needed.
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div>
                <span className="font-semibold">{refreshResult.added.length} added</span>
                <span className="opacity-70"> · {refreshResult.already_synced.length} already synced</span>
                {(refreshResult.renamed?.length ?? 0) > 0 && (
                  <span className="opacity-70"> · {refreshResult.renamed!.length} renamed in Meta</span>
                )}
              </div>
              {(refreshResult.renamed?.length ?? 0) > 0 && (
                <details className="text-[10.5px] leading-snug">
                  <summary className="cursor-pointer font-medium hover:underline">
                    {refreshResult.renamed!.length} renamed by Meta — auto-updated
                  </summary>
                  <ul className="mt-1.5 space-y-1 pl-2">
                    {refreshResult.renamed!.map((r) => (
                      <li key={r.account_id} className="font-mono">
                        <span className="opacity-70">act_{r.account_id}:</span>{" "}
                        <span className="line-through opacity-60">{r.local_name}</span>{" "}
                        → <span className="font-semibold">{r.meta_name}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
      {/* Cycle 186 — sidebar count + jump-to-search. Lets operators
          search the list instead of scrolling; the count gives a sense
          of how many accounts the System User token is seeing. */}
      <div className="text-[10px] text-slate-500 mt-3 mb-1.5 font-mono uppercase tracking-wider">
        {accounts.length} account{accounts.length === 1 ? "" : "s"}
      </div>
      <SidebarFilterableList accounts={accounts} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

// Cycle 186 — searchable sidebar. Only renders the filter input when the
// list is >5 accounts (operators with 2-3 accounts don't need a search).
function SidebarFilterableList({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: MetaAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? accounts.filter((a) =>
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        a.meta_account_id.includes(q),
      )
    : accounts;
  return (
    <>
      {accounts.length > 5 && (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter accounts…"
          className="w-full text-xs px-2 py-1 mb-2 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-300 outline-none"
        />
      )}
      <div className="space-y-1">
        {filtered.map((a) => (
          <button
            key={a.id}
            className={`w-full text-left px-3 py-2 rounded-md text-sm ${
              a.id === selectedId ? "bg-brand-500 text-white" : "hover:bg-slate-100 text-slate-700"
            }`}
            onClick={() => onSelect(a.id)}
          >
            <div className="font-medium">{a.name}</div>
            <div className={`text-xs font-mono ${a.id === selectedId ? "text-white/80" : "text-slate-500"}`}>
              {a.meta_account_id}
            </div>
            {/* Cycle 198 — wired-counts pill. Hidden when zero on all
                fronts (fresh import). Same color in active + inactive
                state, just opacity-adjusted. */}
            {(() => {
              const parts: string[] = [];
              if ((a.pixel_count ?? 0) > 0) parts.push(`${a.pixel_count}px`);
              if ((a.fb_page_count ?? 0) > 0) parts.push(`${a.fb_page_count}fb`);
              if ((a.ig_count ?? 0) > 0) parts.push(`${a.ig_count}ig`);
              if ((a.audience_count ?? 0) > 0) parts.push(`${a.audience_count}aud`);
              if (parts.length === 0) return null;
              return (
                <div className={`text-[10px] font-mono mt-1 ${a.id === selectedId ? "text-white/70" : "text-slate-400"}`}>
                  {parts.join(" · ")}
                </div>
              );
            })()}
          </button>
        ))}
        {filtered.length === 0 && q.trim() && (
          <div className="text-[11px] text-slate-400 italic px-3 py-2">
            No accounts match "{q}"
          </div>
        )}
      </div>
    </>
  );
}

function AccountDetail({ account }: { account: MetaAccount }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<MetaAccount> | null>(null);
  // Cycle 242 — "Pull all from Meta" mega-button for fresh accounts.
  // Fires pixels + fb-pages + ig refreshes in parallel.
  const pullAll = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled([
        api.post<any>(`/api/pixels/refresh-from-meta?meta_account_id=${account.id}`),
        api.post<any>(`/api/fb-pages/refresh-from-meta?meta_account_id=${account.id}`),
        api.post<any>(`/api/ig-accounts/refresh-from-meta?meta_account_id=${account.id}`),
      ]);
      let added = 0;
      const errs: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          added += (r.value?.added?.length ?? 0);
        } else {
          errs.push(String((r.reason as any)?.message ?? r.reason));
        }
      }
      return { added, errs };
    },
    onSuccess: ({ added, errs }) => {
      qc.invalidateQueries({ queryKey: ["pixels", account.id] });
      qc.invalidateQueries({ queryKey: ["fb-pages", account.id] });
      qc.invalidateQueries({ queryKey: ["ig-accounts", account.id] });
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      if (errs.length > 0) {
        toast("error", `Pulled ${added} new rows; ${errs.length} endpoint${errs.length === 1 ? "" : "s"} errored.`);
      } else {
        toast("success", `Pulled ${added} new rows across pixels, pages, IG.`);
      }
    },
  });
  // Cycle 343 — brand list for the scoping checkboxes. Empty
  // allowed_brand_ids = available to every brand (admin default).
  // The product list stays loaded for the deprecated product-scope
  // display until the cutover is complete on every consumer page.
  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<{ ok: boolean; products: Product[] }>("/api/products"),
  });
  const { data: brands = [] } = useBrands();
  const products = (Array.isArray(productsData) ? productsData : productsData?.products) ?? [];
  const update = useMutation({
    mutationFn: (a: Partial<MetaAccount>) => api.put(`/api/meta-accounts/${account.id}`, a),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-accounts"] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: () => api.del(`/api/meta-accounts/${account.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-accounts"] }),
  });

  return (
    <div className="space-y-6">
      <div className="al-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-slate-900 text-lg">{account.name}</div>
            <div className="font-mono text-xs text-slate-500 mt-1">act_{account.meta_account_id}</div>
            {/* Cycle 394 — last-synced timestamp from the AdManage
                mirror. Tells operators how stale their pixel/page/IG
                dropdowns might be without forcing them to click Pull. */}
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
              {account.timezone_name && (
                <span className="font-mono">tz: {account.timezone_name}</span>
              )}
              {account.admanage_last_synced && (() => {
                const ageMs = Date.now() - new Date(account.admanage_last_synced).getTime();
                const ageH = Math.floor(ageMs / 3600_000);
                const ageM = Math.floor((ageMs % 3600_000) / 60_000);
                const ageLabel = ageH > 0 ? `${ageH}h ${ageM}m ago` : `${ageM}m ago`;
                const stale = ageMs > 24 * 3600_000;
                return (
                  <span
                    className={`px-1.5 py-0.5 rounded border ${
                      stale ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                    title={`Last AdManage sync at ${new Date(account.admanage_last_synced).toLocaleString()}${stale ? " — stale, consider Pull all from Meta" : ""}`}
                  >
                    synced {ageLabel}
                  </span>
                );
              })()}
              {/* Cycle 434 — launch activity chips per account. */}
              {(account.launches_total ?? 0) > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200"
                  title={
                    account.last_launched_at
                      ? `Last launch ${new Date(account.last_launched_at).toLocaleString()}`
                      : "No launches"
                  }
                >
                  {account.launches_total} launches
                  {(account.launches_last_7d ?? 0) > 0 && (
                    <span className="text-emerald-700 font-medium ml-1">· {account.launches_last_7d} this week</span>
                  )}
                </span>
              )}
            </div>
            {account.notes && <div className="text-sm text-slate-600 mt-2">{account.notes}</div>}
            {/* Cycle 343 — brand-scope replaces product-scope. The
                product scope still exists in the DB for compatibility
                but the operator's UI is brand-only (CRM scoping rule). */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Available for brand:</span>
              {(account.allowed_brand_ids?.length ?? 0) === 0 ? (
                <span className="text-[11px] text-slate-500 italic">every brand (no scope set)</span>
              ) : (
                account.allowed_brand_ids!.map((bid) => {
                  const b = brands.find((x) => x.id === bid);
                  return (
                    <span key={bid} className="text-[10px] px-1.5 py-0.5 rounded border border-brand-200 bg-brand-50 text-brand-800">
                      {b ? b.name : bid.slice(0, 8)}
                    </span>
                  );
                })
              )}
            </div>
          </div>
          {/* Cycle 180 — Delete removed entirely (Meta-imported, refresh-
              only). Edit renamed to "Scope products" since the modal's
              only editable field is now the product-allowlist; Display
              Name (C148), Ad Account ID (C129), and Notes are all Meta-
              sourced or auto-imported. */}
          <div className="flex gap-2">
            {/* Cycle 242 — single button to pull pixels + pages + IG
                in parallel. Most useful right after refreshing accounts
                for the first time. */}
            <button
              className="btn-secondary"
              onClick={() => pullAll.mutate()}
              disabled={pullAll.isPending}
              title="Refresh Pixels, FB Pages, and Instagram from Meta in one shot."
            >
              {pullAll.isPending ? "Pulling…" : "↻ Pull all from Meta"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setEditing(account)}
              title="Tick which brands this ad account belongs to. Media buyers assigned to a brand only see the ad accounts scoped to that brand."
            >
              Scope brands
            </button>
          </div>
        </div>
      </div>

      {/* Cycle 360 — operator removed Audience + Targeting Templates
          sections. Per-launch targeting (incl/excl/age/gender) now lives
          ONLY on the launcher page; rarely-reused so a per-account
          template store was overhead. */}
      <AccountPresetSection accountId={account.id} accountName={account.name} />
      <PixelsSection accountId={account.id} />
      <FbPagesSection accountId={account.id} />
      <IgAccountsSection accountId={account.id} />

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2 className="text-lg font-bold mb-4">Edit Meta Account</h2>
          <div className="space-y-3">
            {/* Cycle 148 — Display Name is read-only too. The whole account
                row is sourced from Meta via Refresh-from-Meta; letting
                operators rename it locally creates a drift between what
                Meta shows and what this tool shows that the existing
                rename-drift detection (Cycle 129 Round 8) keeps having to
                flag. Source of truth is Meta — render their name as fact. */}
            <Field label="Display Name">
              <div className="al-input bg-slate-50 text-slate-700 cursor-not-allowed select-all"
                   title="Read-only — comes from Meta. Edit it in Business Manager and click Refresh from Meta to pull the new name.">
                {editing.name ?? ""}
              </div>
            </Field>
            {/* Ad Account ID is the join key for pixels/pages/audiences/launches —
                editing it would orphan every downstream wiring. With Refresh-from-Meta
                now the only way to create accounts (Cycle 128), the ID always
                comes from Meta and should never be hand-edited. Rendered as
                read-only text so operators can still verify which account they're
                editing without footguns. */}
            <Field label="Ad Account ID">
              <div className="al-input font-mono bg-slate-50 text-slate-700 cursor-not-allowed select-all"
                   title="Read-only — Ad Account ID comes from Meta. Use 'Delete' if this account shouldn't be here, then Refresh from Meta to re-pull.">
                act_{editing.meta_account_id}
              </div>
            </Field>
            <Field label="Notes">
              <textarea className="al-input" rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            {/* Cycle 343 — brand-scope picker replaces product-scope.
                Many-to-many: an ad account can be on multiple brands. */}
            <Field label="Available for brands">
              <div className="text-[11px] text-slate-500 mb-1.5 flex items-baseline justify-between gap-2">
                <span>Tick the brands this ad account belongs to. Leave all unticked = available to every brand (admin/global). Media buyers later see only ad accounts scoped to brands they're assigned to.</span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {editing.allowed_brand_ids?.length ?? 0} ticked
                </span>
              </div>
              <div className="space-y-1.5 border border-slate-200 rounded-md p-2 bg-slate-50 max-h-72 overflow-auto">
                {brands.map((b) => {
                  const allowed = editing.allowed_brand_ids ?? [];
                  const checked = allowed.includes(b.id);
                  return (
                    <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...allowed, b.id]
                            : allowed.filter((id) => id !== b.id);
                          setEditing({ ...editing, allowed_brand_ids: next });
                        }}
                      />
                      <span className="text-slate-700">{b.name}</span>
                    </label>
                  );
                })}
                {brands.length === 0 && <div className="text-[11px] text-slate-400 italic">No brands configured yet.</div>}
              </div>
            </Field>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={update.isPending} onClick={() => update.mutate(editing)}>{update.isPending ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PixelsSection({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { data: pixelsData, isLoading } = useQuery({
    queryKey: ["pixels", accountId],
    queryFn: () => api.get<{ ok: boolean; pixels: Pixel[] }>(`/api/pixels?meta_account_id=${accountId}`),
  });
  const pixels = (Array.isArray(pixelsData) ? pixelsData : pixelsData?.pixels) ?? [];
  const [editing, setEditing] = useState<Partial<Pixel> | null>(null);
  const save = useMutation({
    mutationFn: (p: Partial<Pixel>) =>
      p.id ? api.put(`/api/pixels/${p.id}`, p) : api.post("/api/pixels", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pixels", accountId] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/pixels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pixels", accountId] }),
  });

  return (
    <div className="al-card relative">
      <SectionHeader
        title="Pixels"
        // + Add removed (Cycle 128) — pixels come ONLY from Refresh-from-Meta
        // now. Edit on individual rows still works for local-only metadata
        // (notes, allowed_product_ids). Operator's words: "Should be no Add
        // buttons only refresh, as it should always import all the assets
        // connected to this ad account."
        extra={<RefreshFromMetaButton accountId={accountId} endpoint="/api/pixels/refresh-from-meta" label="Pixels" invalidateQueryKey={["pixels", accountId]} />}
      />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : pixels.length === 0 ? (
        <div className="text-sm text-slate-500">No pixels yet — click Refresh from Meta.</div>
      ) : (
        <div className="divide-y">
          {pixels.map((p) => (
            // Cycle 180 — Edit/Delete removed; Meta-imported, refresh-only.
            <Row
              key={p.id}
              title={p.name}
              subtitle={`pixel_id: ${p.pixel_id}${p.notes ? ` · ${p.notes}` : ""}`}
            />
          ))}
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2 className="text-lg font-bold mb-4">{editing.id ? "Edit" : "Add"} Pixel</h2>
          <div className="space-y-3">
            <Field label="Name" required>
              <input className="al-input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Pixel ID" required>
              <input className="al-input font-mono" value={editing.pixel_id ?? ""} onChange={(e) => setEditing({ ...editing, pixel_id: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className="al-input" rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            {save.isError && <div className="text-sm text-red-600">{(save.error as Error).message}</div>}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending || !editing.name?.trim() || !editing.pixel_id?.trim()} onClick={() => save.mutate({ ...editing, meta_account_id: accountId })}>{save.isPending ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FbPagesSection({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { data: pagesData, isLoading } = useQuery({
    queryKey: ["fb-pages", accountId],
    queryFn: () => api.get<{ ok: boolean; pages: FbPage[] }>(`/api/fb-pages?meta_account_id=${accountId}`),
  });
  const pages = (Array.isArray(pagesData) ? pagesData : pagesData?.pages) ?? [];
  const [editing, setEditing] = useState<Partial<FbPage> | null>(null);
  const save = useMutation({
    mutationFn: (p: Partial<FbPage>) =>
      p.id ? api.put(`/api/fb-pages/${p.id}`, p) : api.post("/api/fb-pages", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-pages", accountId] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/fb-pages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fb-pages", accountId] }),
  });

  return (
    <div className="al-card relative">
      <SectionHeader
        title="Facebook Pages"
        // + Add removed (Cycle 128) — pages come ONLY from Refresh-from-Meta.
        extra={<RefreshFromMetaButton accountId={accountId} endpoint="/api/fb-pages/refresh-from-meta" label="Pages" invalidateQueryKey={["fb-pages", accountId]} />}
      />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : pages.length === 0 ? (
        <div className="text-sm text-slate-500">No FB pages yet — click Refresh from Meta.</div>
      ) : (
        <div className="divide-y">
          {pages.map((p) => (
            // Cycle 180 — Edit/Delete removed; Meta-imported, refresh-only.
            <Row
              key={p.id}
              title={p.name}
              subtitle={`page_id: ${p.page_id}${p.helper_copy ? ` · ${p.helper_copy}` : ""}`}
            />
          ))}
        </div>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2 className="text-lg font-bold mb-4">{editing.id ? "Edit" : "Add"} Facebook Page</h2>
          <div className="space-y-3">
            <Field label="Page Name" required><input className="al-input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Page ID" required><input className="al-input font-mono" value={editing.page_id ?? ""} onChange={(e) => setEditing({ ...editing, page_id: e.target.value })} /></Field>
            <Field label="Helper Copy"><textarea className="al-input" rows={2} value={editing.helper_copy ?? ""} onChange={(e) => setEditing({ ...editing, helper_copy: e.target.value })} /></Field>
            {save.isError && <div className="text-sm text-red-600">{(save.error as Error).message}</div>}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={save.isPending || !editing.name?.trim() || !editing.page_id?.trim()} onClick={() => save.mutate({ ...editing, meta_account_id: accountId })}>{save.isPending ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function IgAccountsSection({ accountId }: { accountId: string }) {
  const { data: igAccountsData, isLoading } = useQuery({
    queryKey: ["ig-accounts", accountId],
    queryFn: () => api.get<{ ok: boolean; ig_accounts: IgAccount[] }>(`/api/ig-accounts?meta_account_id=${accountId}`),
  });
  const pages = (Array.isArray(igAccountsData) ? igAccountsData : igAccountsData?.ig_accounts) ?? [];
  // Cycle 179 — IG Accounts now mirror FB Pages: import-only. Refresh-
  // from-Meta replaces "+ Add"; Edit/Delete buttons removed since IG
  // accounts come from Meta (via promote_pages{instagram_business_account})
  // and have no operator-set fields.
  return (
    <div className="al-card">
      <SectionHeader
        title="Instagram Accounts"
        extra={<RefreshFromMetaButton accountId={accountId} endpoint="/api/ig-accounts/refresh-from-meta" label="IG accounts" invalidateQueryKey={["ig-accounts", accountId]} />}
      />
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : pages.length === 0 ? (
        <div className="text-sm text-slate-500">No IG accounts yet — click Refresh from Meta.</div>
      ) : (
        <div className="divide-y">
          {pages.map((p) => (
            <Row
              key={p.id}
              title={p.handle}
              subtitle={`ig_id: ${p.instagram_id}${p.helper_copy ? ` · ${p.helper_copy}` : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, onAdd, extra }: { title: string; onAdd?: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 gap-2">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <div className="flex items-center gap-2 shrink-0">
        {extra}
        {onAdd && <button className="btn-secondary text-xs" onClick={onAdd}>+ Add</button>}
      </div>
    </div>
  );
}

/**
 * "Refresh from Meta" button — POSTs to a refresh endpoint that pulls
 * live from Meta Graph and reports added/already_synced/broken_connections.
 *
 * Shows an inline toast-style strip with the result for ~6s. Broken
 * connections (local rows that Meta no longer recognizes — revoked
 * page assignment, deleted pixel, etc.) get an amber alert that stays
 * visible until the operator dismisses or refreshes the page.
 */
function RefreshFromMetaButton({ accountId, endpoint, label, invalidateQueryKey }: {
  accountId: string;
  endpoint: string; // e.g. "/api/fb-pages/refresh-from-meta"
  label: string;    // "Pages" or "Pixels"
  invalidateQueryKey: (string | undefined)[];
}) {
  const qc = useQueryClient();
  // Cycle 192 — disable when offline. Operators on flaky office wifi
  // were getting a useless "TypeError: NetworkError" toast every click.
  const online = useOnlineStatus();
  const [result, setResult] = useState<null | {
    added: any[];
    already_synced: any[];
    broken_connections: any[];
    error?: string;
  }>(null);
  const sync = useMutation({
    mutationFn: () => api.post<any>(`${endpoint}?meta_account_id=${accountId}`),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: invalidateQueryKey });
      // Auto-clear the success state after 6s, but keep broken-connection
      // warnings until the operator dismisses them.
      if (!r?.broken_connections?.length) {
        setTimeout(() => setResult(null), 6000);
      }
    },
    onError: (e: any) => {
      setResult({ added: [], already_synced: [], broken_connections: [], error: e?.message ?? "Sync failed" });
    },
  });
  return (
    <>
      <button
        type="button"
        className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        onClick={() => sync.mutate()}
        disabled={sync.isPending || !online}
        title={!online
          ? "You're offline — reconnect to refresh from Meta."
          : `Pull live ${label} from Meta. Adds new ones, leaves existing untouched, alerts on broken connections.`}
      >
        {!online ? "↻ Offline" : sync.isPending ? "Syncing…" : "↻ Refresh from Meta"}
      </button>
      {result && (
        <div className="absolute right-0 mt-9 z-10 w-72 rounded-md border bg-white shadow-lg p-2 text-[11px] space-y-1.5"
             style={{ borderColor: result.error ? "rgb(254 202 202)" : result.broken_connections.length ? "rgb(253 230 138)" : "rgb(167 243 208)" }}>
          {result.error ? (
            <div className="text-rose-700">
              <span className="font-semibold">Sync failed:</span> {result.error}
            </div>
          ) : (
            <>
              <div className="text-slate-700">
                <span className="font-semibold text-emerald-700">{result.added.length} added</span>
                <span className="text-slate-400"> · {result.already_synced.length} already synced</span>
              </div>
              {result.broken_connections.length > 0 && (
                <div className="text-amber-800 border-t border-amber-100 pt-1.5">
                  <div className="font-semibold mb-0.5">⚠ {result.broken_connections.length} broken connection{result.broken_connections.length === 1 ? "" : "s"}</div>
                  <div className="text-[10px] text-amber-700">Meta no longer lists these for this account. Either reassign them in Business Manager or delete them locally:</div>
                  <ul className="mt-0.5 list-disc pl-4 text-[10px]">
                    {result.broken_connections.map((b: any) => (
                      <li key={b.id} className="font-mono truncate">{b.name} <span className="text-amber-500">({b.page_id ?? b.pixel_id})</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                type="button"
                className="text-[10px] text-slate-500 hover:text-slate-900 underline"
                onClick={() => setResult(null)}
              >
                dismiss
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

// Cycle 180 — `onEdit` / `onDelete` made optional. Meta-imported rows
// (pixels / FB pages / IG) render without action buttons since they
// shouldn't be hand-edited or hand-deleted — they re-import from Meta.
// Audience templates (operator-defined) still pass both handlers in.
function Row({ title, subtitle, onEdit, onDelete }: { title: string; subtitle?: string; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="py-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium text-slate-900 truncate">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 font-mono truncate">{subtitle}</div>}
      </div>
      {(onEdit || onDelete) && (
        <div className="flex gap-2 shrink-0">
          {onEdit && <button className="btn-secondary text-xs" onClick={onEdit}>Edit</button>}
          {onDelete && <button className="btn-danger text-xs" onClick={onDelete}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="al-label">{label}{required ? " *" : ""}</label>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Audience Templates — used to be a standalone /audiences page. They actually
 * belong to a Meta account (each lives under one ad account's tokens/pixels),
 * so we host them inline here per account, alongside Pixels / FB Pages / IG.
 */
function AudienceTemplatesSection({ accountId, accountName }: { accountId: string; accountName: string }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { data: allData, isLoading } = useQuery({
    queryKey: ["audience-templates", accountId],
    queryFn: () => api.get<{ ok: boolean; audience_templates: AudienceTemplate[] }>(`/api/audience-templates`),
  });
  const all = allData?.audience_templates ?? [];
  // Filter to this account only.
  const list = all.filter((a) => a.meta_account_id === accountId);
  const [editing, setEditing] = useState<Partial<AudienceTemplate> | null>(null);

  const save = useMutation({
    mutationFn: (a: Partial<AudienceTemplate>) =>
      a.id ? api.put(`/api/audience-templates/${a.id}`, a) : api.post("/api/audience-templates", a),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-templates", accountId] });
      qc.invalidateQueries({ queryKey: ["audience-templates"] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/audience-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audience-templates", accountId] });
      qc.invalidateQueries({ queryKey: ["audience-templates"] });
    },
  });

  return (
    <div className="al-card mb-4">
      <SectionHeader
        title="Audience Templates"
        onAdd={() =>
          setEditing({
            meta_account_id: accountId,
            name: "",
            pixel_id: null,
            include_audiences: [],
            exclude_audiences: [],
          })
        }
      />
      {isLoading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-slate-500">
          No audience templates yet for {accountName}. Add saved audience bundles (include / exclude) you commonly reuse at launch.
        </div>
      ) : (
        <div className="divide-y">
          {list.map((a) => (
            <div key={a.id} className="py-2 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm text-slate-900">{a.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {a.include_audiences.length} include · {a.exclude_audiences.length} exclude{a.pixel_name ? ` · pixel ${a.pixel_name}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="btn-icon hover:!text-brand-600" title="Edit" aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
                <button
                  className="btn-icon hover:!text-red-600 hover:!bg-red-50"
                  title="Delete"
                  aria-label={`Delete ${a.name}`}
                  onClick={async () => {
                    if (await confirmAct({ title: `Delete "${a.name}"?`, tone: "danger", confirmLabel: "Delete" })) del.mutate(a.id);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h3 className="text-lg font-bold mb-4">{editing.id ? "Edit" : "Add"} Audience Template</h3>
          <div className="space-y-3">
            <Field label="Name" required>
              <input className="al-input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            {/* Cycle 181 — replaced free-form textarea with a live-Meta
                multi-select. Operators no longer paste raw audience IDs;
                they pick from the actual custom audiences attached to
                this Meta ad account. Falls back to the free-form list
                only when Meta returns an error (so legacy templates
                with non-Meta-resolvable IDs still render). */}
            <AudiencePicker
              accountId={accountId}
              label="Include audiences"
              selected={editing.include_audiences ?? []}
              onChange={(v) => setEditing({ ...editing, include_audiences: v })}
            />
            <AudiencePicker
              accountId={accountId}
              label="Exclude audiences"
              selected={editing.exclude_audiences ?? []}
              onChange={(v) => setEditing({ ...editing, exclude_audiences: v })}
            />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={save.isPending || !editing.name?.trim()}
                onClick={() => save.mutate({ ...editing, meta_account_id: accountId })}
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Cycle 181 — multi-select audience picker. Lives next to the audience-
 * template editor. Loads live custom audiences via `/api/audience-
 * templates/meta-audiences?meta_account_id=<uuid>`. Operator searches +
 * ticks; selected IDs are kept in the template's include/exclude array.
 *
 * Gracefully falls back to a free-form chip list when Meta returns an
 * error (lets legacy templates with hand-typed IDs still surface).
 */
function AudiencePicker({
  accountId,
  label,
  selected,
  onChange,
}: {
  accountId: string;
  label: string;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["meta-audiences", accountId],
    queryFn: () => api.get<{
      ok: boolean;
      error: string | null;
      audiences: { audience_id: string; name: string; approximate_count: number | null; subtype: string | null; delivery_status: string | null }[];
    }>(`/api/audience-templates/meta-audiences?meta_account_id=${accountId}`),
    enabled: !!accountId,
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");
  const audiences = data?.audiences ?? [];
  const byId = new Map(audiences.map((a) => [a.audience_id, a]));
  const filtered = q.trim()
    ? audiences.filter((a) =>
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        a.audience_id.includes(q),
      )
    : audiences;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  // Selected IDs that don't resolve to a live audience — show as raw chip
  // so the operator knows the legacy ID is still saved on the template.
  const unresolved = selected.filter((id) => !byId.has(id));
  return (
    <Field label={label}>
      <div className="border border-slate-200 rounded-md bg-slate-50 p-2 space-y-1.5">
        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Cycle 247 — Clear-all link when 3+ chips. */}
            {selected.length >= 3 && (
              <button
                type="button"
                className="text-[10px] text-rose-700 hover:text-rose-900 underline decoration-dotted shrink-0"
                onClick={() => onChange([])}
              >
                Clear all ({selected.length})
              </button>
            )}
            {selected.map((id) => {
              const a = byId.get(id);
              return (
                <span
                  key={id}
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                    a ? "bg-brand-50 border-brand-200 text-brand-800" : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                  title={a ? `${a.audience_id}${a.approximate_count != null ? ` · ~${a.approximate_count.toLocaleString()}` : ""}${a.subtype ? ` · ${a.subtype}` : ""}` : `legacy ID — not found in Meta for this account`}
                >
                  <span className="truncate max-w-[200px]">{a?.name ?? id}</span>
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100 ml-0.5"
                    aria-label={`Remove ${a?.name ?? id}`}
                    onClick={() => toggle(id)}
                  >×</button>
                </span>
              );
            })}
          </div>
        )}
        {selected.length === 0 && (
          <div className="text-[11px] text-slate-400 italic">No audiences selected</div>
        )}

        {/* Picker */}
        {isLoading ? (
          <div className="text-[11px] text-slate-500">Loading custom audiences from Meta…</div>
        ) : isError || data?.error ? (
          <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Couldn't load audiences from Meta: {data?.error ?? "network error"}.
            <button type="button" onClick={() => refetch()} className="ml-2 underline">Retry</button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="search"
              className="al-input text-xs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${audiences.length} custom audience${audiences.length === 1 ? "" : "s"}…`}
            />
            {q.trim() && filtered.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
                {filtered.slice(0, 50).map((a) => (
                  <button
                    key={a.audience_id}
                    type="button"
                    onClick={() => { toggle(a.audience_id); setQ(""); }}
                    className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-brand-50 flex items-center justify-between gap-2 ${
                      selected.includes(a.audience_id) ? "bg-brand-50" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900 truncate block">{a.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {a.audience_id}{a.approximate_count != null ? ` · ~${a.approximate_count.toLocaleString()}` : ""}{a.subtype ? ` · ${a.subtype}` : ""}
                      </span>
                    </span>
                    {selected.includes(a.audience_id) && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 shrink-0" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
            {q.trim() && filtered.length === 0 && (
              <div className="mt-1 text-[10px] text-slate-500 italic">No audiences match "{q}"</div>
            )}
          </div>
        )}
        {unresolved.length > 0 && (
          <div className="text-[10px] text-amber-700">
            {unresolved.length} legacy ID{unresolved.length === 1 ? "" : "s"} not found in Meta for this account (still saved on the template).
          </div>
        )}
      </div>
    </Field>
  );
}

/* ============================================================================
 * Cycle 340 — Targeting Templates section.
 *
 * Per-ad-account templates that combine:
 *   - Include / exclude Meta custom-audience IDs (live-fetched per account)
 *   - Age range (default 18-65)
 *   - Genders (empty = all)
 *   - Countries (ISO codes)
 *
 * One is_default per account → auto-picked when the operator launches into
 * this account. Operator can still override per-launch.
 *
 * Backed by /api/targeting-templates (CRUD) + /api/meta-accounts/:id/audiences
 * (live Meta read).
 * ========================================================================= */

type TargetingTemplate = {
  id: string;
  meta_account_id: string;
  name: string;
  include_audience_ids: string[];
  exclude_audience_ids: string[];
  age_min: number;
  age_max: number;
  genders: ("male" | "female" | "all")[];
  countries: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

/* ============================================================================
 * Cycle 349 — Per-account preset visibility section.
 *
 * Surfaces whether THIS ad account has its own preset (customized by
 * the media buyer) or is still inheriting from the admin default.
 * The full per-account editor is deferred to a follow-up cycle; for
 * now this section shows the state + a couple of the most impactful
 * toggles inline.
 *
 * Backed by /api/launch-presets/meta/by-account (C348).
 * ========================================================================= */

/* Cycle 356 — Full per-account preset editor.
 *
 * Uses the same UniversalMetaEditor as /upload-presets but with
 * target="account" so PUTs go to /api/launch-presets/meta/by-account.
 * Media buyers manage their account's preset entirely here without
 * visiting the admin-only /upload-presets page. */

type AccountPresetSnapshot = {
  is_custom: boolean;
  preset: UniversalPreset | null;
};

function AccountPresetSection({ accountId, accountName }: { accountId: string; accountName: string }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["account-preset", accountId],
    queryFn: () => api.get<AccountPresetSnapshot>(`/api/launch-presets/meta/by-account?meta_account_id=${accountId}`),
  });
  // Cycle 480 — fetch Universal Standard alongside so we can flag every
  // chip whose per-account value drifts from the universal baseline. Tiny
  // amber dot + tooltip makes "what's been customized" scannable without
  // opening the full editor.
  const { data: universalData } = useQuery({
    queryKey: ["universal-preset-singleton"],
    queryFn: () => api.get<{ preset: UniversalPreset | null }>(`/api/launch-presets/meta/universal`),
  });
  const [editing, setEditing] = useState(false);
  // Cycle 358 — wipe per-account customizations + re-inherit admin default.
  const resetToDefault = useMutation({
    mutationFn: () => api.del(`/api/launch-presets/meta/by-account?meta_account_id=${accountId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account-preset", accountId] }),
  });
  // Cycle 485 — inline ship-as flip. PUTs only the launch_paused field
  // so operator doesn't need to open the full editor for the most-
  // commonly-tweaked toggle.
  const flipShipAs = useMutation({
    mutationFn: (next: boolean) =>
      api.put<{ ok: boolean }>(`/api/launch-presets/meta/by-account?meta_account_id=${accountId}`, { launch_paused: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account-preset", accountId] }),
  });
  if (isLoading) return <div className="al-card mb-4"><div className="text-xs text-slate-500">Loading preset…</div></div>;
  if (!data?.preset) return null;
  const p = data.preset;
  const ce = p.creative_enhancements ?? {};
  const ceOnCount = Object.values(ce).filter((v) => v === true).length;
  const ceTotal = Object.keys(ce).length;
  // Cycle 480 — diff flags. Only meaningful when the account is customized
  // (otherwise everything inherits the universal by definition).
  const u = universalData?.preset ?? null;
  const uCe = u?.creative_enhancements ?? {};
  const uCeOnCount = Object.values(uCe).filter((v) => v === true).length;
  const showDiff = !!data.is_custom && !!u;
  const diff = (a: unknown, b: unknown) => showDiff && JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  const diffObjective    = diff(p.default_campaign_objective, u?.default_campaign_objective);
  const diffBuying       = diff(p.default_buying_type,        u?.default_buying_type);
  const diffBudget       = diff(p.default_budget_type,        u?.default_budget_type);
  const diffOptimization = diff(p.default_optimization_goal,  u?.default_optimization_goal);
  const diffShipAs       = diff(!!p.launch_paused,            !!u?.launch_paused);
  const diffFastUpload   = diff(!!p.fast_upload,              !!u?.fast_upload);
  const diffCeMaster     = diff(!!ce.ce_master_enabled,       !!uCe.ce_master_enabled);
  const diffCeToggles    = showDiff && ceOnCount !== uCeOnCount;
  const diffAutoExclude  = diff(!!(p as any).auto_exclude_past_purchasers, !!(u as any)?.auto_exclude_past_purchasers);
  return (
    // Cycle 497 — stable id anchor so the divergence badge on the
    // Universal Standard card can jump straight to the first
    // diverging account preset section via #account-preset-<id>.
    <div className="al-card mb-4" id={`account-preset-${accountId}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
          Account Preset
          <span
            className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${
              data.is_custom
                ? "bg-brand-50 text-brand-800 border-brand-200"
                : "bg-slate-50 text-slate-500 border-slate-200"
            }`}
            title={data.is_custom
              ? "This account has its own customized preset (overrides the Universal Standard)."
              : "This account inherits from the Universal Standard. Edits here fork into a per-account preset."}
          >
            {data.is_custom ? "customized" : "inherits Universal Standard"}
          </span>
        </h3>
        <div className="flex items-center gap-1.5">
          {data.is_custom && (
            <button
              type="button"
              className="text-[11px] font-semibold px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={resetToDefault.isPending}
              onClick={async () => {
                if (await confirmAct({
                  title: `Reset ${accountName} to the Universal Standard?`,
                  description: "Removes all per-account customizations. The account re-inherits the Universal Standard configured above.",
                  tone: "danger",
                  confirmLabel: "Reset to Universal Standard",
                })) {
                  resetToDefault.mutate();
                }
              }}
              title="Delete this account's preset row so it re-inherits the Universal Standard configured at the top of /accounts."
            >
              {resetToDefault.isPending ? "Resetting…" : "Reset to Universal Standard"}
            </button>
          )}
          <button
            type="button"
            className="text-[11px] font-semibold px-2 py-1 rounded border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
            onClick={() => setEditing(true)}
          >
            Edit full preset
          </button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">
        Preset for {accountName}. Full editor below covers every field — Identity / Campaign defaults / Targeting / Creative Enhancements / Launch Settings.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <ReadOnlyPresetChip label="Objective"    value={p.default_campaign_objective ?? "—"} diff={diffObjective}    universalValue={u?.default_campaign_objective ?? null} />
        <ReadOnlyPresetChip label="Buying"       value={p.default_buying_type ?? "—"}        diff={diffBuying}       universalValue={u?.default_buying_type ?? null} />
        <ReadOnlyPresetChip label="Budget type"  value={p.default_budget_type ?? "—"}        diff={diffBudget}       universalValue={u?.default_budget_type ?? null} />
        <ReadOnlyPresetChip label="Optimization" value={p.default_optimization_goal ?? "—"}  diff={diffOptimization} universalValue={u?.default_optimization_goal ?? null} />
        {/* Cycle 485 — inline ship-as toggle. Click the chip to flip
            PAUSED ↔ ACTIVE; PUTs only this field via the existing
            per-account preset endpoint.
            Cycle 480 — amber ring + dot when this account's ship-as
            differs from the Universal Standard. */}
        <button
          type="button"
          className={`relative rounded border px-2 py-1 text-left ${p.launch_paused ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"} ${diffShipAs ? "ring-1 ring-amber-400" : ""} hover:opacity-80 disabled:opacity-50`}
          disabled={flipShipAs.isPending}
          title={diffShipAs
            ? `Click to flip PAUSED ↔ ACTIVE. Diverges from Universal Standard (${u?.launch_paused ? "PAUSED" : "ACTIVE"}).`
            : "Click to flip PAUSED ↔ ACTIVE"}
          onClick={() => flipShipAs.mutate(!p.launch_paused)}
        >
          {diffShipAs && (
            <span className="absolute -top-1 -right-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ring-2 ring-white" />
          )}
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Ship as</div>
          <div className={`font-mono ${p.launch_paused ? "text-amber-900" : "text-emerald-900"}`}>
            {flipShipAs.isPending ? "…" : (p.launch_paused ? "PAUSED" : "ACTIVE")}
          </div>
        </button>
        <ReadOnlyPresetChip label="Fast upload" value={p.fast_upload ? "on" : "off"}        diff={diffFastUpload} universalValue={u?.fast_upload ? "on" : "off"} />
        <ReadOnlyPresetChip label="CE master"   value={ce.ce_master_enabled ? "on" : "off"} diff={diffCeMaster}   universalValue={uCe.ce_master_enabled ? "on" : "off"} />
        <ReadOnlyPresetChip label="CE toggles"  value={`${ceOnCount}/${ceTotal}`}           diff={diffCeToggles}  universalValue={`${uCeOnCount}/${Object.keys(uCe).length || ceTotal}`} />
        {/* Cycle 449 — operator-requested toggle: auto-exclude past
            purchasers (mirrors AdManage). When ON, the launcher
            adds the account's "past purchasers" audience to the
            exclusion list at launch time. */}
        <ReadOnlyPresetChip
          label="Auto-exclude past buyers"
          value={(p as any).auto_exclude_past_purchasers ? "on" : "off"}
          diff={diffAutoExclude}
          universalValue={(u as any)?.auto_exclude_past_purchasers ? "on" : "off"}
        />
      </div>
      {showDiff && (
        <p className="text-[10px] text-amber-700 mt-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle mr-1" />
          Chips outlined in amber differ from the Universal Standard. Click "Reset to Universal Standard" to wipe per-account customizations.
        </p>
      )}
      {editing && (
        <Modal onClose={() => setEditing(false)}>
          <div className="max-w-4xl">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h2 className="text-lg font-bold">Edit preset · {accountName}</h2>
              <button className="text-xs text-slate-500 hover:text-slate-900" onClick={() => setEditing(false)}>Close</button>
            </div>
            <UniversalMetaEditor
              preset={p}
              target={{ kind: "account", accountId }}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["account-preset", accountId] });
                setEditing(false);
                toast("success", `Preset saved for ${accountName}`);
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Cycle 367 — Universal Standard editor card.
 *
 * Wraps UniversalMetaEditor against the singleton preset row so the
 * operator can tune the universal baseline directly from /accounts.
 * Replaces the old /upload-presets page entirely. Collapsed by default
 * to keep the per-account list above the fold.
 */
function UniversalStandardCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["universal-preset-singleton"],
    queryFn: () => api.get<{ preset: UniversalPreset | null }>(`/api/launch-presets/meta/universal`),
  });
  // Cycle 494 — divergence badge. Lightweight count of accounts that
  // have a custom preset row; lets the operator see at a glance how
  // many accounts have drifted from the standard before opening
  // the editor. Refreshes every 30s in case another tab edits.
  // Cycle 497 — also returns customized_account_ids so the badge can
  // jump straight to the first diverging AccountPresetSection.
  const { data: divergence } = useQuery({
    queryKey: ["universal-preset-divergence"],
    queryFn: () => api.get<{ ok: boolean; customized_count: number; total_accounts: number; customized_account_ids?: string[] }>("/api/launch-presets/meta/divergence"),
    refetchInterval: 30_000,
  });
  const preset = data?.preset ?? null;
  return (
    <div className="al-card mb-4 border-brand-200 bg-gradient-to-b from-brand-50/40 to-white">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
            Universal Standard
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-100 text-brand-800 border border-brand-200">
              baseline for every account
            </span>
            {/* Cycle 494 — divergence badge. Amber when any account is
                customized; emerald when every account is on the standard.
                Cycle 497 — when amber, the badge is a button that jumps
                to the first diverging AccountPresetSection (via the
                #account-preset-<id> anchor added there). */}
            {divergence && divergence.total_accounts > 0 && (
              divergence.customized_count > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const firstId = divergence.customized_account_ids?.[0];
                    if (!firstId) return;
                    const el = document.getElementById(`account-preset-${firstId}`);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                      // Briefly highlight so the operator can spot it after the scroll.
                      el.classList.add("ring-2", "ring-amber-400");
                      window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1500);
                    }
                  }}
                  className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 cursor-pointer"
                  title={`${divergence.customized_count} of ${divergence.total_accounts} accounts have a per-account preset that overrides this Universal Standard. Click to jump to the first diverging account.`}
                >
                  {divergence.customized_count}/{divergence.total_accounts} customized · jump ↓
                </button>
              ) : (
                <span
                  className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200"
                  title="Every account currently inherits this Universal Standard with no overrides."
                >
                  all on standard
                </span>
              )
            )}
          </h2>
          <p className="text-[11px] text-slate-600 mt-1 max-w-2xl">
            Universal defaults applied to every NEW account synced from Meta, and the baseline any existing account can be reset back to via "Reset to Universal Standard" below. Per-account customizations override these.
          </p>
        </div>
        <button
          type="button"
          className="text-[11px] font-semibold px-2 py-1 rounded border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide editor" : "Edit Universal Standard"}
        </button>
      </div>
      {open && (
        <div className="mt-4 border-t border-brand-100 pt-4">
          {isLoading && <div className="text-xs text-slate-500">Loading universal standard…</div>}
          {!isLoading && !preset && (
            <div className="text-xs text-rose-700">
              Universal Standard singleton not initialized. Re-run server migrations or seed.
            </div>
          )}
          {preset && (
            <UniversalMetaEditor
              preset={preset}
              target={{ kind: "admin" }}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["universal-preset-singleton"] });
                qc.invalidateQueries({ queryKey: ["account-preset"] });
                setOpen(false);
                toast("success", "Universal Standard preset saved successfully");
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReadOnlyPresetChip({
  label,
  value,
  diff,
  universalValue,
}: {
  label: string;
  value: string;
  diff?: boolean;
  universalValue?: string | null;
}) {
  // Cycle 480 — when `diff` is set, amber-ring the chip + plant a small
  // amber dot in the corner. Tooltip names the universal value so the
  // operator can decide whether the customization is intentional.
  const title = diff
    ? `${value}  ·  Universal Standard: ${universalValue ?? "—"}`
    : value;
  return (
    <div className={`relative rounded border bg-white px-2 py-1 ${diff ? "border-amber-300 ring-1 ring-amber-300" : "border-slate-200"}`}>
      {diff && (
        <span className="absolute -top-1 -right-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ring-2 ring-white" />
      )}
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`font-mono truncate ${diff ? "text-amber-900" : "text-slate-700"}`} title={title}>{value}</div>
    </div>
  );
}

function TargetingTemplatesSection({ accountId, accountName }: { accountId: string; accountName: string }) {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { data: listData, isLoading } = useQuery({
    queryKey: ["targeting-templates", accountId],
    queryFn: () => api.get<{ ok: boolean; targeting_templates: TargetingTemplate[] }>(`/api/targeting-templates?meta_account_id=${accountId}`),
  });
  const list = listData?.targeting_templates ?? [];
  const [editing, setEditing] = useState<Partial<TargetingTemplate> | null>(null);

  const save = useMutation({
    mutationFn: (t: Partial<TargetingTemplate>) =>
      t.id
        ? api.put(`/api/targeting-templates/${t.id}`, t)
        : api.post(`/api/targeting-templates`, t),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["targeting-templates", accountId] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/api/targeting-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["targeting-templates", accountId] }),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => api.post(`/api/targeting-templates/${id}/set-default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["targeting-templates", accountId] }),
  });

  return (
    <div className="al-card mb-4">
      <SectionHeader
        title="Targeting Templates"
        onAdd={() =>
          setEditing({
            meta_account_id: accountId,
            name: "",
            include_audience_ids: [],
            exclude_audience_ids: [],
            age_min: 18,
            age_max: 65,
            genders: [],
            countries: ["US"],
            is_default: list.length === 0, // first template added auto-becomes default
          })
        }
      />
      <p className="text-[11px] text-slate-500 mb-2">
        Templates combine audience inclusions / exclusions, age range, gender, and countries. The operator picks one at launch time as the starting point — still editable per-launch.
      </p>
      {isLoading ? (
        <div className="text-xs text-slate-500">Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-xs text-slate-500">
          No targeting templates yet for {accountName}. Add one — at minimum a broad-18+ default that includes no audiences and excludes past buyers.
        </div>
      ) : (
        <div className="divide-y">
          {list.map((t) => (
            <div key={t.id} className="py-2 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-slate-900">{t.name}</span>
                  {t.is_default && (
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                      default
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{t.include_audience_ids.length} incl · {t.exclude_audience_ids.length} excl</span>
                  <span>·</span>
                  <span>Age {t.age_min}-{t.age_max}</span>
                  <span>·</span>
                  <span>{t.genders.length === 0 ? "all genders" : t.genders.join(" + ")}</span>
                  <span>·</span>
                  <span>{t.countries.length === 0 ? "(no country)" : t.countries.join(", ")}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!t.is_default && (
                  <button
                    className="text-[10px] font-semibold px-2 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    title="Make this template the default for this ad account."
                    onClick={() => setDefault.mutate(t.id)}
                    disabled={setDefault.isPending}
                  >
                    Set default
                  </button>
                )}
                <button
                  className="btn-icon hover:!text-brand-600"
                  title="Edit"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => setEditing(t)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
                <button
                  className="btn-icon hover:!text-red-600 hover:!bg-red-50"
                  title="Delete"
                  aria-label={`Delete ${t.name}`}
                  onClick={async () => {
                    if (await confirmAct({ title: `Delete "${t.name}"?`, tone: "danger", confirmLabel: "Delete" })) del.mutate(t.id);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h3 className="text-lg font-bold mb-4">{editing.id ? "Edit" : "Add"} Targeting Template</h3>
          <div className="space-y-3">
            <Field label="Name" required>
              <input
                className="al-input"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Broad 18+ · excl PUR_180"
              />
            </Field>
            <TargetingAudienceIdPicker
              accountId={accountId}
              label="Include audiences (Meta IDs)"
              selected={editing.include_audience_ids ?? []}
              onChange={(v) => setEditing({ ...editing, include_audience_ids: v })}
            />
            <TargetingAudienceIdPicker
              accountId={accountId}
              label="Exclude audiences (Meta IDs)"
              selected={editing.exclude_audience_ids ?? []}
              onChange={(v) => setEditing({ ...editing, exclude_audience_ids: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age min">
                <input
                  type="number"
                  min={13}
                  max={120}
                  className="al-input"
                  value={editing.age_min ?? 18}
                  onChange={(e) => setEditing({ ...editing, age_min: Number(e.target.value) || 18 })}
                />
              </Field>
              <Field label="Age max">
                <input
                  type="number"
                  min={13}
                  max={120}
                  className="al-input"
                  value={editing.age_max ?? 65}
                  onChange={(e) => setEditing({ ...editing, age_max: Number(e.target.value) || 65 })}
                />
              </Field>
            </div>
            <Field label="Genders (empty = all)">
              <div className="flex items-center gap-2">
                {(["male", "female"] as const).map((g) => {
                  const sel = editing.genders ?? [];
                  const checked = sel.includes(g);
                  return (
                    <label key={g} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked ? [...sel, g] : sel.filter((x) => x !== g);
                          setEditing({ ...editing, genders: next });
                        }}
                      />
                      {g}
                    </label>
                  );
                })}
              </div>
            </Field>
            <Field label="Countries (ISO codes, comma-separated)">
              <input
                className="al-input font-mono text-xs"
                value={(editing.countries ?? []).join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    countries: e.target.value
                      .split(",")
                      .map((s) => s.trim().toUpperCase())
                      .filter(Boolean),
                  })
                }
                placeholder="US, CA"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.is_default}
                onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })}
              />
              <span>Auto-select this template at launch for this account</span>
            </label>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={save.isPending || !editing.name?.trim()}
                onClick={() => save.mutate({ ...editing, meta_account_id: accountId } as Partial<TargetingTemplate>)}
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Cycle 340 — multi-select audience picker that returns Meta audience IDs
 * (vs the legacy AudiencePicker which returns audience NAMES). Wired to
 * /api/meta-accounts/:id/audiences (live Graph via liveListCustomAudiences).
 */
function TargetingAudienceIdPicker({
  accountId, label, selected, onChange,
}: { accountId: string; label: string; selected: string[]; onChange: (v: string[]) => void }) {
  const qc = useQueryClient();
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["meta-account-audiences", accountId],
    queryFn: () => api.get<{
      ok: boolean;
      audiences: { audience_id: string; name: string; approximate_count: number | null }[];
    }>(`/api/meta-accounts/${accountId}/audiences`),
    staleTime: 60_000,
  });
  // Cycle 344 — manual refresh hook; the operator just added an audience
  // in Meta and wants it to surface here without waiting for the 60s
  // staleTime to expire. Invalidates THIS account's cache only.
  function refresh() {
    qc.invalidateQueries({ queryKey: ["meta-account-audiences", accountId] });
    void refetch();
  }
  const audiences = data?.audiences ?? [];
  const byId = new Map(audiences.map((a) => [a.audience_id, a]));
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? audiences.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()) || a.audience_id.includes(q))
    : audiences;
  return (
    <Field label={label}>
      <div className="border border-slate-200 rounded-md p-2 bg-slate-50/50 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400 font-mono">
            {audiences.length} audience{audiences.length === 1 ? "" : "s"} on this ad account
          </span>
          <button
            type="button"
            className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={refresh}
            disabled={isFetching}
            title="Re-pull the audience list from Meta Graph. Use this after adding a new audience in Meta."
          >
            {isFetching ? "Refreshing…" : "↻ Refresh from Meta"}
          </button>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-200">
                {byId.get(id)?.name ?? id.slice(0, 12)}
                <button
                  type="button"
                  className="text-brand-700 hover:text-brand-900"
                  onClick={() => onChange(selected.filter((x) => x !== id))}
                  aria-label={`Remove ${byId.get(id)?.name ?? id}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          className="al-input text-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search audiences by name or ID…"
        />
        {audiences.length > 0 && (
          <div className="max-h-40 overflow-auto border border-slate-200 rounded bg-white">
            {filtered.slice(0, 40).map((a) => {
              const checked = selected.includes(a.audience_id);
              return (
                <label key={a.audience_id} className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      onChange(e.target.checked
                        ? [...selected, a.audience_id]
                        : selected.filter((x) => x !== a.audience_id));
                    }}
                  />
                  <span className="truncate flex-1">{a.name}</span>
                  {a.approximate_count != null && (
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{a.approximate_count.toLocaleString()}</span>
                  )}
                </label>
              );
            })}
            {filtered.length > 40 && (
              <div className="text-[10px] text-slate-500 italic px-2 py-1">… {filtered.length - 40} more — narrow your search</div>
            )}
          </div>
        )}
        {audiences.length === 0 && data?.ok && (
          <div className="text-[10px] text-slate-500 italic">No custom audiences in this Meta ad account yet.</div>
        )}
      </div>
    </Field>
  );
}
