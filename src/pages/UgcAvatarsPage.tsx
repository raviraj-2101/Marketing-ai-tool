import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Search, Loader2, Filter, Check, Mic, Plus, X, Trash2, Download, AlertTriangle, Sparkles, RefreshCw, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useBrands } from "@/hooks/useBrands";
import { useProducts } from "@/hooks/useProducts";

const UGC_API_BASE: string =
  (import.meta.env.VITE_SERVER_URL as string);

function makeUgcApiRequest(getToken: () => string | null) {
  return async function ugcApiRequest(
    method: string,
    url: string,
    data?: unknown,
  ): Promise<Response> {
    const token = getToken();
    const res = await fetch(`${UGC_API_BASE}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  };
}

type Scene = {
  scene_id: string;
  heygen_scene_id: string;
  name: string | null;
  image_url: string | null;
  is_product?: boolean | null;
  product_tags?: string[] | string | null;
  product_tag?: string[] | string | null;
  product?: unknown;
  product_name?: string | null;
  products?: unknown;
};

type Look = {
  scene_group_id: string;
  scenes: Scene[];
};

type AvatarRow = {
  id: string;
  heygen_avatar_id?: string | null;
  name: string;
  voice_name: string | null;
  voice_id: string;
  /** Saved voice speed for renders (null = global 0.95 default). */
  voice_speed?: number | null;
  image_url: string | null;
  type: "doctor" | "natural_wellness" | "normal" | "any" | null;
  description?: string | null;
  looks?: Look[];
  has_paired_scenes?: boolean;
  look_count?: number;
  quality_status?: "approved" | "needs_review" | "disabled";
  quality_note?: string | null;
  is_configure?: boolean | string | null;
  voice_clone_status?: "processing" | "done" | "completed" | "error" | "is_error" | null;
  is_error?: boolean | null;
  voice_clone_error?: string | null;
  voice_clone_message?: string | null;
  elevenlabs_voice_id?: string | null;
  eleven_voice_id?: string | null;
  voice_clone_id?: string | null;
};

// Tolerant read of the ElevenLabs (cloned) voice id off an avatar row, since the
// backend field name isn't pinned down. Returns null when there is no clone.
function elevenVoiceIdOf(a?: Partial<AvatarRow> | null): string | null {
  return (a?.elevenlabs_voice_id || a?.eleven_voice_id || a?.voice_clone_id || null) || null;
}

type SettableType = "doctor" | "natural_wellness" | "normal";

const TYPE_LABEL: Record<SettableType | "any", { label: string; cls: string }> = {
  doctor:           { label: "Doctor",           cls: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-300" },
  natural_wellness: { label: "Natural wellness", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300" },
  normal:           { label: "Normal",           cls: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300" },
  any:              { label: "Unclassified",     cls: "border-border bg-muted/40 text-foreground/70" },
};

const TYPE_OPTIONS: { value: SettableType; label: string }[] = [
  { value: "doctor",           label: "Doctor" },
  { value: "natural_wellness", label: "Natural wellness" },
  { value: "normal",           label: "Normal" },
];

export default function UgcAvatarsPage() {
  const { user, getToken } = useAuth();
  const apiRequest = useMemo(() => makeUgcApiRequest(getToken), [getToken]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  // Sync Avatars button — manually triggers the backend HeyGen image-URL refresh
  // (refreshExpiredAvatarImages via POST /api/refresh-avatar-urls). The same job
  // also runs automatically on a daily cron; this button is for on-demand testing.
  // It re-signs expired/expiring avatar + scene image_url values and soft-deletes
  // assets HeyGen no longer has, then refreshes the avatar list.
  //
  // (Previously this called /api/sync-deleted-heygen — that reconciliation now
  // happens inside the refresh job, so the button drives the new endpoint.)
  const handleSyncAvatars = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest("POST", "/api/refresh-avatar-urls");
      const body = await res.json().catch(() => ({}));
      const updatedAvatars = body?.updated_avatars ?? 0;
      const updatedScenes  = body?.updated_scenes ?? 0;
      const removedAvatars = body?.soft_deleted_avatars ?? 0;
      const removedScenes  = body?.soft_deleted_scenes ?? 0;
      const errorCount = Array.isArray(body?.errors) ? body.errors.length : 0;
      toast({
        title: "Avatar image URLs refreshed",
        description:
          `Updated ${updatedAvatars} avatar(s), ${updatedScenes} scene(s)` +
          (removedAvatars || removedScenes
            ? ` · removed ${removedAvatars} avatar(s) / ${removedScenes} scene(s) missing in HeyGen`
            : "") +
          (errorCount ? ` · ${errorCount} error(s)` : ""),
        variant: errorCount ? "destructive" : undefined,
      });
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
    } catch (err: unknown) {
      toast({
        title: "Refresh failed",
        description: (err as Error)?.message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const avatarsQ = useQuery<AvatarRow[]>({
    queryKey: ["/api/options/avatars", "all-for-avatars-tab"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/options/avatars?type=mix&includeAll=1");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // ---- Voice-clone status (separate poll) ---------------------------------
  // The card list comes from /api/options/avatars; voice-clone job status is a
  // separate /api/avatars feed merged in by id. `cloneOverrides` holds ids the
  // user just retried (got a 202) but the poll hasn't yet confirmed, so the
  // badge flips to "processing" immediately.
  const [cloneOverrides, setCloneOverrides] = useState<Record<string, true>>({});
  const cloneOverridesRef = useRef(cloneOverrides);
  useEffect(() => { cloneOverridesRef.current = cloneOverrides; }, [cloneOverrides]);

  const voiceCloneQ = useQuery<AvatarRow[]>({
    queryKey: ["/api/avatars", "voice-clone-status"],
    queryFn: async () => {
      const j = await (await apiRequest("GET", "/api/avatars")).json();
      return Array.isArray(j) ? j : (j.avatars ?? []);
    },
    // Poll every 10s while any avatar is processing (per poll data OR a pending
    // optimistic override); stop once none are.
    refetchInterval: (q) => {
      const rows = q.state.data ?? [];
      const polling = rows.some((a) => a.voice_clone_status === "processing");
      const overriding = Object.keys(cloneOverridesRef.current).length > 0;
      return polling || overriding ? 10_000 : false;
    },
  });

  // Once the poll confirms an id is processing, drop its optimistic override so
  // the poll becomes the single source of truth (incl. later done/error).
  useEffect(() => {
    const rows = voiceCloneQ.data;
    if (!rows) return;
    setCloneOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        if (rows.find((r) => r.id === id)?.voice_clone_status === "processing") {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [voiceCloneQ.data]);

  const cloneStatusById = useMemo(() => {
    const map: Record<string, { status: AvatarRow["voice_clone_status"]; isError: boolean; errorMessage: string | null; elevenVoiceId: string | null }> = {};
    for (const a of voiceCloneQ.data ?? []) {
      const status = a.voice_clone_status ?? null;
      map[a.id] = {
        status,
        isError: a.is_error === true || status === "error" || status === "is_error",
        errorMessage: a.voice_clone_error || a.voice_clone_message || null,
        elevenVoiceId: elevenVoiceIdOf(a),
      };
    }
    for (const id of Object.keys(cloneOverrides)) {
      map[id] = { ...(map[id] ?? { status: null, isError: false, errorMessage: null, elevenVoiceId: null }), status: "processing", isError: false };
    }
    return map;
  }, [voiceCloneQ.data, cloneOverrides]);

  const [filter, setFilter] = useState<SettableType | "all" | "unset">("all");
  const [query, setQuery] = useState("");

  const isUnsetType = (a: AvatarRow) => !a.type || a.type === "any";

  const filtered = useMemo(() => {
    const all = avatarsQ.data || [];
    const realPool = all.filter((a) => {
      const hay = `${a.name || ""} ${a.description || ""}`.toLowerCase();
      return !/\btest\b/.test(hay);
    });
    const byType =
      filter === "all"   ? realPool
      : filter === "unset" ? realPool.filter(isUnsetType)
      : realPool.filter((a) => a.type === filter);
    const q = query.trim().toLowerCase();
    if (!q) return byType;
    return byType.filter((a) =>
      [a.name, a.voice_name, a.id, a.description]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [avatarsQ.data, filter, query]);

  const counts = useMemo(() => {
    const all = avatarsQ.data || [];
    const realPool = all.filter((a) => !/\btest\b/.test(`${a.name || ""} ${a.description || ""}`.toLowerCase()));
    return {
      total: realPool.length,
      doctor: realPool.filter((a) => a.type === "doctor").length,
      natural: realPool.filter((a) => a.type === "natural_wellness").length,
      normal: realPool.filter((a) => a.type === "normal").length,
      unset: realPool.filter((a) => !a.type || a.type === "any").length,
      hidden: all.length - realPool.length,
    };
  }, [avatarsQ.data]);

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col overflow-hidden">
        <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
            <Users className="size-4 text-primary" />
            <span className="text-[14px] font-semibold tracking-tight">Avatars</span>
            <span className="ml-2 text-[11.5px] text-muted-foreground">{user?.email}</span>
            <div className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <Loader2 className={`size-3 ${avatarsQ.isFetching ? "animate-spin" : "opacity-30"}`} />
              {avatarsQ.isFetching ? "Loading…" : "Live"}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight">Configured pool</h2>
                <p className="text-[12px] text-muted-foreground">
                  {counts.total} avatar{counts.total === 1 ? "" : "s"} available to the generator
                  {counts.hidden > 0 && (
                    <span className="ml-1.5 text-muted-foreground/70">
                      · {counts.hidden} hidden (named "Test")
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSyncAvatars}
                disabled={syncing}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11.5px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {syncing
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <RefreshCw className="size-3.5" />}
                {syncing ? "Syncing…" : "Sync Avatars"}
              </button>
              <div className="relative w-full sm:w-64">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, voice, or id"
                  className="pl-8 h-9 text-[13px]"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="size-3 text-muted-foreground/70" />
              {([
                { id: "all",              label: `All · ${counts.total}` },
                { id: "doctor",           label: `Doctor · ${counts.doctor}` },
                { id: "natural_wellness", label: `Natural wellness · ${counts.natural}` },
                { id: "normal",           label: `Normal · ${counts.normal}` },
                { id: "unset",            label: `Not set · ${counts.unset}` },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFilter(opt.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    filter === opt.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 bg-card hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {avatarsQ.isLoading && (
              <div className="rounded-2xl border border-border/40 bg-card/30 px-6 py-12 text-center text-[12.5px] text-muted-foreground">
                <Loader2 className="size-5 mx-auto animate-spin mb-2" />
                Loading avatars…
              </div>
            )}
            {!avatarsQ.isLoading && filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-8 py-12 text-center">
                <Users className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                <h3 className="text-[14px] font-semibold mb-1">No avatars match</h3>
                <p className="text-[12.5px] text-muted-foreground">Try clearing the filter or search.</p>
              </div>
            )}

            <ImportFromHeygenPanel apiRequest={apiRequest} />

            {!avatarsQ.isLoading && filtered.length > 0 && (
              <div className="space-y-5">
                {filtered.map((a) => (
                  <AvatarSection
                    key={a.id}
                    avatar={a}
                    apiRequest={apiRequest}
                    voiceClone={cloneStatusById[a.id]}
                    onCloneStarted={(id) => setCloneOverrides((p) => ({ ...p, [id]: true }))}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}

type ApiRequestFn = (method: string, url: string, data?: unknown) => Promise<Response>;

// Voice-speed choices for HeyGen renders. 0.95 is the long-standing global
// default (calmer gestures). Slow-talking avatars (e.g. Ryan Calloway) get
// 1.1–1.2 so the pace is baked in at render time — no post-generation
// speed-up pass needed. NULL in the DB = "use the 0.95 default".
const VOICE_SPEED_OPTIONS = [0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];

// Editable voice-speed chip. Writes via PATCH /api/avatars/:id/voice-speed.
function SpeedChip({ avatarId, speed, apiRequest }: { avatarId: string; speed: number | null | undefined; apiRequest: ApiRequestFn }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const current = typeof speed === "number" ? speed : null;

  const save = async (next: number | null) => {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/avatars/${avatarId}/voice-speed`, { voice_speed: next });
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      toast({ title: next ? `Voice speed set to ${next}×` : "Voice speed reset to default (0.95×)" });
    } catch (err: unknown) {
      toast({ title: "Could not update voice speed", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select
      value={current != null ? String(current) : undefined}
      onValueChange={(v) => save(v === "__unset" ? null : Number(v))}
      disabled={saving}
    >
      <SelectTrigger
        className={`h-6 w-auto gap-1 rounded-full border px-2 text-[10.5px] font-semibold leading-none whitespace-nowrap tabular-nums [&>span]:line-clamp-none [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:opacity-70 ${
          current != null
            ? "border-sky-400/40 bg-sky-500/10 text-sky-300"
            : "border-border/70 bg-card/60 text-muted-foreground"
        } ${saving ? "opacity-60" : ""}`}
        title="Voice speed used for this avatar's video renders"
      >
        <SelectValue placeholder="Speed 0.95× (default)" />
      </SelectTrigger>
      <SelectContent>
        {VOICE_SPEED_OPTIONS.map((s) => (
          <SelectItem key={s} value={String(s)} className="text-[12px] tabular-nums">
            {s === 0.95 ? `${s}× (default)` : `${s}×`}
          </SelectItem>
        ))}
        {current != null && (
          <SelectItem value="__unset" className="text-[12px] text-muted-foreground">Reset to default</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

// Editable avatar-type chip. Shows the current type, or a dashed "Set avatar
// type" prompt when unset. Writes via PATCH /api/avatars/:id/type.
function TypeChip({ avatarId, type, apiRequest }: { avatarId: string; type: AvatarRow["type"]; apiRequest: ApiRequestFn }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const current: SettableType | null = type && type !== "any" ? (type as SettableType) : null;

  const save = async (next: SettableType | null) => {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/avatars/${avatarId}/type`, { type: next });
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      toast({ title: next ? `Type set to ${TYPE_LABEL[next].label}` : "Type cleared" });
    } catch (err: unknown) {
      toast({ title: "Could not update type", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const triggerCls = current
    ? TYPE_LABEL[current].cls
    : "border-dashed border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-300";

  return (
    <Select
      value={current ?? undefined}
      onValueChange={(v) => save(v === "__unset" ? null : (v as SettableType))}
      disabled={saving}
    >
      <SelectTrigger
        className={`h-7 w-auto gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold leading-none whitespace-nowrap [&>span]:line-clamp-none [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:opacity-70 ${triggerCls} ${saving ? "opacity-60" : ""}`}
      >
        <SelectValue placeholder="Set avatar type" />
      </SelectTrigger>
      <SelectContent>
        {TYPE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[12px]">{o.label}</SelectItem>
        ))}
        {current && (
          <SelectItem value="__unset" className="text-[12px] text-muted-foreground">Clear (unset)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

function AvatarSection({ avatar, apiRequest, voiceClone, onCloneStarted }: {
  avatar: AvatarRow;
  apiRequest: ApiRequestFn;
  voiceClone?: { status: AvatarRow["voice_clone_status"]; isError: boolean; errorMessage?: string | null; elevenVoiceId?: string | null };
  onCloneStarted?: (id: string) => void;
}) {
  const looks = avatar.looks || [];
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState<"delete" | "toggle" | null>(null);
  const isApproved = avatar.is_configure === true ||
    String(avatar.is_configure).toLowerCase() === "true";
  const hasElevenVoice = !!(elevenVoiceIdOf(avatar) || voiceClone?.elevenVoiceId);

  const setApproved = async (approved: boolean) => {
    setPending("toggle");
    try {
      await apiRequest("PATCH", `/api/avatars/${avatar.id}/is-configure`, { is_configure: approved });
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      toast({ title: approved ? "Avatar Approved" : "Avatar not approved" });
    } catch (err: unknown) {
      toast({ title: "Could not update status", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  const doDelete = async () => {
    setPending("delete");
    try {
      await apiRequest("PATCH", `/api/avatars/${avatar.id}/soft-delete`);
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      toast({ title: `Deleted ${avatar.name}` });
      setDeleteOpen(false);
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  const qualityCls =
    avatar.quality_status === "needs_review" ? "border-amber-400/40 bg-amber-500/5"
    : avatar.quality_status === "disabled" ? "border-destructive/40 bg-destructive/5"
    : "border-border/60 bg-card/40";

  return (
    <section className={`rounded-2xl border ${qualityCls} backdrop-blur-sm overflow-hidden`}>
      <header className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-border/30">
        <div className="size-10 rounded-full bg-muted/40 overflow-hidden shrink-0">
          {avatar.image_url ? (
            <img src={avatar.image_url} alt={avatar.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
              <Users className="size-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold tracking-tight truncate">{avatar.name}</h3>
            <TypeChip avatarId={avatar.id} type={avatar.type} apiRequest={apiRequest} />
            {avatar.quality_status === "disabled" && (
              <span className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider">
                Disabled
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            <VoiceChip
              avatarId={avatar.heygen_avatar_id || avatar.id}
              voiceId={avatar.voice_id || null}
              voiceName={avatar.voice_name || null}
              apiRequest={apiRequest}
            />
            <span className="text-muted-foreground/40">·</span>
            <SpeedChip avatarId={avatar.id} speed={avatar.voice_speed} apiRequest={apiRequest} />
            {(voiceClone?.isError || voiceClone?.status === "processing" || !hasElevenVoice) && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <VoiceCloneButton
                  avatarId={avatar.id}
                  status={voiceClone?.status ?? null}
                  isError={!!voiceClone?.isError}
                  errorMessage={voiceClone?.errorMessage ?? null}
                  hasVoice={hasElevenVoice}
                  onStarted={onCloneStarted}
                />
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span>{looks.flatMap((l) => l.scenes || []).length} scene{looks.flatMap((l) => l.scenes || []).length === 1 ? "" : "s"}</span>
            {avatar.quality_note && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="italic text-amber-300/80" title={avatar.quality_note}>{avatar.quality_note.slice(0, 80)}{avatar.quality_note.length > 80 ? "…" : ""}</span>
              </>
            )}
          </div>
        </div>
        <div className="inline-flex rounded-md border border-border/70 bg-card/60 p-0.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setApproved(true)}
            disabled={pending === "toggle" || isApproved}
            className={`px-2.5 py-1 rounded transition-colors ${
              isApproved
                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30"
                : "text-muted-foreground hover:text-foreground"
            } disabled:cursor-not-allowed`}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setApproved(false)}
            disabled={pending === "toggle" || !isApproved}
            className={`px-2.5 py-1 rounded transition-colors ${
              !isApproved
                ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"
                : "text-muted-foreground hover:text-foreground"
            } disabled:cursor-not-allowed`}
          >
            Pending
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11.5px] font-semibold text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="size-3.5" />
          Add a look
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={pending === "delete"}
          aria-label="Delete avatar"
          title="Delete avatar"
          className="inline-flex items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 size-8 text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="size-3.5" />
        </button>
      </header>
      {deleteOpen && (
        <DeleteAvatarModal
          avatarName={avatar.name}
          avatarImageUrl={avatar.image_url}
          lookCount={looks.length}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={doDelete}
          busy={pending === "delete"}
        />
      )}
      {addOpen && (
        <AddLookModal
          avatarId={avatar.id}
          heygenAvatarId={avatar.heygen_avatar_id}
          avatarName={avatar.name}
          basisWithoutUrl={avatar.image_url}
          basisWithUrl={avatar.image_url}
          onClose={() => setAddOpen(false)}
          apiRequest={apiRequest}
        />
      )}
      <ScenesGrid avatar={avatar} apiRequest={apiRequest} />
    </section>
  );
}

function VoiceChip({
  avatarId, voiceId, voiceName, apiRequest,
}: {
  avatarId: string;
  voiceId: string | null;
  voiceName: string | null;
  apiRequest: ApiRequestFn;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(voiceId || "");
  const [busy, setBusy] = useState(false);
  const display = voiceName || (voiceId ? voiceId.slice(0, 8) : null);

  const save = async () => {
    const v = draft.trim();
    if (v && !/^[A-Za-z0-9_-]{16,}$/.test(v)) {
      toast({
        title: "Voice id doesn't look right",
        description: "HeyGen voice IDs are 16+ alphanumeric chars. Find one at app.heygen.com → Voices.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const r = await apiRequest("PATCH", `/api/avatars/${avatarId}/voice`, {
        voiceId: v || null,
        voiceName: null,
      });
      const body = await r.json().catch(() => ({}));
      if (!body.ok) throw new Error(body?.message || "Failed");
      toast({
        title: v ? "Voice set" : "Voice cleared",
        description: v ? "Lipsync should now match this avatar." : "Renders will use the env default — expect drift.",
      });
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      setEditing(false);
    } catch (err: unknown) {
      toast({ title: "Couldn't update voice", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="HeyGen voice id (16+ chars)"
          className="h-6 px-2 rounded border border-border/85 bg-background text-[11px] font-mono w-44 focus:outline-none focus:ring-1 focus:ring-primary/40"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setEditing(false); setDraft(voiceId || ""); }
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-0.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-2.5 animate-spin" /> : <Check className="size-2.5" />}
          Save
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setDraft(voiceId || ""); }}
          disabled={busy}
          className="inline-flex items-center gap-0.5 rounded-md text-muted-foreground hover:text-foreground px-1.5 py-0.5 text-[10px]"
        >
          Cancel
        </button>
      </span>
    );
  }
  if (!voiceId) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
      >
        <AlertTriangle className="size-2.5" />
        No voice · click to set
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
    >
      <Mic className="size-2.5" />
      {display}
    </button>
  );
}

// Chip-style trigger to (re)start a HeyGen voice clone for an avatar. Shows a
// status indicator (red dot = error, spinner = processing, green check = done).
// Status is owned by the parent's /api/avatars poll + optimistic override; this
// component only fires the retry and reports the optimistic "processing" start.
function VoiceCloneButton({
  avatarId, status, isError, errorMessage, hasVoice = true, onStarted,
}: {
  avatarId: string;
  status: AvatarRow["voice_clone_status"];
  isError: boolean;
  errorMessage?: string | null;
  hasVoice?: boolean;
  onStarted?: (id: string) => void;
}) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const isProcessing = status === "processing";
  const isDone = !isError && (status === "done" || status === "completed");
  const busy = submitting || isProcessing;

  const retry = async () => {
    if (busy) return;
    setSubmitting(true);
    try {
      // Raw fetch (not the shared apiRequest) so we can read the error body —
      // apiRequest throws "HTTP <status>" and discards the message.
      const token = getToken();
      const res = await fetch(`${UGC_API_BASE}/api/avatars/${avatarId}/voice-clone/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status === 202) {
        onStarted?.(avatarId);
        qc.invalidateQueries({ queryKey: ["/api/avatars", "voice-clone-status"] });
      } else if (res.ok) {
        qc.invalidateQueries({ queryKey: ["/api/avatars", "voice-clone-status"] });
      } else {
        const body = await res.json().catch(() => ({} as Record<string, unknown>));
        const msg =
          (body?.message as string) ||
          (body?.error as string) ||
          `Voice clone request failed (${res.status})`;
        toast({ title: "Couldn't start voice clone", description: msg, variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: "Couldn't start voice clone", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const label =
    isProcessing ? "Cloning…"
    : isError ? "Regenerate voice"
    : !hasVoice ? "Clone voice"
    : isDone ? "Regenerate voice"
    : "Generate voice";

  const title =
    isProcessing ? "Voice clone in progress…"
    : isError
      ? (errorMessage
          ? `ElevenLabs voice clone error: ${errorMessage}`
          : "ElevenLabs voice clone failed — click to retry")
    : !hasVoice ? "No ElevenLabs voice — click to clone"
    : isDone ? "Voice clone ready — click to regenerate"
    : "Click to generate a voice clone";

  return (
    <button
      type="button"
      onClick={retry}
      disabled={busy}
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isProcessing ? (
        <Loader2 className="size-2.5 animate-spin" />
      ) : isError ? (
        <span className="size-2 rounded-full bg-destructive" aria-hidden />
      ) : isDone ? (
        <Check className="size-2.5 text-emerald-500" />
      ) : (
        <RefreshCw className="size-2.5" />
      )}
      {label}
    </button>
  );
}

function sceneProductLabel(scene: Scene): string {
  const raw = scene as Record<string, unknown>;
  const normalize = (v: unknown): string => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(normalize).filter(Boolean).join(", ");
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      return normalize(o.name ?? o.product_name ?? o.label ?? "");
    }
    return String(v);
  };
  for (const key of ["product_tags", "product_tag", "product_name", "product", "products"]) {
    const val = normalize(raw[key]);
    if (val) return val;
  }
  return "";
}

function sceneIsProduct(scene: Scene): boolean {
  if (typeof scene.is_product === "boolean") return scene.is_product;
  return !!sceneProductLabel(scene);
}

function ScenesGrid({ avatar, apiRequest }: { avatar: AvatarRow; apiRequest: ApiRequestFn }) {
  const groups = (avatar.looks || []).filter((l) => (l.scenes || []).length > 0);
  const [genGroup, setGenGroup] = useState<Look | null>(null);
  const [viewScene, setViewScene] = useState<Scene | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [deletingScene, setDeletingScene] = useState<Scene | null>(null);
  const [pendingSceneId, setPendingSceneId] = useState<string | null>(null);

  const confirmDeleteScene = async () => {
    if (!deletingScene) return;
    const id = deletingScene.scene_id;
    setPendingSceneId(id);
    try {
      await apiRequest("PATCH", `/api/scenes/${id}/soft-delete`);
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      toast({ title: "Scene deleted", description: deletingScene.name || undefined });
      setDeletingScene(null);
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setPendingSceneId(null);
    }
  };
  if (groups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12.5px] text-muted-foreground italic">
        No scenes yet — click "Add a look" to add scenes.
      </div>
    );
  }
  return (
    <div className="p-4 space-y-4">
      {groups.map((look, gi) => {
        const scenes = [...(look.scenes || [])].sort((a, b) => Number(sceneIsProduct(a)) - Number(sceneIsProduct(b)));
        return (
          <div key={look.scene_group_id} className="rounded-xl border border-border/40 bg-background/30 p-3">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/85 mb-2">
              Group {gi + 1}
              <span className="ml-1.5 normal-case font-normal text-muted-foreground/60">
                · {scenes.length} scene{scenes.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {scenes.map((scene) => {
                const prod = sceneProductLabel(scene);
                const isProd = sceneIsProduct(scene);
                return (
                  <div key={scene.scene_id} className="group relative rounded-xl border border-border/40 bg-background/50 overflow-hidden">
                    <div className="aspect-[9/16] bg-muted/30 overflow-hidden relative">
                      {scene.image_url ? (
                        <img
                          src={scene.image_url}
                          alt={scene.name || "Scene"}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                          <Users className="size-5" />
                        </div>
                      )}
                      {isProd && prod && (
                        <span
                          className="absolute top-1.5 left-1.5 max-w-[calc(100%-0.75rem)] rounded-md bg-primary/90 text-primary-foreground px-1.5 py-0.5 text-[9.5px] font-semibold truncate"
                          title={prod}
                        >
                          {prod}
                        </span>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/30 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setViewScene(scene); }}
                          title="View scene"
                          aria-label="View scene"
                          className="size-10 rounded-full bg-white/95 text-slate-900 shadow-lg ring-1 ring-black/10 hover:bg-white hover:scale-110 transition-all duration-150 flex items-center justify-center"
                        >
                          <Eye className="size-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeletingScene(scene); }}
                          disabled={pendingSceneId === scene.scene_id}
                          title="Delete scene"
                          aria-label="Delete scene"
                          className="size-10 rounded-full bg-destructive text-destructive-foreground shadow-lg ring-1 ring-black/20 hover:bg-destructive/90 hover:scale-110 transition-all duration-150 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                          {pendingSceneId === scene.scene_id
                            ? <Loader2 className="size-[18px] animate-spin" />
                            : <Trash2 className="size-[18px]" />}
                        </button>
                      </div>
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="text-[11px] font-medium truncate" title={scene.name || undefined}>
                        {scene.name || "Unnamed"}
                      </p>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setGenGroup(look)}
                className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center justify-center gap-1.5 aspect-[9/16] text-primary"
              >
                <Sparkles className="size-5" />
                <span className="text-[11px] font-semibold">Generate Scene</span>
              </button>
            </div>
          </div>
        );
      })}
      {genGroup && (
        <AddLookModal
          avatarId={avatar.id}
          heygenAvatarId={avatar.heygen_avatar_id}
          avatarName={avatar.name}
          basisWithoutUrl={(genGroup.scenes || []).find((s) => !sceneIsProduct(s))?.image_url ?? avatar.image_url}
          basisWithUrl={(genGroup.scenes || []).find((s) => !sceneIsProduct(s))?.image_url ?? avatar.image_url}
          existingBaseUrl={(genGroup.scenes || []).find((s) => !sceneIsProduct(s))?.image_url ?? avatar.image_url}
          sceneGroupId={genGroup.scene_group_id}
          onClose={() => setGenGroup(null)}
          apiRequest={apiRequest}
        />
      )}
      {viewScene && (
        <ViewSceneModal scene={viewScene} onClose={() => setViewScene(null)} />
      )}
      {deletingScene && (
        <DeleteSceneModal
          scene={deletingScene}
          onCancel={() => setDeletingScene(null)}
          onConfirm={confirmDeleteScene}
          busy={pendingSceneId === deletingScene.scene_id}
        />
      )}
    </div>
  );
}

function DeleteSceneModal({
  scene, onCancel, onConfirm, busy,
}: {
  scene: Scene;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const sceneLabel = scene.name || "Unnamed scene";
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-b from-destructive/15 via-destructive/5 to-transparent px-6 pt-7 pb-5 text-center">
          <div className="absolute top-3 right-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              aria-label="Close"
              className="size-7 rounded-md hover:bg-muted/40 flex items-center justify-center text-muted-foreground disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="relative mx-auto size-20">
            <div className="absolute inset-0 rounded-full bg-destructive/20 blur-xl" />
            <div className="relative size-20 rounded-full ring-4 ring-destructive/30 ring-offset-2 ring-offset-card overflow-hidden bg-muted/40 flex items-center justify-center">
              {scene.image_url ? (
                <img src={scene.image_url} alt={sceneLabel} className="w-full h-full object-cover" />
              ) : (
                <Users className="size-8 text-muted-foreground/60" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 size-7 rounded-full bg-destructive text-destructive-foreground ring-2 ring-card flex items-center justify-center shadow-lg">
              <AlertTriangle className="size-3.5" />
            </div>
          </div>
          <h3 className="text-[16px] font-semibold text-foreground mt-4">Are you sure?</h3>
          <p className="text-[12px] text-muted-foreground mt-1.5 max-w-xs mx-auto">
            You're about to delete the scene <span className="font-semibold text-foreground">"{sceneLabel}"</span>.
            This action can't be undone from this tool.
          </p>
        </div>

        <footer className="px-6 py-4 bg-muted/20 border-t border-border/40 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {busy ? "Deleting…" : "Delete scene"}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function ViewSceneModal({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const prod = sceneProductLabel(scene);
  const isProd = sceneIsProduct(scene);
  const sceneLabel = scene.name || "Unnamed scene";
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-auto max-w-[min(92vw,720px)] max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl overflow-hidden bg-neutral-950 ring-1 ring-white/10 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 text-slate-900">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Eye className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight truncate">{sceneLabel}</h3>
            {isProd && prod && (
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                Product · <span className="text-slate-800">{prod}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-8 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center justify-center shrink-0"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 flex items-center justify-center">
          {scene.image_url ? (
            <img
              src={scene.image_url}
              alt={sceneLabel}
              className="block w-auto h-auto max-w-full max-h-[calc(100dvh-7rem)] object-contain"
            />
          ) : (
            <div className="text-white/60 italic text-[12px] py-24 px-8 text-center">
              No image for this scene
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const STEP_LABELS: Record<"setup" | "without" | "with" | "register", string> = {
  setup: "Brand & product",
  without: "Base look (hands free)",
  with: "Product variant",
  register: "Register",
};

function AddLookModal({
  avatarId, avatarName, heygenAvatarId, basisWithoutUrl, basisWithUrl, editMode, forProductSlug, productDisplayName, existingP1HeygenId, existingBaseUrl, sceneGroupId, onClose, apiRequest,
}: {
  avatarId: string;
  heygenAvatarId?: string | null;
  avatarName: string;
  basisWithoutUrl?: string | null;
  basisWithUrl?: string | null;
  editMode?: { sceneGroupId: string; initialName?: string };
  forProductSlug?: string | null;
  productDisplayName?: string | null;
  existingP1HeygenId?: string | null;
  existingBaseUrl?: string | null;
  sceneGroupId?: string | null;
  onClose: () => void;
  apiRequest: ApiRequestFn;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: brands } = useBrands();
  const { products: allProducts } = useProducts();
  const [step, setStep] = useState<"setup" | "without" | "with" | "register">(
    forProductSlug ? "with" : "setup",
  );
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [pastedMockupUrl, setPastedMockupUrl] = useState("");
  const [name, setName] = useState(editMode?.initialName || (forProductSlug && productDisplayName
    ? `${productDisplayName} look` : ""));
  // Default pose prompt — pose/scene intent ONLY. Size, form factor, grip, hands, and the
  // anti-leak sheet rules are appended automatically by the backend locks, so the wording
  // here must never fight them. Specifically banned: "label fully visible" (forces the
  // model to inflate the product so fingers don't cover it), "do not change size" (pins
  // size to packshot framing), and form words like "bottle" (the reference image is the
  // authority on form — naming a form converts pouches into bottles).
  const [prompt, setPrompt] = useState(() => {
    if (forProductSlug && productDisplayName) {
      return `Same person, same scene, same lighting and wardrobe, recomposed as a tight chest-up ` +
        `close-up. They are now holding the ${productDisplayName} product naturally in one hand at ` +
        `upper-chest height, looking at the camera with a slight smile. Relaxed natural grip, label ` +
        `generally facing the camera — a slight natural tilt or fingers partially covering the label ` +
        `is fine. Keep the same hair, face, and outfit exactly as in the reference photo.`;
    }
    if (existingBaseUrl) {
      return `Same person, same scene, same lighting and wardrobe, recomposed as a tight chest-up ` +
        `close-up. They are now holding the product naturally in one hand at upper-chest height, ` +
        `looking at the camera with a slight smile. Relaxed natural grip, label generally facing ` +
        `the camera — a slight natural tilt or fingers partially covering the label is fine. Keep ` +
        `the same hair, face, and outfit exactly as in the reference photo.`;
    }
    return "";
  });
  const [withoutPreview, setWithoutPreview] = useState<{ id: string | null; url: string; base64: string | null } | null>(
    forProductSlug && basisWithoutUrl
      ? { id: "__reuse_existing_p1__", url: basisWithoutUrl, base64: null }
      : existingBaseUrl
        ? { id: "__reuse_existing_p1__", url: existingBaseUrl, base64: null }
        : null,
  );
  const [withPreview, setWithPreview] = useState<{ id: string | null; url: string; base64: string | null } | null>(null);
  const [selectedProductImageUrl, setSelectedProductImageUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [registering, setRegistering] = useState(false);
  // Image model for the product ("with") step: gemini = current 3-step flow (default), gpt = single-pass high-fidelity label.
  const [imageModel, setImageModel] = useState<"gemini" | "gpt">("gemini");
  // Real holding-example photos (up to 5) sent as extra GPT references — they teach the model
  // the natural grip, pouch bend, and true product size. Data-URIs (uploads) or URLs (product images).
  const MAX_GRIP_EXAMPLES = 5;
  const [gripExampleImages, setGripExampleImages] = useState<string[]>([]);
  const gripExampleInputRef = useRef<HTMLInputElement | null>(null);

  const addGripExampleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setGripExampleImages((prev) => (prev.length >= MAX_GRIP_EXAMPLES || prev.includes(url) ? prev : [...prev, url]));
      };
      reader.readAsDataURL(file);
    });
  };

  const toggleGripExample = (url: string) =>
    setGripExampleImages((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : prev.length >= MAX_GRIP_EXAMPLES ? prev : [...prev, url],
    );

  const filteredProducts = (allProducts ?? []).filter(p => p.brand_id === selectedBrandId);
  const selectedProduct = filteredProducts.find(p => p.id === selectedProductId);
  const productHasImages = (selectedProduct?.product_images?.length ?? 0) > 0;
  const canContinueSetup = !!selectedBrandId && !!selectedProductId;
  const skipBase = !!existingBaseUrl;
  const steps: Array<"setup" | "without" | "with" | "register"> = skipBase
    ? ["setup", "with", "register"]
    : ["setup", "without", "with", "register"];

  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => promptRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [step]);

  const generate = async () => {
    if (step === "without" && !basisWithoutUrl) {
      toast({ title: "No basis image", description: "This avatar has no reference photo.", variant: "destructive" });
      return;
    }
    if (step === "with" && !withoutPreview) {
      toast({ title: "P1 required", description: "Generate and approve the base look first.", variant: "destructive" });
      return;
    }
    if (prompt.trim().length < 10) {
      toast({ title: "Prompt too short", description: "Describe the new look in at least 10 chars.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      // Model choice is picked once in the Brand & product step and applies to the whole
      // flow — base look (without) and product variant (with). gemini = default 3-step /
      // scene-analysis path · gpt = single-pass high-fidelity label.
      const genPayload: Record<string, unknown> = { prompt: prompt.trim(), imageModel };

      if (step === "without") {
        genPayload.avatarUrl = basisWithoutUrl;
      } else {
        const avatarBase64 = withoutPreview?.base64;
        if (avatarBase64) {
          genPayload.avatarBase64 = avatarBase64;
        } else {
          genPayload.avatarUrl = withoutPreview?.url;
        }
        const productUrl = selectedProductImageUrl || pastedMockupUrl.trim() || undefined;
        if (productUrl) {
          genPayload.productUrl = productUrl;
          genPayload.isProductImage = true;
        }
        // Real holding examples ride along as extra GPT references (grip/scale only).
        // GPT-only: the gemini path ignores them, so don't send them on gemini runs.
        if (imageModel === "gpt" && gripExampleImages.length > 0) {
          genPayload.gripExampleImages = gripExampleImages;
        }
      }

      const genRes  = await apiRequest("POST", "/api/new-generate-avatar", genPayload);
      const genBody = await genRes.json();
      if (!genBody.success) throw new Error(genBody?.error || "Generation failed");

      const base64 = genBody.data.image as string;
      const out = { id: null, url: `data:image/png;base64,${base64}`, base64 };
      if (step === "without") setWithoutPreview(out);
      else setWithPreview(out);
    } catch (err: unknown) {
      toast({ title: "Couldn't generate preview", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const approve = () => {
    if (step === "without") {
      setStep("with");
      setPrompt("");
      setSelectedProductImageUrl(null);
    } else if (step === "with") {
      setStep("register");
    }
  };

  const regen = () => {
    if (step === "without") setWithoutPreview(null);
    else setWithPreview(null);
  };

  const register = async () => {
    if (!withoutPreview || !withPreview) {
      toast({ title: "Missing previews", variant: "destructive" });
      return;
    }
    setRegistering(true);
    try {
      const resolvePreviews = async () => {
        const save = async (p: { id: string | null; url: string; base64: string | null }) => {
          if (p.id) return { previewId: p.id, previewUrl: p.url };
          if (!p.base64) throw new Error("Preview has no image data to save");
          const r = await apiRequest("POST", "/api/avatars/looks/save-preview", { imageBase64: p.base64 });
          const b = await r.json();
          if (!b.ok) throw new Error(b.message || "Failed to save preview");
          return { previewId: b.previewId as string, previewUrl: b.previewUrl as string };
        };
        const [withoutRes, withRes] = await Promise.all([save(withoutPreview!), save(withPreview!)]);
        return {
          withoutId:  withoutRes.previewId,
          withId:     withRes.previewId,
          withoutUrl: withoutRes.previewUrl,
          withUrl:    withRes.previewUrl,
        };
      };

      if (forProductSlug && existingP1HeygenId) {
        const { withId } = await resolvePreviews();
        const r = await apiRequest(
          "POST",
          `/api/avatars/${avatarId}/looks/add-p2-for-product`,
          {
            existingP1HeygenId,
            existingP1ImageUrl: basisWithoutUrl || null,
            withPreviewId: withId,
            productSlug: forProductSlug,
            name: name.trim() || undefined,
          },
        );
        const body = await r.json();
        if (!body.ok) throw new Error(body?.message || "Add P2 failed");
        toast({
          title: "New look added",
          description: `Tagged for ${productDisplayName || forProductSlug}. Available for renders immediately.`,
        });
        qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
        onClose();
        return;
      }
      const { withoutId, withId, withoutUrl, withUrl } = await resolvePreviews();

      if (editMode) {
        const r = await apiRequest(
          "POST",
          `/api/avatars/${avatarId}/looks/${editMode.sceneGroupId}/replace-from-previews`,
          { name: name.trim() || undefined, withoutPreviewId: withoutId, withPreviewId: withId },
        );
        const body = await r.json();
        if (!body.ok) throw new Error(body?.message || "Replace failed");
      } else {
        // Step 1 — register to HeyGen. In skip-base mode only the new
        // with-product image is registered; the base already exists.
        const regPayload: Record<string, unknown> = {
          avatarGroupId:       heygenAvatarId || avatarId,
          scene:               name.trim() || "New look",
          withProductImageUrl: withUrl,
        };
        if (!skipBase) regPayload.withoutProductImageUrl = withoutUrl;
        const regRes  = await apiRequest("POST", "/api/register-avatar-to-heygen", regPayload);
        const regBody = await regRes.json();
        if (!regBody.success) throw new Error(regBody?.error || "HeyGen registration failed");

        const withHeygenId    = regBody.data?.withProduct?.data?.avatar_item?.id as string | undefined;
        const withoutHeygenId = regBody.data?.withoutProduct?.data?.avatar_item?.id as string | undefined;
        if (!withHeygenId) throw new Error("HeyGen did not return avatar IDs");
        if (!skipBase && !withoutHeygenId) throw new Error("HeyGen did not return avatar IDs");

        // Step 2 — persist look to scenes DB. In skip-base mode only the new
        // P2 is sent and tagged into the existing group via sceneGroupId.
        const productTag = selectedProduct?.name ? [selectedProduct.name] : [];
        const looksPayload = skipBase
          ? [
              { id: withHeygenId, name: name.trim() ? `${name.trim()} (P2)` : undefined, image_url: withUrl, product_tag: productTag, isProduct: true },
            ]
          : [
              { id: withoutHeygenId, name: name.trim() ? `${name.trim()} (P1)` : undefined, image_url: withoutUrl, product_tag: productTag, isProduct : false },
              { id: withHeygenId,    name: name.trim() ? `${name.trim()} (P2)` : undefined, image_url: withUrl,    product_tag: productTag, isProduct : true },
            ];
        const dbRes  = await apiRequest("POST", `/api/avatars/${heygenAvatarId}/looks`, {
          heygenAvatarId: heygenAvatarId || undefined,
          sceneGroupId: sceneGroupId || undefined,
          looks: looksPayload,
        });
        const dbBody = await dbRes.json();
        if (!dbBody.ok) throw new Error(dbBody?.message || "Failed to save look to DB");
      }
      toast({
        title: editMode ? "Look replaced" : "Look registered",
        description: editMode
          ? `Updated look on ${avatarName}. Old P1 + P2 removed, new pair active.`
          : `Available for renders on ${avatarName} immediately.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      onClose();
    } catch (err: unknown) {
      toast({
        title: editMode ? "Couldn't replace look" : "Couldn't register look",
        description: (err as Error)?.message,
        variant: "destructive",
      });
    } finally {
      setRegistering(false);
    }
  };

  const currentBasis = step === "without" ? basisWithoutUrl : (withoutPreview?.url ?? basisWithUrl);
  const currentPreview = step === "without" ? withoutPreview : (step === "with" ? withPreview : null);
  const phaseLabel = step === "without" ? "Base look · hands free" : step === "with" ? "Product variant · with product" : "Register";

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-xl max-w-3xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-5 py-3.5 border-b border-border/40 flex items-center gap-3">
          <Sparkles className="size-4 text-primary" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight truncate">
              {editMode ? `Edit look for ${avatarName}` : `Generate a new look for ${avatarName}`}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {editMode
                ? "Type a prompt to regenerate P1, then P2 with the product. Both halves will be confirmed before the existing look is replaced."
                : "Type a prompt — we'll edit the existing photo to keep the same person but change the pose/setting/outfit. Approve P1, then P2 with product."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-md hover:bg-muted/40 flex items-center justify-center text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-5 pt-4 flex items-center gap-2 text-[11px] font-medium flex-wrap">
            {steps.map((s, i) => (
              <span key={s} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                step === s ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                : steps.indexOf(step) > i ? "bg-emerald-500/15 text-emerald-300"
                : "bg-muted/40 text-muted-foreground"
              }`}>
                {steps.indexOf(step) > i && <Check className="size-3" />}
                {i + 1} · {STEP_LABELS[s]}
              </span>
            ))}
          </div>

          {step === "setup" && (
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/85">
                  Brand <span className="text-destructive">*</span>
                </Label>
                <Select value={selectedBrandId} onValueChange={(v) => { setSelectedBrandId(v); setSelectedProductId(""); }}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select a brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {(brands ?? []).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/85">
                  Product <span className="text-destructive">*</span>
                </Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId} disabled={!selectedBrandId}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder={selectedBrandId ? "Select a product" : "Select a brand first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/85">
                  Image model
                </Label>
                <Select value={imageModel} onValueChange={(v) => setImageModel(v as "gemini" | "gpt")}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt">GPT — gpt-image-2</SelectItem>
                    <SelectItem value="gemini">Gemini — gemini-3-pro-image-preview</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>
          )}

          {step !== "setup" && (
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/85 flex items-center gap-1.5">
                Look title <span className="text-destructive">*</span>
                <span className="ml-1 normal-case text-muted-foreground/70 font-normal">(required — helps you tell looks apart)</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kitchen counter · morning"
                maxLength={80}
                className={`h-9 text-[13px] ${!name.trim() ? "border-destructive/50 focus-visible:ring-destructive/40" : ""}`}
                required
              />
              {!name.trim() && (
                <p className="text-[10.5px] text-destructive/85 mt-1">
                  Add a short title before registering.
                </p>
              )}
            </div>

            {step !== "register" && (
              <div className="rounded-xl border border-border/60 bg-background/40 p-3 space-y-3">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/85">
                  {phaseLabel}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10.5px] text-muted-foreground mb-1">Reference (existing)</div>
                    <div className="rounded-md overflow-hidden bg-muted/30 ring-1 ring-border/70 max-h-[36vh] flex items-center justify-center">
                      {currentBasis ? (
                        <img src={currentBasis} alt="basis" className="max-h-[36vh] w-auto object-contain" />
                      ) : (
                        <div className="aspect-[3/4] w-full flex items-center justify-center text-muted-foreground italic text-[11px]">No reference</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-muted-foreground mb-1">New look (preview)</div>
                    <div className="rounded-md overflow-hidden bg-muted/30 ring-1 ring-border/70 relative max-h-[36vh] flex items-center justify-center">
                      {currentPreview ? (
                        <img src={currentPreview.url} alt="preview" className="max-h-[36vh] w-auto object-contain" />
                      ) : generating ? (
                        <div className="aspect-[3/4] w-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <Loader2 className="size-5 animate-spin" />
                          <span className="text-[11px]">Generating… ~15-30s</span>
                        </div>
                      ) : (
                        <div className="aspect-[3/4] w-full flex items-center justify-center text-muted-foreground italic text-[11px]">Type a prompt + Generate</div>
                      )}
                    </div>
                  </div>
                </div>

                {step === "with" && (
                  <div className="space-y-2">
                    <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground/85">
                      Product image — select one as reference
                    </div>
                    {productHasImages ? (
                      <div className="flex gap-2 flex-wrap">
                        {selectedProduct?.product_images?.map((img) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setSelectedProductImageUrl(img.image_url)}
                            className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                              selectedProductImageUrl === img.image_url
                                ? "border-primary ring-1 ring-primary/40"
                                : "border-transparent hover:border-muted-foreground/40"
                            }`}
                          >
                            <img src={img.image_url} alt={img.explanation || ""} className="w-16 h-20 object-cover" loading="lazy" />
                            {selectedProductImageUrl === img.image_url && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <Check className="size-5 text-white drop-shadow" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground/70 normal-case font-normal">
                          No stored images — paste a product mockup URL
                        </Label>
                        <Input
                          value={pastedMockupUrl}
                          onChange={e => setPastedMockupUrl(e.target.value)}
                          placeholder="https://…"
                          className="h-9 text-[13px]"
                        />
                      </div>
                    )}

                    {/* GPT-only: the reference-sheet mechanism is a gpt-image-2 feature —
                        the gemini 3-step path ignores examples, so hide the picker there. */}
                    {imageModel === "gpt" && (
                    <div className="space-y-1.5 pt-1.5">
                      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground/85">
                        Real holding examples
                        <span className="ml-1 normal-case font-normal text-muted-foreground/70">
                          (optional, up to {MAX_GRIP_EXAMPLES}) — real photos of the product held in a hand; teaches the natural grip + true size
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap items-start">
                        {gripExampleImages.map((url) => (
                          <div key={url} className="relative">
                            <img src={url} alt="holding example" className="w-16 h-20 object-cover rounded-lg border-2 border-emerald-400/60" loading="lazy" />
                            <button
                              type="button"
                              onClick={() => setGripExampleImages((prev) => prev.filter((u) => u !== url))}
                              aria-label="Remove example"
                              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground ring-2 ring-card flex items-center justify-center hover:bg-destructive/90"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                        {gripExampleImages.length < MAX_GRIP_EXAMPLES && (
                          <button
                            type="button"
                            onClick={() => gripExampleInputRef.current?.click()}
                            className="w-16 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground"
                          >
                            <Plus className="size-4" />
                            <span className="text-[9px] font-medium">Upload</span>
                          </button>
                        )}
                        <input
                          ref={gripExampleInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          className="hidden"
                          onChange={(e) => { addGripExampleFiles(e.target.files); e.target.value = ""; }}
                        />
                      </div>
                      {(selectedProduct?.product_reference_images?.length ?? 0) > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] text-muted-foreground/70">
                            …or click a stored reference example (real holding photos from the product):
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {selectedProduct?.product_reference_images?.map((img) => (
                              <button
                                key={`grip-${img.id}`}
                                type="button"
                                onClick={() => toggleGripExample(img.image_url)}
                                className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                                  gripExampleImages.includes(img.image_url)
                                    ? "border-emerald-400/80 ring-1 ring-emerald-400/40"
                                    : "border-transparent hover:border-muted-foreground/40"
                                }`}
                              >
                                <img src={img.image_url} alt={img.explanation || ""} className="w-12 h-14 object-cover" loading="lazy" />
                                {gripExampleImages.includes(img.image_url) && (
                                  <div className="absolute inset-0 bg-emerald-500/25 flex items-center justify-center">
                                    <Check className="size-4 text-white drop-shadow" />
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/85 flex items-center gap-1.5">
                    <Sparkles className="size-3 text-primary" />
                    Prompt — describe the change you want
                  </Label>
                  <textarea
                    ref={promptRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      step === "without"
                        ? "e.g. Same woman, now standing at a sunny kitchen counter with marble counters and morning light. Hands free at her sides."
                        : "e.g. Same scene as before, recomposed as a tight chest-up close-up, now holding the product naturally in one hand at upper-chest height, looking at the camera."
                    }
                    rows={5}
                    className="w-full px-3 py-2 rounded-md border-2 border-primary/40 bg-background text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/70"
                  />
                </div>
              </div>
            )}

            {step === "register" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10.5px] text-muted-foreground mb-1">Base look · hands free (approved)</div>
                    <div className="rounded-md overflow-hidden bg-muted/30 ring-1 ring-emerald-500/40 max-h-[36vh] flex items-center justify-center">
                      <img src={withoutPreview!.url} alt="P1" className="max-h-[36vh] w-auto object-contain" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-muted-foreground mb-1">Product variant · with product (approved)</div>
                    <div className="rounded-md overflow-hidden bg-muted/30 ring-1 ring-emerald-500/40 max-h-[36vh] flex items-center justify-center">
                      <img src={withPreview!.url} alt="P2" className="max-h-[36vh] w-auto object-contain" />
                    </div>
                  </div>
                </div>
                {/* <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11.5px] text-amber-200/95">
                  Registering uploads both images to HeyGen as a new look pair on this avatar's group, then registers them in the marketing DB. Available for video rendering immediately after. ~10-20s.
                </div> */}
              </div>
            )}
          </div>
          )}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-border/40 flex items-center justify-end gap-2 bg-card">
          <Button variant="ghost" onClick={onClose} disabled={generating || registering}>Cancel</Button>
          {step === "setup" && (
            <Button onClick={() => setStep(skipBase ? "with" : "without")} disabled={!canContinueSetup} className="gap-1.5">
              Continue →
            </Button>
          )}
          {step !== "setup" && step !== "register" && (
            currentPreview ? (
              <>
                <Button variant="ghost" onClick={regen} disabled={generating} className="gap-1.5">
                  <Loader2 className={`size-3.5 ${generating ? "animate-spin" : "opacity-0"}`} />
                  Regenerate
                </Button>
                <Button onClick={approve} disabled={generating} className="gap-1.5">
                  <Check className="size-3.5" />
                  Approve {step === "without" ? "P1" : "P2"} →
                </Button>
              </>
            ) : (
              <Button
                onClick={generate}
                disabled={
                  generating ||
                  prompt.trim().length < 10 ||
                  (step === "without" && !basisWithoutUrl) ||
                  (step === "with" && (
                    !withoutPreview ||
                    (!selectedProductImageUrl && !pastedMockupUrl.trim().startsWith("http"))
                  ))
                }
                className="gap-1.5"
              >
                {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {generating ? "Generating…" : `Generate ${step === "without" ? "P1" : "P2"}`}
              </Button>
            )
          )}
          {step === "register" && (
            <Button
              onClick={register}
              disabled={registering || !name.trim()}
              className="gap-1.5"
            >
              {registering ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {registering
                ? (editMode ? "Replacing…" : "Registering…")
                : (editMode ? "Replace existing look" : "Register look")}
            </Button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}

function DeleteAvatarModal({
  avatarName, avatarImageUrl, lookCount, onCancel, onConfirm, busy,
}: {
  avatarName: string;
  avatarImageUrl: string | null;
  lookCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-b from-destructive/15 via-destructive/5 to-transparent px-6 pt-7 pb-5 text-center">
          <div className="absolute top-3 right-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              aria-label="Close"
              className="size-7 rounded-md hover:bg-muted/40 flex items-center justify-center text-muted-foreground disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="relative mx-auto size-20">
            <div className="absolute inset-0 rounded-full bg-destructive/20 blur-xl" />
            <div className="relative size-20 rounded-full ring-4 ring-destructive/30 ring-offset-2 ring-offset-card overflow-hidden bg-muted/40 flex items-center justify-center">
              {avatarImageUrl ? (
                <img src={avatarImageUrl} alt={avatarName} className="w-full h-full object-cover" />
              ) : (
                <Users className="size-8 text-muted-foreground/60" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 size-7 rounded-full bg-destructive text-destructive-foreground ring-2 ring-card flex items-center justify-center shadow-lg">
              <AlertTriangle className="size-3.5" />
            </div>
          </div>
          <h3 className="text-[16px] font-semibold text-foreground mt-4">Are you sure?</h3>
          <p className="text-[12px] text-muted-foreground mt-1.5 max-w-xs mx-auto">
            You're about to delete <span className="font-semibold text-foreground">"{avatarName}"</span>
            {lookCount > 0 && <> and its {lookCount} look{lookCount === 1 ? "" : "s"}</>}.
            This action can't be undone from this tool.
          </p>
        </div>

        <footer className="px-6 py-4 bg-muted/20 border-t border-border/40 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {busy ? "Deleting…" : "Delete avatar"}
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

type HeygenGroupRow = {
  id: string;
  name: string;
  group_type: string | null;
  num_looks: number;
  preview_image: string | null;
  default_voice_id: string | null;
  gender: string | null;
  created_at: number | null;
  imported: boolean;
};

function ImportFromHeygenPanel({ apiRequest }: { apiRequest: ApiRequestFn }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unimported">("unimported");
  const [query, setQuery] = useState("");
  const groupsQ = useQuery<{ groups: HeygenGroupRow[]; total: number }>({
    queryKey: ["/api/avatars/heygen/groups"],
    queryFn: async () => (await apiRequest("GET", "/api/avatars/heygen/groups")).json(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const filtered = useMemo(() => {
    const rows = groupsQ.data?.groups || [];
    const pool = filter === "unimported" ? rows.filter((g) => !g.imported) : rows;
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((g) => g.name.toLowerCase().includes(q));
  }, [groupsQ.data, filter, query]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="size-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
          <Download className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-foreground">Import from HeyGen workspace</h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Pull avatars straight from <span className="text-foreground/80">app.heygen.com</span> — every group in your workspace, one-click into the pool.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground/70 tabular-nums shrink-0">
          {groupsQ.data ? `${groupsQ.data.total} groups` : open ? "loading…" : ""}
        </span>
        <span className="text-muted-foreground/60 shrink-0">
          {open ? <X className="size-4" /> : <Plus className="size-4" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/40 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { id: "unimported", label: "Not yet imported" },
              { id: "all",        label: "All" },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id as typeof filter)}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filter === opt.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-card/60 hover:bg-muted text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <div className="ml-auto relative w-full sm:w-56">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
                className="pl-8 h-8 text-[12px]"
              />
            </div>
          </div>
          {groupsQ.isLoading && (
            <div className="py-10 text-center text-[12.5px] text-muted-foreground">
              <Loader2 className="size-5 mx-auto animate-spin mb-2" />
              Loading workspace…
            </div>
          )}
          {groupsQ.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {String((groupsQ.error as Error)?.message || groupsQ.error)}
            </div>
          )}
          {!groupsQ.isLoading && filtered.length === 0 && (
            <div className="py-8 text-center text-[12.5px] text-muted-foreground italic">
              No groups match this filter.
            </div>
          )}
          {filtered.length > 0 && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.slice(0, 60).map((g) => <HeygenGroupCard key={g.id} group={g} apiRequest={apiRequest} />)}
            </ul>
          )}
          {filtered.length > 60 && (
            <p className="text-[11px] text-muted-foreground text-center italic">
              Showing first 60 of {filtered.length} — refine the filter / search to narrow.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function HeygenGroupCard({ group, apiRequest }: { group: HeygenGroupRow; apiRequest: ApiRequestFn }) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <li className={`rounded-xl border bg-background/40 overflow-hidden flex flex-col ${group.imported ? "border-emerald-500/30 opacity-70" : "border-border/50"}`}>
      <div className="relative aspect-[3/4] bg-muted/30">
        {group.preview_image ? (
          <img src={group.preview_image} alt={group.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
            <Users className="size-6" />
          </div>
        )}
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9.5px] font-medium text-white/90 backdrop-blur-sm">
          {group.num_looks} look{group.num_looks === 1 ? "" : "s"}
        </span>
        {group.imported && (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[9.5px] font-semibold text-white">
            <Check className="size-2.5" />
            Imported
          </span>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-2 flex-1">
        <h4 className="text-[12px] font-semibold truncate" title={group.name}>{group.name}</h4>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={group.imported || group.num_looks === 0}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-2 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="size-3" />
          {group.imported ? "Already in pool" : "Import"}
        </button>
      </div>
      {modalOpen && (
        <ImportAvatarModal
          group={group}
          onClose={() => setModalOpen(false)}
          apiRequest={apiRequest}
        />
      )}
    </li>
  );
}

type LookChoice = {
  selected: boolean;
  status: "without" | "with";
  groupId: string;
  productId: string;
};

const DEFAULT_CHOICE: LookChoice = { selected: false, status: "without", groupId: "", productId: "" };

function ImportAvatarModal({
  group, onClose, apiRequest,
}: {
  group: HeygenGroupRow;
  onClose: () => void;
  apiRequest: ApiRequestFn;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { products } = useProducts();
  const looksQ = useQuery<{ looks: Array<{ id: string; name: string | null; image_url: string | null }> }>({
    queryKey: ["/api/avatars", group.id, "looks"],
    queryFn: async () =>
      (await apiRequest("GET", `/api/avatars/heygen/groups/${group.id}/looks`)).json(),
  });
  const looks = looksQ.data?.looks || [];
  const primary = looks[0];
  const [registering, setRegistering] = useState(false);
  const [choices, setChoices] = useState<Record<string, LookChoice>>({});
  const setChoice = (id: string, patch: Partial<LookChoice>) =>
    setChoices((prev) => ({
      ...prev,
      [id]: { ...DEFAULT_CHOICE, ...prev[id], ...patch },
    }));
  const sel = (l: { id: string }) => choices[l.id] ?? DEFAULT_CHOICE;

  const selected = looks.filter((l) => sel(l).selected);
  const bases = selected.filter((l) => sel(l).status === "without");
  const variants = selected.filter((l) => sel(l).status === "with");
  const baseIndex = new Map(bases.map((b, i) => [b.id, i + 1]));

  const variantBad = variants.some((v) => {
    const c = sel(v);
    return !c.productId || !bases.some((b) => b.id === c.groupId);
  });
  const canImport = !!primary && selected.length > 0 && bases.length > 0 && !variantBad;

  const register = async () => {
    if (!canImport) return;
    setRegistering(true);
    try {
      const avatarRes = await apiRequest("POST", "/api/avatars", {
        id: group.id,
        name: group.name,
        group_type: group.group_type,
        num_looks: group.num_looks,
        preview_image: group.preview_image,
        created_at: group.created_at,
        gender: group.gender,
        voiceId: group.default_voice_id
      });
      const avatarBody = await avatarRes.json();
      if (!avatarBody.ok) throw new Error(avatarBody?.message || "Failed to save avatar");

      await Promise.all(bases.map(async (base) => {
        const groupVariants = variants.filter((v) => sel(v).groupId === base.id);
        const looksPayload = [
          { id: base.id, name: base.name, image_url: base.image_url, isProduct: false, product_tag: [] },
          ...groupVariants.map((v) => {
            const product = (products ?? []).find((p) => p.id === sel(v).productId);
            return {
              id: v.id,
              name: v.name,
              image_url: v.image_url,
              isProduct: true,
              product_tag: product?.name ? [product.name] : [],
            };
          }),
        ];
        const r = await apiRequest("POST", `/api/avatars/${group.id}/looks`, {
          heygenAvatarId: primary.id,
          looks: looksPayload,
        });
        const b = await r.json();
        if (!b.ok) throw new Error(b?.message || "Failed to save group");
      }));

      toast({
        title: `Imported ${group.name}`,
        description: `${bases.length} group${bases.length === 1 ? "" : "s"} · ${selected.length} scene${selected.length === 1 ? "" : "s"} saved.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/options/avatars"] });
      qc.invalidateQueries({ queryKey: ["/api/avatars"] });
      onClose();
    } catch (err: unknown) {
      toast({ title: "Import failed", description: (err as Error)?.message, variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 py-6 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border/60 rounded-2xl shadow-xl max-w-3xl w-full my-auto max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-5 py-3.5 border-b border-border/40 flex items-center gap-3">
          <Download className="size-4 text-primary" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight truncate">
              Import {group.name}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Review the looks in this group, then import to save the avatar and all looks.
            </p>
          </div>
          <button type="button" onClick={onClose} className="size-7 rounded-md hover:bg-muted/40 flex items-center justify-center text-muted-foreground">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {looksQ.isLoading ? (
            <div className="py-10 text-center text-[12.5px] text-muted-foreground">
              <Loader2 className="size-5 mx-auto animate-spin mb-2" />
              Loading looks…
            </div>
          ) : looksQ.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {String((looksQ.error as Error)?.message || looksQ.error)}
            </div>
          ) : looks.length === 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-[12.5px] text-destructive">
              No looks found in this HeyGen group. Train an avatar in HeyGen first.
            </div>
          ) : (
            <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {looks.map((l, i) => {
                const c = sel(l);
                const groupStale = c.selected && c.status === "with" && !!c.groupId && !bases.some((b) => b.id === c.groupId);
                const ring =
                  !c.selected ? "border-border/50"
                  : c.status === "with" ? "border-primary/50 ring-1 ring-primary/30"
                  : "border-emerald-500/40 ring-1 ring-emerald-500/25";
                return (
                <div key={l.id} className={`rounded-xl border bg-background/40 overflow-hidden flex flex-col transition-colors ${ring}`}>
                  <button
                    type="button"
                    onClick={() => setChoice(l.id, { selected: !c.selected })}
                    className="aspect-[3/4] bg-muted/30 relative block w-full text-left"
                    title={c.selected ? "Click to deselect" : "Click to select"}
                  >
                    {l.image_url ? (
                      <img src={l.image_url} alt={l.name || `Look ${i + 1}`} className={`w-full h-full object-cover transition-opacity ${c.selected ? "" : "opacity-60"}`} loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                        <Users className="size-6" />
                      </div>
                    )}
                    <span className={`absolute top-1.5 right-1.5 size-5 rounded-full flex items-center justify-center border ${
                      c.selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-black/40 border-white/50 text-transparent"
                    }`}>
                      <Check className="size-3" />
                    </span>
                  </button>
                  <div className="px-2 py-1.5 space-y-1.5">
                    <p className="text-[11px] font-medium truncate" title={l.name || undefined}>
                      {l.name || `Look ${i + 1}`}
                    </p>
                    {c.selected && (
                      <>
                        <Select
                          value={c.status}
                          onValueChange={(v) => setChoice(l.id, { status: v as LookChoice["status"], groupId: "", productId: "" })}
                        >
                          <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="without">Without product</SelectItem>
                            <SelectItem value="with">With product</SelectItem>
                          </SelectContent>
                        </Select>
                        {c.status === "with" && (
                          bases.length === 0 ? (
                            <p className="text-[10px] text-destructive/85">Mark a scene as Without product first.</p>
                          ) : (
                            <>
                              <Select
                                value={c.groupId && !groupStale ? c.groupId : ""}
                                onValueChange={(v) => setChoice(l.id, { groupId: v })}
                              >
                                <SelectTrigger className={`h-7 text-[11px] ${!c.groupId || groupStale ? "border-destructive/50" : ""}`}>
                                  <SelectValue placeholder="Select group" />
                                </SelectTrigger>
                                <SelectContent>
                                  {bases.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                      Group {baseIndex.get(b.id)} · {b.name || "Untitled"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={c.productId}
                                onValueChange={(v) => setChoice(l.id, { productId: v })}
                              >
                                <SelectTrigger className={`h-7 text-[11px] ${!c.productId ? "border-destructive/50" : ""}`}>
                                  <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(products ?? []).map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name} · {p.brands?.name ?? "—"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            {bases.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-background/30 p-3 space-y-3">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/85">
                  Groups · {bases.length}
                </div>
                {bases.map((b) => {
                  const groupVariants = variants.filter((v) => sel(v).groupId === b.id);
                  return (
                    <div key={b.id} className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/40 p-2">
                      <div className="shrink-0 w-14">
                        <div className="aspect-[3/4] rounded-md overflow-hidden bg-muted/30 ring-1 ring-emerald-500/40">
                          {b.image_url ? (
                            <img src={b.image_url} alt={b.name || "base"} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40"><Users className="size-4" /></div>
                          )}
                        </div>
                        <p className="text-[10px] font-medium text-center mt-1 truncate">Group {baseIndex.get(b.id)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{b.name || "Untitled"} <span className="text-muted-foreground/70">· base (no product)</span></p>
                        {groupVariants.length === 0 ? (
                          <p className="text-[10.5px] text-muted-foreground italic mt-1">No product variants attached.</p>
                        ) : (
                          <div className="flex gap-2 flex-wrap mt-1.5">
                            {groupVariants.map((v) => {
                              const product = (products ?? []).find((p) => p.id === sel(v).productId);
                              return (
                                <div key={v.id} className="w-12">
                                  <div className="aspect-[3/4] rounded overflow-hidden bg-muted/30 ring-1 ring-primary/30">
                                    {v.image_url ? (
                                      <img src={v.image_url} alt={v.name || "variant"} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40"><Users className="size-3" /></div>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-center mt-0.5 truncate" title={product?.name || undefined}>{product?.name || "—"}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          )}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-border/40 flex items-center justify-end gap-3 bg-card">
          {selected.length > 0 && !canImport && !registering && (
            <span className="mr-auto text-[11px] text-destructive/85">
              {bases.length === 0
                ? "Mark at least one scene as Without product."
                : "Assign a group + product to every With-product scene."}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={registering}>Cancel</Button>
          <Button
            onClick={register}
            disabled={!canImport || registering}
            className="gap-1.5"
          >
            {registering ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {registering
              ? "Importing…"
              : `Import avatar + ${bases.length} group${bases.length === 1 ? "" : "s"}`}
          </Button>
        </footer>
      </div>
    </div>
  );
}
