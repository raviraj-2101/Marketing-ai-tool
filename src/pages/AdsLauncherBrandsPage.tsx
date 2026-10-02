import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, Brand, MetaAccount } from "@/features/ads-launcher/lib/api";
import { EmptyState, ListSkeleton, Plus } from "@/features/ads-launcher/components/ListShells";
import { useConfirm } from "@/features/ads-launcher/components/Confirm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canAccessRoute } from "@/lib/routeAccess";

type Form = Partial<Brand>;

const emptyForm: Form = {
  name: "",
  notes: "",
  default_meta_account_id: null,
  default_audience_template: "",
  // default_call_to_action + default_primary_text were removed from the brand
  // form in Cycle 112; the columns still exist on the DB row but the UI no
  // longer prompts for them. Sending null leaves whatever is already saved.
  default_call_to_action: null,
  default_primary_text: null,
};

export default function BrandsPage() {
  const qc = useQueryClient();
  const confirmAct = useConfirm();
  const { user } = useAuth();
  // Only surface "Add Brand" to users who have the brand module granted.
  // expandAliases:false → the brands-products hub does NOT imply "can add";
  // custom users need the brand module explicitly (so Add is effectively
  // Admin/Super Admin/Dev only, while custom users can still browse).
  const canAddBrand = canAccessRoute(user, "/ads-launcher/brands", { expandAliases: false });
  // Cycle 455 — show trash toggle for soft-deleted brands.
  const [showTrash, setShowTrash] = useState(false);
  const { data: brandsData = [], isLoading: brandsLoading, error: brandsError } = useQuery({
    queryKey: ["brands", showTrash],
    queryFn: async () => {
      let query = supabase.from("brands").select("*").order("created_at", { ascending: false });

      // Filter out soft-deleted brands unless showing trash
      if (!showTrash) {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Brand[];
    },
  });
  const brandList = Array.isArray(brandsData) ? brandsData : [];
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brands")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brands"] }),
  });
  const { data: accountsData } = useQuery({
    queryKey: ["meta-accounts"],
    queryFn: () => api.get<MetaAccount[]>("/api/meta-accounts"),
  });
  const accounts = Array.isArray(accountsData) ? accountsData : (accountsData?.accounts ?? accountsData?.data ?? []);

  const [editing, setEditing] = useState<Form | null>(null);

  const save = useMutation({
    mutationFn: async (b: Form) => {
      if (b.id) {
        // Update existing brand
        const { error } = await supabase
          .from("brands")
          .update({
            name: b.name,
            notes: b.notes,
            default_meta_account_id: b.default_meta_account_id ?? null,
            default_audience_template: b.default_audience_template ?? null,
            default_call_to_action: b.default_call_to_action ?? null,
            default_primary_text: b.default_primary_text ?? null,
          })
          .eq("id", b.id);
        if (error) throw error;
      } else {
        // Create new brand
        const { error } = await supabase
          .from("brands")
          .insert({
            name: b.name,
            notes: b.notes,
            default_meta_account_id: b.default_meta_account_id ?? null,
            default_audience_template: b.default_audience_template ?? null,
            default_call_to_action: b.default_call_to_action ?? null,
            default_primary_text: b.default_primary_text ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brands"] });
      setEditing(null);
    },
    onError: (error) => {
      console.error("Save error:", error);
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brands")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brands"] }),
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Brands</h1>
        <div className="flex items-center gap-2">
          {/* Cycle 455 — show-trash toggle. Soft-deleted brands
              surface with a "trashed" chip + ↺ Restore button. */}
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrash}
              onChange={(e) => setShowTrash(e.target.checked)}
            />
            Show trash
          </label>
          {canAddBrand && (
            <button className="btn-primary" onClick={() => setEditing({ ...emptyForm })}>
              + Add Brand
            </button>
          )}
        </div>
      </div>

      <div className="al-card divide-y">
        {brandsLoading ? (
          <ListSkeleton rows={3} />
        ) : brandsError ? (
          <div className="p-4 text-center text-red-600">
            <p className="font-medium">Failed to load brands</p>
            <p className="text-sm text-red-500">{brandsError.message}</p>
          </div>
        ) : brandList.length === 0 ? (
          <EmptyState
            icon={<Plus />}
            title="Add your first brand"
            description="Brands are the parent of products, audience targeting, and ad copy defaults. Once added: create products under it, scope Meta ad accounts to it, then launch ads from /launch."
            cta={{ label: "+ Add brand", onClick: () => setEditing({ ...emptyForm }) }}
          />
        ) : null}
        {brandList.map((b) => (
          <div key={b.id} className={`py-3 flex items-center justify-between ${b.deleted_at ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1 mr-4">
              <div className="font-medium text-slate-900 flex items-center gap-2">
                {/* Cycle 456 — inline brand name edit (double-click). */}
                <InlineBrandName brand={b} onSave={(name) => save.mutate({ ...b, name })} />
                {b.deleted_at && (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    trashed
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                {b.default_audience_template ? `Audience: ${b.default_audience_template}` : null}
              </div>
              {/* Cycle 484 — inline notes editor. Click to edit, blur to save.
                  Lets operators jot brand-level context (e.g. "uses comparison
                  funnel only", "switched payment processor 2026-03") without
                  opening the full Edit modal. Saved via the same PUT /api/brands/:id. */}
              {!b.deleted_at && (
                <InlineBrandNotes
                  brand={b}
                  onSave={(notes) => save.mutate({ ...b, notes })}
                />
              )}
            </div>
            <div className="flex gap-2">
              {b.deleted_at ? (
                <button
                  type="button"
                  className="text-xs font-semibold px-2 py-1 rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(b.id)}
                >
                  ↺ Restore
                </button>
              ) : (
                <>
                  {/* Cycle 477 — one-click drill into this brand's
                      launches. Uses the C384 URL-as-saved-search so
                      operators land directly on the filtered Log. */}
                  {(b.launch_count ?? 0) > 0 && (
                    <Link
                      to={`/ads-launcher/log?brand_id=${b.id}`}
                      className="text-xs font-semibold px-2 py-1 rounded border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 inline-flex items-center"
                      title={`${b.launch_count} launches in this brand`}
                    >
                      Launches ({b.launch_count}) ↗
                    </Link>
                  )}
                  <button className="btn-secondary" onClick={() => setEditing(b)}>
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    onClick={async () => {
                      if (await confirmAct({ title: `Delete "${b.name}"?`, description: "Moves to trash. Restore from 'Show trash' or hard-delete with admin tools.", tone: "danger", confirmLabel: "Delete brand" })) del.mutate(b.id);
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2 className="text-lg font-bold mb-4">{editing.id ? "Edit" : "Add"} Brand</h2>
          <div className="space-y-3">
            <Field label="Name" required>
              <input
                className="al-input"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Default Meta Account">
              <Select value={editing.default_meta_account_id ?? ""} onValueChange={(value) => setEditing({ ...editing, default_meta_account_id: value || null })}>
                <SelectTrigger className="al-input">
                  <SelectValue placeholder="— None —" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length === 0 ? (
                    <SelectItem value="__no_match__" disabled>
                      No accounts found
                    </SelectItem>
                  ) : (
                    accounts.map((a: MetaAccount) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.meta_account_id})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Default Audience Template">
              <input
                className="al-input"
                value={editing.default_audience_template ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, default_audience_template: e.target.value })
                }
                placeholder="e.g. Broad US 25-65, Lookalike-1pct, Hot-Buyers"
              />
            </Field>
            {/* Default CTA + Default Primary Text removed (2026-05-18) —
                brand-level copy was confusing alongside per-product copy and
                per-creative-template copy. The launcher now reads CTA/primary
                from the Creative Template (which is auto-selected by funnel),
                so the brand row no longer needs its own copy of either field. */}
            <Field label="Notes">
              <textarea
                className="al-input"
                rows={2}
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>
            {save.isError && (
              <div className="text-sm text-red-600">{(save.error as Error).message}</div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={save.isPending || !editing.name?.trim()}
                onClick={() => save.mutate(editing)}
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="al-label">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Cycle 456 — inline brand-name edit. Double-click the name to swap
 * to an input; Enter or blur saves, Escape cancels. Tooltip hints
 * the gesture on first hover.
 */
/**
 * Cycle 484 — inline brand notes editor. Click the muted "+ add notes"
 * placeholder (or the existing note text) to swap to a textarea; blur
 * or Cmd/Ctrl+Enter saves, Escape cancels. Lets operators jot
 * brand-level context (e.g. "uses comparison funnel only") without
 * opening the full Edit modal.
 *
 * Cycle 495 — render bare URLs as <a> tags. http(s)://… is the safe
 * substring; we don't try to autolink bare domains because the false-
 * positive risk on words like "feb.2026" or "v2.0" outweighs the gain.
 * Clicks on a link short-circuit the wrapper's "open editor" handler.
 */
function InlineBrandNotes({ brand, onSave }: { brand: Brand; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brand.notes ?? "");
  const initial = (brand.notes ?? "").trim();
  if (!editing) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => { setEditing(true); setDraft(brand.notes ?? ""); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
            setDraft(brand.notes ?? "");
          }
        }}
        className={`mt-0.5 text-left text-xs cursor-text w-full max-w-2xl truncate ${
          initial ? "text-slate-600 hover:bg-slate-50" : "text-slate-400 italic hover:text-slate-600"
        } rounded px-1 -mx-1 py-0.5`}
        title="Click to edit notes"
      >
        {initial ? renderNotesWithLinks(initial) : "+ add notes"}
      </div>
    );
  }
  function commit() {
    const next = draft.trim();
    if (next !== initial) onSave(next);
    setEditing(false);
  }
  return (
    <textarea
      autoFocus
      rows={2}
      className="al-input text-xs mt-1 max-w-2xl"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      }}
      onBlur={commit}
      placeholder="Brand-level notes (e.g. comparison-funnel only, payment processor switched 2026-03)…"
    />
  );
}

/**
 * Cycle 495 — split a notes string into text + link nodes so bare
 * http(s) URLs render as clickable anchor tags inside the inline
 * notes display. Anchor clicks call stopPropagation so the wrapper's
 * "open editor" handler doesn't fire on the same click.
 */
function renderNotesWithLinks(text: string): React.ReactNode {
  const URL_RX = /(https?:\/\/[^\s)]+)/g;
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = URL_RX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    out.push(
      <a
        key={`l-${i++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-brand-600 hover:underline"
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function InlineBrandName({ brand, onSave }: { brand: Brand; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(brand.name);
  if (!editing) {
    return (
      <span
        className="cursor-text"
        onDoubleClick={() => { setEditing(true); setDraft(brand.name); }}
        title="Double-click to rename"
      >
        {brand.name}
      </span>
    );
  }
  return (
    <input
      autoFocus
      type="text"
      className="al-input text-sm py-0.5 max-w-xs"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (draft.trim() && draft.trim() !== brand.name) onSave(draft.trim());
          setEditing(false);
        }
        if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
      }}
      onBlur={() => {
        if (draft.trim() && draft.trim() !== brand.name) onSave(draft.trim());
        setEditing(false);
      }}
    />
  );
}
