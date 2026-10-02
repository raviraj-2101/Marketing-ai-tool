/**
 * Cycle 377 — operator Settings/preferences page.
 *
 * Surfaces a small set of personal preferences that the launcher reads
 * on /launch (default brand, default funnel, schedule offset, default
 * ship-as). Per-operator scope — saves to operator_prefs keyed by the
 * authenticated email. Lazy-loaded.
 */

import { useEffect, useState } from "react";
import { api, FUNNELS } from "@/features/ads-launcher/lib/api";
import { usePrefs, OperatorPrefs } from "@/features/ads-launcher/lib/prefs";
import { useToast } from "@/features/ads-launcher/components/Toast";
import { useBrands } from "@/hooks/useBrands";

export default function SettingsPage() {
  const { prefs, isLoading, save, isSaving } = usePrefs();
  const toast = useToast();
  const { data: brands = [] } = useBrands();
  const [form, setForm] = useState<OperatorPrefs>({});
  // Hydrate the local form from the loaded prefs. Re-sync after successful save.
  useEffect(() => {
    if (!isLoading) setForm(prefs);
  }, [isLoading, prefs]);
  const dirty = JSON.stringify(form) !== JSON.stringify(prefs);

  // Cycle 491 — beforeunload guard: if the operator wanders off the page
  // (tab close, hard refresh, browser-back) with unsaved edits in the
  // form, prompt them via the native "Leave site?" dialog. React Router
  // soft-nav inside the SPA bypasses this — there's nothing else routed
  // through here that needs an in-app prompt today (the form is one tab).
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore the returned string and show their own
      // generic copy, but the assignment + preventDefault is still required.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function handleSave() {
    try {
      await save(form);
      toast("success", "Preferences saved.");
    } catch (e: any) {
      toast("error", e?.message ?? "Save failed.");
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Personal preferences applied to your launches. Saved to your account; takes effect on the next /launch render.
        </p>
      </div>

      {isLoading ? (
        <div className="al-card text-sm text-slate-500">Loading preferences…</div>
      ) : (
        <div className="al-card space-y-5">
          <Field
            label="Default brand"
            hint="Pre-selected when you open /launch. Leave blank for none."
          >
            <select
              className="al-input"
              value={form.default_brand_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_brand_id: e.target.value || null }))}
            >
              <option value="">— none —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Default funnel"
            hint="Pre-selected when you start a new launch."
          >
            <select
              className="al-input"
              value={form.default_funnel ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_funnel: (e.target.value || null) as OperatorPrefs["default_funnel"] }))}
            >
              <option value="">— none —</option>
              {FUNNELS.map((fn) => (
                <option key={fn} value={fn}>{fn}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Schedule offset (hours past midnight)"
            hint={`The default schedule is ${String(form.schedule_offset_hours ?? 0).padStart(2, "0")}:00 in the AD ACCOUNT'S tz (not your browser tz). Set 0 for midnight (default), 1 for 1am, etc. Each launch can still be edited per-package on the launcher.`}
          >
            <input
              type="number"
              min={0}
              max={23}
              step={1}
              className="al-input w-32"
              value={form.schedule_offset_hours ?? 0}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setForm((f) => ({ ...f, schedule_offset_hours: Number.isFinite(n) ? Math.max(0, Math.min(23, n)) : 0 }));
              }}
            />
          </Field>

          <Field
            label="Default Log sort"
            hint="Sort order applied when you open /log without an explicit sort. Newest-first is the system default."
          >
            <select
              className="al-input md:max-w-xs"
              value={form.default_log_sort ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_log_sort: (e.target.value || null) as OperatorPrefs["default_log_sort"] }))}
            >
              <option value="">Newest first (system default)</option>
              <option value="ad_id">Ad ID (A→Z)</option>
              <option value="name">Name (A→Z)</option>
              <option value="status">Status</option>
              <option value="variations">Variations count</option>
            </select>
          </Field>

          <Field
            label="Default ship-as"
            hint='PAUSED ships to Meta inactive — operator manually enables in Ads Manager. ACTIVE starts spending immediately. Default: PAUSED.'
          >
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, default_launch_paused: true }))}
                className={`px-3 py-1.5 text-xs ${form.default_launch_paused !== false ? "bg-amber-100 text-amber-900 font-semibold" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                PAUSED
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, default_launch_paused: false }))}
                className={`px-3 py-1.5 text-xs border-l border-slate-300 ${form.default_launch_paused === false ? "bg-emerald-100 text-emerald-900 font-semibold" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                ACTIVE
              </button>
            </div>
          </Field>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={!dirty || isSaving}
              onClick={() => setForm(prefs)}
            >
              Revert
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!dirty || isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </div>
      )}

      {/* Cycle 472 — local utilities. Clear LocalStorage drafts is
          the most operator-relevant action: a stuck draft can prevent
          the launcher from hydrating fresh prefs. The button counts
          the keys present + nukes them all. */}
      <div className="al-card mt-4">
        <h2 className="font-semibold text-slate-900 text-sm mb-1">Local utilities</h2>
        <p className="text-xs text-slate-500 mb-3">Affects only this browser. Saves on the server are unaffected.</p>
        <ClearDraftsButton />
      </div>
    </div>
  );
}

function ClearDraftsButton() {
  const toast = useToast();
  const [count, setCount] = useState(() =>
    typeof window !== "undefined"
      ? Object.keys(window.localStorage).filter((k) => k.includes("ads-uploader") || k.includes("launch-draft")).length
      : 0,
  );
  return (
    <button
      type="button"
      className="btn-secondary text-xs disabled:opacity-50"
      disabled={count === 0}
      onClick={() => {
        const keys = Object.keys(window.localStorage).filter((k) => k.includes("ads-uploader") || k.includes("launch-draft"));
        keys.forEach((k) => window.localStorage.removeItem(k));
        setCount(0);
        toast("success", `Cleared ${keys.length} local draft${keys.length === 1 ? "" : "s"}.`);
      }}
    >
      Clear local drafts ({count})
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 block mb-1">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
