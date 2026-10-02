/**
 * PRODUCTION page for Acentecom/ai-static-generator.
 * Drop at: src/pages/CsKpisPage.tsx  (route + sidebar + CSS in INTEGRATION.md)
 *
 * v2 (two-level): MAIN angle ▸ SUB-angles. KPIs are set per sub-angle; the angle
 * row shows the SUM of its sub-angles (read-only). Every angle has an auto "Other"
 * sub-angle (the strategist's free bucket).
 *
 * Cell anatomy = "briefs / required" (created / KPI), coloured by pacing — labels
 * are stated once in the legend, not repeated in every cell.
 *
 * vs the standalone demo: auth uses useAuth().getToken() Bearer (no demo viewer
 * toggle — `canEdit` comes from the server's JWT roles), base URL is
 * PIPELINE_API_BASE, and the page is wrapped in <DashboardLayout> like CSsPace.
 * The page references `.cs-kpi-sticky` (sticky first column) — see INTEGRATION.md.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PIPELINE_API_BASE } from "@/lib/queryClient";

interface Brand { id: string; name: string; }
interface Product { id: string; name: string; brand_id: string; }
interface Week { key: string; label: string; weekNum: number; isCurrent: boolean; }
interface Cell { target: number | null; ads: number; briefs: number; }
interface SubRow { subKey: string; subName: string; isOther: boolean; cells: Record<string, Record<string, Cell>>; }
interface Row { angleKey: string; angleName: string; isNoAngle: boolean; subRows: SubRow[]; rollup: Record<string, Record<string, Cell>>; }
interface Grid {
  product: { id: string; name: string; brand: string };
  canEdit: boolean; weeks: Week[]; cs: string[];
  angles: { key: string; name: string }[]; rows: Row[];
}
interface SubCfg { subs: { id: string; name: string; sub_angle_key: string }[]; bank: string[]; counts?: Record<string, Record<string, number>>; }

// Light normalization to match a CS label against the ad-count keys the backend returns.
const fnorm = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// Per-cell key for tracking save status ("saving" → "saved"/"error").
const cellKey = (angle: string, sub: string, week: string, cs: string) => `${angle}|${sub}|${week}|${cs}`;
type SaveState = "saving" | "saved" | "error";

function tone(c: Cell): { box: string; brief: string } {
  if (c.target == null || c.target === 0) return { box: "bg-slate-50 border-slate-200", brief: "text-slate-400" };
  if (c.briefs >= c.target) return { box: "bg-emerald-50 border-emerald-300", brief: "text-emerald-700" };
  if (c.briefs > 0) return { box: "bg-amber-50 border-amber-300", brief: "text-amber-700" };
  return { box: "bg-rose-50 border-rose-300", brief: "text-rose-600" };
}

function recomputeRollup(row: Row, weeks: Week[], cs: string[]) {
  for (const w of weeks) for (const c of cs) {
    let target: number | null = null, ads = 0, briefs = 0;
    for (const sr of row.subRows) {
      const cell = sr.cells[w.key][c];
      if (cell.target != null) target = (target ?? 0) + cell.target;
      ads += cell.ads; briefs += cell.briefs;
    }
    row.rollup[w.key][c] = { target, ads, briefs };
  }
}

export default function CsKpisPage() {
  const { getToken } = useAuth();
  const authGet = useCallback(async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${PIPELINE_API_BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const json = await res.json();
    if (!res.ok || json.success === false) throw new Error(json.error || "Request failed");
    return json.data as T;
  }, [getToken]);
  const authSend = useCallback(async <T,>(method: string, path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${PIPELINE_API_BASE}${path}`, {
      method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.success === false) throw new Error(json.error || "Request failed");
    return json.data as T;
  }, [getToken]);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [weeksAhead, setWeeksAhead] = useState(2);
  const [weeksBefore, setWeeksBefore] = useState(0);
  // Edit Type toggle: same angle list, but targets are stored separately per type
  // and counts follow the toggle. Defaults to Editor-Edited (the default type).
  const [editType, setEditType] = useState<"Self-Edited" | "Editor-Edited">("Editor-Edited");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [angleBank, setAngleBank] = useState<string[]>([]);
  const [csBank, setCsBank] = useState<string[]>([]);
  const [angleConfig, setAngleConfig] = useState<{ id: string; name: string }[]>([]);
  const [csConfig, setCsConfig] = useState<{ id: string; cs_label: string }[]>([]);
  const [subConfig, setSubConfig] = useState<Record<string, SubCfg>>({});
  const [angleCounts, setAngleCounts] = useState<Record<string, Record<string, number>>>({});
  const [cellStatus, setCellStatus] = useState<Record<string, SaveState>>({});
  const [editMode, setEditMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [colW, setColW] = useState<number>(() => {
    const v = Number(localStorage.getItem("csKpiColW"));
    return v >= 140 && v <= 600 ? v : 220;
  });

  useEffect(() => { localStorage.setItem("csKpiColW", String(colW)); }, [colW]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = colW;
    const onMove = (ev: MouseEvent) => setColW(Math.min(600, Math.max(140, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const canEdit = grid?.canEdit ?? false;

  useEffect(() => { authGet<Brand[]>("/api/brands").then((b) => { setBrands(b); if (b[0]) setBrandId(b[0].id); }).catch((e) => setError(e.message)); }, [authGet]);
  useEffect(() => {
    if (!brandId) return;
    authGet<Product[]>(`/api/products?brandId=${brandId}`).then((p) => { setProducts(p); setProductId(""); }).catch((e) => setError(e.message));
  }, [brandId, authGet]);

  const loadGrid = useCallback(async () => {
    if (!productId) { setGrid(null); return; }
    setLoading(true); setError("");
    try {
      const [g, angles, cs] = await Promise.all([
        authGet<Grid>(`/api/cs-kpis?productId=${productId}&weeksAhead=${weeksAhead}&weeksBefore=${weeksBefore}&editType=${encodeURIComponent(editType)}`),
        authGet<{ angles: { id: string; name: string }[]; bank: string[]; counts?: Record<string, Record<string, number>> }>(`/api/cs-kpis/angles?productId=${productId}&weeksAhead=${weeksAhead}&weeksBefore=${weeksBefore}&editType=${encodeURIComponent(editType)}`),
        authGet<{ selected: { id: string; cs_label: string }[]; bank: string[] }>(`/api/cs-kpis/cs?productId=${productId}`),
      ]);
      setGrid(g); setAngleBank(angles.bank); setCsBank(cs.bank);
      setAngleConfig(angles.angles ?? []); setCsConfig(cs.selected ?? []); setAngleCounts(angles.counts ?? {});
      // Start collapsed (angle totals only) so a product with many angles stays compact — expand to edit.
      setCollapsed(new Set(g.rows.filter((r) => !r.isNoAngle).map((r) => r.angleKey)));
      const subEntries = await Promise.all((angles.angles ?? []).map((a) =>
        authGet<SubCfg>(`/api/cs-kpis/sub-angles?productId=${productId}&angleId=${a.id}&weeksAhead=${weeksAhead}&weeksBefore=${weeksBefore}&editType=${encodeURIComponent(editType)}`).then((d) => [a.id, d] as const)));
      setSubConfig(Object.fromEntries(subEntries));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [productId, weeksAhead, weeksBefore, editType, authGet]);
  useEffect(() => { loadGrid(); }, [loadGrid]);

  const saveTarget = async (row: Row, sub: SubRow, week: string, cs: string, raw: string) => {
    if (!grid || !canEdit) return;
    const val = raw.trim() === "" ? null : Math.max(0, parseInt(raw, 10) || 0);
    if (val === sub.cells[week][cs].target) return;
    const k = cellKey(row.angleKey, sub.subKey, week, cs);
    setCellStatus((s) => ({ ...s, [k]: "saving" }));
    try {
      await authSend("PUT", "/api/cs-kpis/target", { productId, angle_key: row.angleKey, sub_angle_key: sub.subKey, cs_label: cs, batch_week: week, edit_type: editType, target: val });
      setGrid((g) => {
        if (!g) return g;
        const next = structuredClone(g) as Grid;
        const nrow = next.rows.find((x) => x.angleKey === row.angleKey)!;
        nrow.subRows.find((s) => s.subKey === sub.subKey)!.cells[week][cs].target = val;
        recomputeRollup(nrow, next.weeks, next.cs);
        return next;
      });
      setCellStatus((s) => ({ ...s, [k]: "saved" }));
      setTimeout(() => setCellStatus((s) => { const n = { ...s }; if (n[k] === "saved") delete n[k]; return n; }), 1600);
    } catch (e: any) {
      setError(e.message);
      setCellStatus((s) => ({ ...s, [k]: "error" }));
    }
  };

  const addAngle = async (name: string) => { if (!name) return; await authSend("POST", "/api/cs-kpis/angles", { productId, name, angle_key: name }); await loadGrid(); };
  const deleteAngle = async (id: string) => { try { await authSend("DELETE", `/api/cs-kpis/angles/${id}`, {}); await loadGrid(); } catch (e: any) { setError(e.message); } };
  const addSub = async (angleId: string, name: string) => { if (!name) return; await authSend("POST", "/api/cs-kpis/sub-angles", { productId, angleId, name, sub_angle: name }); await loadGrid(); };
  const deleteSub = async (id: string) => { try { await authSend("DELETE", `/api/cs-kpis/sub-angles/${id}`, {}); await loadGrid(); } catch (e: any) { setError(e.message); } };
  const addCs = async (cs_label: string) => { if (!cs_label) return; await authSend("POST", "/api/cs-kpis/cs", { productId, cs_label }); await loadGrid(); };
  const addAllCs = async (labels: string[]) => {
    if (!labels.length) return;
    try {
      for (const cs_label of labels) await authSend("POST", "/api/cs-kpis/cs", { productId, cs_label });
      await loadGrid();
    } catch (e: any) { setError(e.message); }
  };
  const deleteCs = async (id: string) => { try { await authSend("DELETE", `/api/cs-kpis/cs/${id}`, {}); await loadGrid(); } catch (e: any) { setError(e.message); } };

  const clearFilters = () => {
    if (brands[0]) setBrandId(brands[0].id);
    setProductId("");
    setWeeksAhead(2);
    setWeeksBefore(0);
    setCollapsed(new Set());
  };

  const toggleAngle = (key: string) => setCollapsed((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const collapseAll = () => setGrid((g) => { if (g) setCollapsed(new Set(g.rows.filter((r) => !r.isNoAngle).map((r) => r.angleKey))); return g; });
  const expandAll = () => setCollapsed(new Set());

  const weeks = grid?.weeks ?? [];
  const cs = grid?.cs ?? [];

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        <div className="page-header">
          <h1 className="page-title">CS KPIs</h1>
          <p className="page-description">Ads required per <b>angle → sub-angle</b> · per week · per creative strategist</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Brand"><Select value={brandId} onChange={setBrandId} options={brands.map((b) => ({ value: b.id, label: b.name }))} /></Field>
            <Field label="Product"><Select value={productId} onChange={setProductId} options={[{ value: "", label: "Select a product…" }, ...products.map((p) => ({ value: p.id, label: p.name }))]} /></Field>
            <Field label="Edit Type">
              <div className="inline-flex h-9 rounded-lg border border-slate-300 bg-white p-0.5">
                {(["Editor-Edited", "Self-Edited"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setEditType(t)}
                    className={`px-3 rounded-md text-sm font-medium transition-colors ${editType === t ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            {canEdit && (
              <Field label="Weeks before">
                <Select value={String(weeksBefore)} onChange={(v) => setWeeksBefore(Number(v))} options={[0, 1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: n === 0 ? "none" : `${n} week${n > 1 ? "s" : ""}` }))} />
              </Field>
            )}
            {canEdit && (
              <Field label="Weeks ahead">
                <Select value={String(weeksAhead)} onChange={(v) => setWeeksAhead(Number(v))} options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: `${n} week${n > 1 ? "s" : ""}` }))} />
              </Field>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={clearFilters} title="Reset brand, product and weeks to the default view" className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500 hover:bg-slate-50">Clear filter</button>
              <button onClick={expandAll} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500 hover:bg-slate-50">Expand all</button>
              <button onClick={collapseAll} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500 hover:bg-slate-50">Collapse all</button>
              {canEdit && (
                <button onClick={() => setEditMode((m) => !m)}
                  className={`h-9 rounded-lg px-4 text-sm font-semibold shadow-sm ${editMode ? "bg-indigo-600 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                  {editMode ? "Done editing" : "Edit angles & sub-angles"}
                </button>
              )}
            </div>
          </div>
          {canEdit && editMode && (
            <EditPanel angles={angleConfig} cs={csConfig} angleBank={angleBank} csBank={csBank} subConfig={subConfig} angleCounts={angleCounts}
              onDeleteAngle={deleteAngle} onAddAngle={addAngle} onAddSub={addSub} onDeleteSub={deleteSub} onDeleteCs={deleteCs} onAddCs={addCs} onAddAllCs={() => addAllCs(csBank)} />
          )}
        </div>

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700 mb-4">{error}</div>}

        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>Each cell: <b className="text-sky-600">Briefs</b> <span className="text-slate-400">/</span> <b className="text-slate-700">Required</b> (KPI)</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100"></span> target met</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-100"></span> behind</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-rose-300 bg-rose-100"></span> none yet</span>
          <span className="text-slate-400">· hover a row to highlight it · scroll sideways for more strategists</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden mb-8 shadow-sm">
          <div className="overflow-auto max-h-[74vh]">
            {loading ? <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
              : !grid ? <div className="py-16 text-center text-slate-400 text-sm">Select a product.</div>
              : (
              <table className="border-collapse text-sm w-auto">
                <colgroup><col style={{ width: colW }} /></colgroup>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: colW, minWidth: colW }} className="cs-kpi-sticky cs-kpi-corner relative z-30 bg-slate-900 text-white text-left px-4 py-3 text-xs font-bold uppercase tracking-wide align-bottom">Angle&nbsp;→&nbsp;Sub-angle
                      <span onMouseDown={startResize} title="Drag to resize column" className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-indigo-400/70 active:bg-indigo-400" />
                    </th>
                    {weeks.map((w) => (
                      <th key={w.key} colSpan={cs.length} className={`sticky top-0 z-20 px-3 py-2 text-center font-bold border-l-2 border-slate-300 ${w.isCurrent ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                        <span className="inline-flex items-center gap-1.5">{w.label}
                          {w.isCurrent && <span className="rounded bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">now</span>}
                        </span>
                        <span className={`block text-[10px] font-normal ${w.isCurrent ? "text-indigo-100" : "text-slate-400"}`}>{w.key}</span>
                      </th>
                    ))}
                  </tr>
                  <tr>{weeks.map((w) => cs.map((c, i) => (
                    <th key={w.key + c} className={`sticky top-[50px] z-20 px-3 py-1.5 text-center text-xs font-semibold text-slate-600 min-w-[120px] ${i === 0 ? "border-l-2 border-slate-300" : "border-l border-slate-200"} ${w.isCurrent ? "bg-indigo-50" : "bg-slate-100"}`}>{c}</th>
                  )))}</tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => {
                    if (row.isNoAngle) {
                      return (
                        <tr key={row.angleKey} className="border-t-[3px] border-slate-300 bg-slate-50">
                          <td className="cs-kpi-sticky z-10 bg-slate-50 border-l-4 border-slate-300 px-4 py-2 text-sm italic text-slate-500">{row.angleName}</td>
                          {weeks.map((w) => cs.map((c, i) => (
                            <td key={w.key + c} className={`px-1 py-1.5 text-center ${i === 0 ? "border-l-2 border-slate-300" : "border-l border-slate-100"} ${w.isCurrent ? "bg-indigo-50/40" : ""}`}><LeakStat cell={row.rollup[w.key][c]} /></td>
                          )))}
                        </tr>
                      );
                    }
                    const isCollapsed = collapsed.has(row.angleKey);
                    return (
                      <Fragment key={row.angleKey}>
                        <tr className="border-t-[3px] border-slate-300 bg-slate-100">
                          <td className="cs-kpi-sticky z-10 bg-slate-100 border-l-4 border-indigo-500 px-3 py-2">
                            <button onClick={() => toggleAngle(row.angleKey)} className="inline-flex w-full items-center gap-2 text-left" title={isCollapsed ? "Expand" : "Collapse"}>
                              <span className="w-3 text-xs text-slate-400">{isCollapsed ? "▸" : "▾"}</span>
                              <span className="font-bold text-slate-900">{row.angleName}</span>
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-700">total</span>
                            </button>
                          </td>
                          {weeks.map((w) => cs.map((c, i) => (
                            <td key={w.key + c} className={`px-1 py-1.5 text-center ${i === 0 ? "border-l-2 border-slate-300" : "border-l border-slate-200/70"} ${w.isCurrent ? "bg-indigo-50/60" : ""}`}><RollupStat cell={row.rollup[w.key][c]} /></td>
                          )))}
                        </tr>
                        {!isCollapsed && row.subRows.map((sr) => (
                          <tr key={row.angleKey + sr.subKey} className="cs-kpi-row bg-white">
                            <td className="cs-kpi-sticky z-10 bg-white pl-8 pr-3 py-1.5">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-slate-300">└</span>
                                <span className={sr.isOther ? "text-sm text-slate-500" : "text-sm font-medium text-slate-800"}>{sr.subName}</span>
                                {sr.isOther && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">free</span>}
                              </span>
                            </td>
                            {weeks.map((w) => cs.map((c, i) => (
                              <td key={w.key + c} className={`px-1 py-1 text-center ${i === 0 ? "border-l-2 border-slate-200" : "border-l border-slate-100"} ${w.isCurrent ? "bg-indigo-50/40" : ""}`}>
                                <SubStat cell={sr.cells[w.key][c]} canEdit={canEdit} status={cellStatus[cellKey(row.angleKey, sr.subKey, w.key, c)]} onSave={(v) => saveTarget(row, sr, w.key, c, v)} />
                              </td>
                            )))}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                  <tr className="border-t-[3px] border-slate-400 bg-slate-900 text-white">
                    <td className="cs-kpi-sticky z-10 bg-slate-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Total / CS</td>
                    {weeks.map((w) => cs.map((c, i) => {
                      let tT = 0, tB = 0;
                      for (const r of grid.rows) {
                        if (r.isNoAngle) { tB += r.rollup[w.key][c].briefs; continue; }
                        for (const sr of r.subRows) { tT += sr.cells[w.key][c].target || 0; tB += sr.cells[w.key][c].briefs; }
                      }
                      return (
                        <td key={w.key + c} className={`px-1 py-2.5 text-center ${i === 0 ? "border-l-2 border-slate-700" : "border-l border-slate-800"} ${w.isCurrent ? "bg-slate-800" : ""}`}>
                          <span className="text-xs font-bold tabular-nums"><span className="text-sky-300">{tB}</span><span className="text-slate-500"> / </span><span className="text-white">{tT}</span></span>
                        </td>
                      );
                    }))}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ── Cells: compact "briefs / required" fractions ──────────────────────────────
function SubStat({ cell, canEdit, status, onSave }: { cell: Cell; canEdit: boolean; status?: SaveState; onSave: (v: string) => void }) {
  const t = tone(cell);
  const ring = status === "saving" ? "ring-1 ring-indigo-300"
    : status === "saved" ? "ring-2 ring-emerald-400"
    : status === "error" ? "ring-2 ring-rose-400" : "";
  return (
    <div className={`relative mx-auto inline-flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 transition ${t.box} ${ring}`}>
      <span className={`text-sm font-bold tabular-nums ${cell.briefs ? t.brief : "text-slate-300"}`}>{cell.briefs}</span>
      <span className="text-xs text-slate-300">/</span>
      {canEdit ? (
        <input key={`${cell.target}`} type="number" min={0} defaultValue={cell.target ?? ""} placeholder="–"
          onBlur={(e) => onSave(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-7 bg-transparent text-center text-sm font-bold tabular-nums text-slate-900 outline-none border-b border-dashed border-slate-300 hover:border-indigo-400 focus:border-indigo-500 focus:border-solid"
          title="Ads required (the KPI) — click to edit" />
      ) : (<span className="w-7 text-center text-sm font-bold tabular-nums text-slate-900">{cell.target ?? "–"}</span>)}
      {status === "saving" && <span className="absolute -right-1.5 -top-1.5 h-2 w-2 animate-ping rounded-full bg-indigo-400" title="Saving…" />}
      {status === "saved" && <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white" title="Saved">✓</span>}
      {status === "error" && <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white" title="Save failed — try again">!</span>}
    </div>
  );
}

function RollupStat({ cell }: { cell: Cell }) {
  return (
    <span className="inline-flex items-baseline justify-center gap-1">
      <span className={`text-sm font-extrabold tabular-nums ${cell.briefs ? "text-slate-700" : "text-slate-400"}`}>{cell.briefs}</span>
      <span className="text-xs text-slate-400">/</span>
      <span className="text-sm font-extrabold tabular-nums text-slate-900">{cell.target ?? "–"}</span>
    </span>
  );
}

function LeakStat({ cell }: { cell: Cell }) {
  return (
    <span className="inline-flex items-baseline justify-center gap-1 text-xs tabular-nums">
      <span className="font-bold text-sky-700">{cell.briefs}</span>
      <span className="text-slate-400">br</span>
      {cell.ads > 0 && <span className="text-emerald-600">· {cell.ads} ed</span>}
    </span>
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────────
function EditPanel({ angles, cs, angleBank, csBank, subConfig, angleCounts, onDeleteAngle, onAddAngle, onAddSub, onDeleteSub, onDeleteCs, onAddCs, onAddAllCs }: {
  angles: { id: string; name: string }[]; cs: { id: string; cs_label: string }[];
  angleBank: string[]; csBank: string[]; subConfig: Record<string, SubCfg>;
  angleCounts: Record<string, Record<string, number>>;
  onDeleteAngle: (id: string) => void; onAddAngle: (name: string) => void;
  onAddSub: (angleId: string, name: string) => void; onDeleteSub: (id: string) => void;
  onDeleteCs: (id: string) => void; onAddCs: (label: string) => void; onAddAllCs: () => void;
}) {
  const [csPick, setCsPick] = useState("");
  const [focusCs, setFocusCs] = useState<Set<string>>(new Set());
  const [subOpen, setSubOpen] = useState<Set<string>>(new Set());
  useEffect(() => { setCsPick(csBank[0] ?? ""); }, [csBank]);

  const toggleSubOpen = (id: string) => setSubOpen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const toggleFocus = (label: string) => setFocusCs((s) => {
    const n = new Set(s), k = fnorm(label);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  // Which CS the counts are scoped to: the focused ones, or every configured CS if none picked.
  const focusKeys = focusCs.size ? [...focusCs] : cs.map((c) => fnorm(c.cs_label));
  const sumCounts = (m?: Record<string, number>) => focusKeys.reduce((n, k) => n + (m?.[k] ?? 0), 0);

  const scopeLabel = focusCs.size
    ? cs.filter((c) => focusCs.has(fnorm(c.cs_label))).map((c) => c.cs_label).join(", ")
    : "all strategists";

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-800">
        <span className="h-2 w-2 rounded-full bg-indigo-500" /> Edit mode
        <span className="font-normal normal-case text-indigo-500/80">— type a new value (existing ones are suggested) and press ＋. Every angle keeps an auto “Other” sub-angle.</span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"><span className="text-indigo-400">1 · </span>Creative strategists <span className="font-normal normal-case text-slate-400">— click a name to count ads for just them (pick several to sum)</span></div>
        <div className="flex flex-wrap items-center gap-2">
          {cs.length === 0 && <span className="text-xs text-slate-400">none</span>}
          {cs.map((c) => <Chip key={c.id} label={c.cs_label} tone="cs" active={focusCs.has(fnorm(c.cs_label))} onClick={() => toggleFocus(c.cs_label)} onDelete={() => onDeleteCs(c.id)} />)}
          {csBank.length > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <select value={csPick} onChange={(e) => setCsPick(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-indigo-400">
                {csBank.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <button onClick={() => onAddCs(csPick)} className="h-8 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900">＋ Add CS</button>
              <button onClick={onAddAllCs} title="Add every remaining CS at once" className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Add all</button>
            </span>
          ) : <span className="text-xs text-slate-400">all of this brand’s CSs added</span>}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Counts below are for: <b className="text-slate-600">{scopeLabel}</b>{focusCs.size > 0 && <button onClick={() => setFocusCs(new Set())} className="ml-2 text-indigo-500 hover:underline">reset</button>}</div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"><span className="text-indigo-400">2 · </span>Angles</div>
        <div className="flex flex-wrap items-center gap-2">
          {angles.length === 0 && <span className="text-xs text-slate-400">none yet</span>}
          {angles.map((a) => <Chip key={a.id} label={a.name} tone="angle" onDelete={() => onDeleteAngle(a.id)} />)}
          <AddControl listId="angle-bank" suggestions={angleBank} placeholder="New angle…" addLabel="＋ Add angle" onAdd={onAddAngle} />
        </div>
        <SuggestChips items={angleBank} countOf={(v) => sumCounts(angleCounts[v])} onAdd={onAddAngle} />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"><span className="text-indigo-400">3 · </span>Sub-angles <span className="font-normal normal-case text-slate-400">— the KPI lives here</span></div>
        <div className="space-y-2">
          {angles.length === 0 && <span className="text-xs text-slate-400">add an angle first</span>}
          {angles.map((a) => <SubAngleRow key={a.id} angle={a} cfg={subConfig[a.id]} countOf={(v) => sumCounts(subConfig[a.id]?.counts?.[v])} open={subOpen.has(a.id)} onToggle={() => toggleSubOpen(a.id)} onAddSub={onAddSub} onDeleteSub={onDeleteSub} />)}
        </div>
      </div>
    </div>
  );
}

// Clickable "from ads" suggestions, each showing how many ads the scoped CS made there.
function SuggestChips({ items, countOf, onAdd }: { items: string[]; countOf: (s: string) => number; onAdd: (s: string) => void }) {
  const ranked = items.map((s) => ({ s, n: countOf(s) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (!ranked.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">From ads:</span>
      {ranked.map(({ s, n }) => (
        <button key={s} onClick={() => onAdd(s)} title={`Add “${s}” — ${n} ad${n > 1 ? "s" : ""} by the scoped strategist(s)`}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-100">
          {s}<span className="rounded-full bg-emerald-600/15 px-1 text-[10px] font-bold tabular-nums text-emerald-700">{n}</span>
        </button>
      ))}
    </div>
  );
}

function SubAngleRow({ angle, cfg, countOf, open, onToggle, onAddSub, onDeleteSub }: {
  angle: { id: string; name: string }; cfg?: SubCfg; countOf: (s: string) => number;
  open: boolean; onToggle: () => void;
  onAddSub: (angleId: string, name: string) => void; onDeleteSub: (id: string) => void;
}) {
  const bank = cfg?.bank ?? [];
  const subs = cfg?.subs ?? [];
  const summary = subs.length === 0 ? "Other only" : `${subs.length} sub-angle${subs.length === 1 ? "" : "s"} + Other`;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <span className="w-3 text-xs text-slate-400">{open ? "▾" : "▸"}</span>
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">{angle.name}</span>
        <span className="text-[11px] text-slate-400">{summary}</span>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {subs.map((s) => <Chip key={s.id} label={s.name} tone="sub" onDelete={() => onDeleteSub(s.id)} />)}
            <Chip label="Other" muted />
            <AddControl listId={`sub-bank-${angle.id}`} suggestions={bank} placeholder="New sub-angle…" addLabel="＋ Add sub-angle" small onAdd={(name) => onAddSub(angle.id, name)} />
          </div>
          <SuggestChips items={bank} countOf={countOf} onAdd={(name) => onAddSub(angle.id, name)} />
        </div>
      )}
    </div>
  );
}

function AddControl({ listId, suggestions, placeholder, addLabel, small, onAdd }: {
  listId: string; suggestions: string[]; placeholder: string; addLabel: string; small?: boolean; onAdd: (name: string) => void;
}) {
  const [val, setVal] = useState("");
  const submit = () => { const v = val.trim(); if (v) { onAdd(v); setVal(""); } };
  const h = small ? "h-7" : "h-8";
  return (
    <span className="inline-flex items-center gap-1.5">
      <input list={listId} value={val} placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        className={`${h} w-36 rounded-lg border border-slate-300 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-indigo-400`} />
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <button onClick={submit} disabled={!val.trim()}
        className={`${h} rounded-lg px-2.5 text-xs font-semibold text-white ${val.trim() ? "bg-slate-800 hover:bg-slate-900" : "bg-slate-300 cursor-not-allowed"}`}>{addLabel}</button>
    </span>
  );
}

function Chip({ label, onDelete, muted, tone, onClick, active }: { label: string; onDelete?: () => void; muted?: boolean; tone?: "angle" | "sub" | "cs"; onClick?: () => void; active?: boolean }) {
  const palette = muted
    ? "border-slate-200 bg-slate-50 text-slate-400"
    : tone === "angle" ? "border-indigo-200 bg-indigo-50 text-indigo-800"
    : tone === "cs" ? "border-sky-200 bg-sky-50 text-sky-800"
    : "border-slate-300 bg-white text-slate-700";
  return (
    <span onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${palette} ${onClick ? "cursor-pointer select-none" : ""} ${active ? "ring-2 ring-sky-500 ring-offset-1" : ""}`}>
      {label}
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title={`Remove ${label}`} className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-rose-100 hover:text-rose-600">✕</button>
      )}
      {muted && <span className="text-[9px] uppercase tracking-wide text-slate-300">always on</span>}
    </span>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<label className="flex flex-col gap-1"><span className="text-xs font-medium text-slate-500">{label}</span>{children}</label>);
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400">
      {options.length === 0 && <option value="">—</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
