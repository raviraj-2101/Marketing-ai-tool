import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { logSearchMatches } from '@/lib/ugcVideoLogSearch';
import { RESTORE_SESSION_KEY } from '@/lib/ugcSettingsSnapshot';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Progress } from '@/components/ui/progress';
import { Loader2, Video, CheckCircle, XCircle, Clock, Copy, ExternalLink, Download, Search, RefreshCw, Check, ChevronDown, Send, Lock, Pencil, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardLayout } from '@/components/DashboardLayout';
import {
  Pagination, PaginationContent, PaginationEllipsis,
  PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

// preview_video_url is stored as a relative path (e.g. "/videos/final_….mp4")
// served by the image-builder backend. Prefix it with the backend base URL.
function resolveVideoUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${(API_BASE || '').replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

// ── Progress + ETA (all real-data, no hardcoded estimates) ───────────────────
// HeyGen exposes no render-progress %, so the bar is anchored to the REAL status
// milestones (processing → merging → completed) and the ETA is derived from the
// rolling average of the user's own past completed runs (computeAvgDurationMs).
const ACTIVE_STATUSES = new Set(['pending', 'processing', 'merging']);
// Past durations longer than this are treated as stuck/outliers, not real samples.
const DURATION_OUTLIER_CAP_MS = 60 * 60 * 1000;
// For the ETA baseline only: a real generation takes minutes. Rows faster than the
// floor are timestamp artifacts (created_at ≈ updated_at); rows slower than the
// ceiling are stuck/swept runs. Both are excluded so the estimate reflects a
// TYPICAL real run, and we take the median (robust to the remaining skew).
const MIN_REAL_DURATION_MS = 60 * 1000;        // 1 min
const MAX_REAL_DURATION_MS = 30 * 60 * 1000;   // 30 min
const TYPICAL_SAMPLE_WINDOW = 25;              // most-recent N completions

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m <= 0 ? `${s}s` : `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatEta(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `~${Math.max(totalSec, 1)}s left`;
  return `~${Math.ceil(totalSec / 60)}m left`;
}

// The rendered clip's playback length (read from the <video> element), shown as
// m:ss (e.g. 0:32) — distinct from the generation/processing time ("Took Xm Ys").
function formatClipDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// The avatar-level status = the "least finished" of its scene records.
function avatarStatus(records: LogRecord[]): string {
  if (records.some(r => r.status === 'processing')) return 'processing';
  if (records.some(r => r.status === 'merging')) return 'merging';
  if (records.some(r => r.status === 'pending')) return 'pending';
  if (records.every(r => r.status === 'completed')) return 'completed';
  return 'failed';
}

// A pushed record has its updated_at bumped by the pipeline poller, so it can no
// longer be trusted as the generation's finish time. Matches the in-component
// isAvatarPushed logic.
function isPipelinePushed(records: LogRecord[]): boolean {
  return records.some(r => {
    const s = (r.in_pipeline || '').toLowerCase();
    return s === 'processing' || s === 'ready to launch';
  });
}

function avatarStart(records: LogRecord[]): number {
  return Math.min(...records.map(r => new Date(r.created_at).getTime()));
}

// Last status-transition time across the avatar's records. For a live row this
// is when it entered its current stage; for a completed (un-pushed) row it's the
// finish time.
function avatarLastUpdate(records: LogRecord[]): number {
  return Math.max(...records.map(r => new Date(r.updated_at ?? r.created_at).getTime()));
}

// Typical (median) finish time from recent completed, un-pushed avatars (so
// updated_at is the true completion). Junk (<1 min, timestamp artifacts) and
// stuck (>30 min, swept runs) samples are excluded, and the median resists the
// remaining skew, so the ETA reflects a normal run. Null when there's no history.
function computeTypicalDurationMs(logs: LogGroup[]): number | null {
  const samples: { dur: number; finish: number }[] = [];
  for (const g of logs) {
    const byAvatar = new Map<string, LogRecord[]>();
    for (const r of g.records) {
      if (!byAvatar.has(r.avatar_id)) byAvatar.set(r.avatar_id, []);
      byAvatar.get(r.avatar_id)!.push(r);
    }
    for (const recs of byAvatar.values()) {
      if (!recs.every(r => r.status === 'completed')) continue;
      if (isPipelinePushed(recs)) continue;
      const finish = avatarLastUpdate(recs);
      const dur = finish - avatarStart(recs);
      if (dur >= MIN_REAL_DURATION_MS && dur <= MAX_REAL_DURATION_MS) samples.push({ dur, finish });
    }
  }
  if (!samples.length) return null;
  samples.sort((a, b) => b.finish - a.finish);
  return median(samples.slice(0, TYPICAL_SAMPLE_WINDOW).map(s => s.dur));
}

type ProgressStage = 'pending' | 'generating' | 'merging' | 'done' | 'failed' | 'pushing' | 'pushed';
interface ProgressInfo {
  pct: number;            // 0..100
  stage: ProgressStage;
  etaMs: number | null;   // null ⇒ no baseline yet, show elapsed only
  elapsedMs: number;
  done: boolean;
  failed: boolean;
}

function computeProgress(opts: {
  status: string;
  startMs: number;
  now: number;
  avgMs: number | null;
}): ProgressInfo {
  const { status, startMs, now, avgMs } = opts;
  const elapsedMs = Math.max(0, now - startMs);

  if (status === 'failed') return { pct: 100, stage: 'failed', etaMs: null, elapsedMs, done: false, failed: true };
  if (status === 'completed') return { pct: 100, stage: 'done', etaMs: null, elapsedMs, done: true, failed: false };

  // Live. Time fraction from the historical average, capped < 1 so the bar never
  // claims completion before the real 'completed' event arrives.
  const frac = avgMs && avgMs > 0 ? Math.min(elapsedMs / avgMs, 0.95) : null;

  let pct: number;
  let stage: ProgressStage;
  if (status === 'merging') {
    stage = 'merging';
    // Real milestone: merge has started ⇒ near the end. Floor at 85%.
    pct = Math.min(Math.max((frac ?? 0.85) * 100, 85), 97);
  } else {
    stage = status === 'pending' ? 'pending' : 'generating';
    // With a baseline, follow it; without, a gentle indeterminate creep (no number shown).
    pct = frac != null ? frac * 100 : Math.min(8 + elapsedMs / 6000, 80);
  }

  const etaMs = avgMs && avgMs > 0 ? Math.max(avgMs - elapsedMs, 0) : null;
  return { pct, stage, etaMs, elapsedMs, done: false, failed: false };
}

// Aggregate progress across all avatars in a generation. The batch finishes when
// its slowest avatar finishes, so ETA = the max remaining.
function computeGroupProgress(group: LogGroup, now: number, avgMs: number | null) {
  const byAvatar = new Map<string, LogRecord[]>();
  for (const r of group.records) {
    if (!byAvatar.has(r.avatar_id)) byAvatar.set(r.avatar_id, []);
    byAvatar.get(r.avatar_id)!.push(r);
  }
  const avatars = Array.from(byAvatar.values());
  const infos = avatars.map(recs =>
    computeProgress({ status: avatarStatus(recs), startMs: avatarStart(recs), now, avgMs })
  );

  const allDone = infos.length > 0 && infos.every(i => i.done);
  const anyFailed = infos.some(i => i.failed);
  const live = infos.filter(i => !i.done && !i.failed);

  let stage: ProgressStage;
  if (allDone) stage = 'done';
  else if (live.some(i => i.stage === 'generating')) stage = 'generating';
  else if (live.some(i => i.stage === 'merging')) stage = 'merging';
  else if (live.some(i => i.stage === 'pending')) stage = 'pending';
  else stage = anyFailed ? 'failed' : 'done';

  const avgPct = infos.reduce((s, i) => s + i.pct, 0) / Math.max(infos.length, 1);
  const pct = allDone ? 100 : Math.min(avgPct, 97);

  const etas = live.map(i => i.etaMs).filter((x): x is number => x != null);
  const etaMs = etas.length ? Math.max(...etas) : null;

  // Final duration only when trustworthy: all done and nothing pushed.
  const pushed = avatars.some(isPipelinePushed);
  let totalMs: number | null = null;
  if (allDone && !pushed) {
    const start = Math.min(...avatars.map(avatarStart));
    const finish = Math.max(...avatars.map(avatarLastUpdate));
    const d = finish - start;
    if (d > 0 && d < DURATION_OUTLIER_CAP_MS) totalMs = d;
  }

  return { pct, stage, etaMs, allDone, anyFailed, totalMs, liveCount: live.length, total: infos.length };
}

// ── Push (Ready to Launch) progress ──────────────────────────────────────────
// Mirrors the generation helpers, but the push START time is `pushed_at` (added
// for this feature) — start/finish otherwise share updated_at, so a finished
// push's start would be lost. Live pushes can fall back to updated_at (the
// moment they became 'processing', not yet overwritten).
const MIN_PUSH_DURATION_MS = 5 * 1000;

type PushStage = 'idle' | 'pushing' | 'pushed' | 'failed';

function pushState(records: LogRecord[]): PushStage {
  const vals = records.map(r => (r.in_pipeline || '').toLowerCase());
  if (vals.some(v => v === 'processing')) return 'pushing';
  if (vals.some(v => v === 'ready to launch')) return 'pushed';
  if (vals.some(v => v === 'failed')) return 'failed';
  return 'idle';
}

function pushStartMs(records: LogRecord[]): number | null {
  const ts = records.map(r => r.pushed_at).filter(Boolean).map(s => new Date(s as string).getTime());
  return ts.length ? Math.min(...ts) : null;
}

// Median push duration (finish − pushed_at) over recent successful pushes that
// recorded a start. Null until pushes run with the new pushed_at column.
function computeTypicalPushMs(logs: LogGroup[]): number | null {
  const samples: { dur: number; finish: number }[] = [];
  for (const g of logs) {
    const byAvatar = new Map<string, LogRecord[]>();
    for (const r of g.records) {
      if (!byAvatar.has(r.avatar_id)) byAvatar.set(r.avatar_id, []);
      byAvatar.get(r.avatar_id)!.push(r);
    }
    for (const recs of byAvatar.values()) {
      if (pushState(recs) !== 'pushed') continue;
      const start = pushStartMs(recs);
      if (start == null) continue;
      const dur = avatarLastUpdate(recs) - start;
      if (dur >= MIN_PUSH_DURATION_MS && dur <= MAX_REAL_DURATION_MS) samples.push({ dur, finish: avatarLastUpdate(recs) });
    }
  }
  if (!samples.length) return null;
  samples.sort((a, b) => b.finish - a.finish);
  return median(samples.slice(0, TYPICAL_SAMPLE_WINDOW).map(s => s.dur));
}

interface PushInfo {
  stage: PushStage;
  pct: number;
  etaMs: number | null;
  elapsedMs: number | null;
  totalMs: number | null;
}

function computePushProgress(records: LogRecord[], now: number, typicalMs: number | null): PushInfo {
  const state = pushState(records);
  if (state === 'idle')   return { stage: 'idle',   pct: 0,   etaMs: null, elapsedMs: null, totalMs: null };
  if (state === 'failed') return { stage: 'failed', pct: 100, etaMs: null, elapsedMs: null, totalMs: null };

  // 'pushed' — finish time is updated_at; duration needs a recorded start.
  if (state === 'pushed') {
    const start = pushStartMs(records);
    const d = start != null ? avatarLastUpdate(records) - start : null;
    const totalMs = d != null && d >= MIN_PUSH_DURATION_MS && d <= MAX_REAL_DURATION_MS ? d : null;
    return { stage: 'pushed', pct: 100, etaMs: null, elapsedMs: null, totalMs };
  }

  // 'pushing' — live. Prefer pushed_at; fall back to updated_at for legacy rows.
  const start = pushStartMs(records) ?? avatarLastUpdate(records);
  const elapsedMs = Math.max(0, now - start);
  const frac = typicalMs && typicalMs > 0 ? Math.min(elapsedMs / typicalMs, 0.95) : null;
  const pct = frac != null ? frac * 100 : Math.min(10 + elapsedMs / 4000, 80);
  const etaMs = typicalMs && typicalMs > 0 ? Math.max(typicalMs - elapsedMs, 0) : null;
  return { stage: 'pushing', pct, etaMs, elapsedMs, totalMs: null };
}

// Generation-row aggregate: a generation is "pushing" if any avatar is pushing.
// No group-level duration (per-avatar pushes differ) — the card shows "Took …".
function computeGroupPush(group: LogGroup, now: number, typicalMs: number | null): PushInfo {
  const byAvatar = new Map<string, LogRecord[]>();
  for (const r of group.records) {
    if (!byAvatar.has(r.avatar_id)) byAvatar.set(r.avatar_id, []);
    byAvatar.get(r.avatar_id)!.push(r);
  }
  const infos = Array.from(byAvatar.values()).map(recs => computePushProgress(recs, now, typicalMs));
  const active = infos.filter(i => i.stage !== 'idle');
  if (!active.length) return { stage: 'idle', pct: 0, etaMs: null, elapsedMs: null, totalMs: null };

  const pushing = active.filter(i => i.stage === 'pushing');
  let stage: PushStage;
  if (pushing.length) stage = 'pushing';
  else if (active.some(i => i.stage === 'pushed')) stage = 'pushed';
  else stage = 'failed';

  const pct = stage === 'pushed' ? 100 : Math.min(active.reduce((s, i) => s + i.pct, 0) / active.length, 97);
  const etas = pushing.map(i => i.etaMs).filter((x): x is number => x != null);
  const etaMs = etas.length ? Math.max(...etas) : null;
  return { stage, pct, etaMs, elapsedMs: null, totalMs: null };
}

interface LogRecord {
  id: string;
  created_at: string;
  updated_at: string | null;
  generation_id: string;
  avatar_id: string;
  scene_id: string | null;
  product_name: string;
  brand: string;
  script: string;
  cs: string;
  generated_video_url: string;
  final_video_url: string | null;
  preview_video_url: string | null;
  original_preview_video_url: string | null;
  original_final_video_url: string | null;
  final_video_duration_sec: number | null;
  final_playback_speed: number | null;
  /** Voice speed the video was GENERATED at (HeyGen voice_settings.speed).
   *  Null on older rows and native-pace renders. */
  voice_speed?: number | null;
  in_pipeline: string | null;
  pushed_at: string | null;
  status: string;
  ads_script_id: string | null;
  funnel: string | null;
  scene_selection: string | null;
  scene_index: number | null;
  ad_id: string | null;
  clickup_url: string | null;
  concept: string | null;
  created_by: string | null;
  intended_platform: string | null;
  caption_placement: string | null;
  product_placement: string | null;
  /** Video provider for this clip — "fal" clips carry reference images instead
   *  of a scene row; HeyGen clips use the joined `scenes` row. */
  provider?: string | null;
  /** Drive image URLs sent to fal as references. The combined P1+P2 clip carries
   *  two (Scene 1, Scene 2) — the log shows only the first (Scene 1). */
  fal_reference_image_url?: string[] | null;
  scenes: { name: string; image_url: string | null; is_product: boolean } | null;
  avatars: { name: string; image_url: string | null } | null;
  targeting_metadata: { persona: string | null; sub_angle: string | null; sub_angle_detail?: string | null; main_pains: string[] | null } | null;
}

interface LogGroup {
  generation_id: string;
  created_at: string;
  brand: string;
  product_name: string;
  cs: string;
  avatar_name: string;
  avatar_image: string | null;
  overall_status: string;
  final_video_url: string | null;
  in_pipeline: string | null;
  ads_script_id: string | null;
  funnel: string | null;
  scene_selection: string | null;
  ad_id: string | null;
  clickup_url: string | null;
  concept: string | null;
  created_by: string | null;
  intended_platform: string | null;
  records: LogRecord[];
}

interface BrandRow { name: string; brand_code: string; }
interface ProductRow { name: string; product_code: string; }

// Normalize a stored intended_platform value (any casing / legacy spelling) to
// one of the three radio options. Unknown / null values fall back to "Both".
function normalizePlatform(v: string | null | undefined): 'Meta' | 'Applovin' | 'Both' {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'meta' || s === 'facebook') return 'Meta';
  if (s === 'applovin' || s === 'al') return 'Applovin';
  return 'Both';
}

// Reassemble the full spoken script for a generation from its per-scene clip
// records. Each scene clip is its own record (`scene_index` 1..N, product clip
// last) and every avatar in the generation repeats the same indexed set, so we
// keep one clip per scene_index and join them in ascending order. Legacy rows
// without a scene_index fall back to product-last ordering with text dedupe.
function buildFullScript(records: LogRecord[]): string {
  const haveSceneIndex = records.every(r => typeof r.scene_index === 'number');

  if (haveSceneIndex) {
    const byScene = new Map<number, string>();
    for (const r of records) {
      const part = (r.script ?? '').trim();
      if (part && !byScene.has(r.scene_index!)) byScene.set(r.scene_index!, part);
    }
    return [...byScene.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, part]) => part)
      .join('\n\n');
  }

  const seen = new Set<string>();
  return [...records]
    .sort((a, b) => {
      const rank = (r: LogRecord) => (r.scenes?.is_product || r.scene_selection === 'With Product' ? 1 : 0);
      return rank(a) - rank(b) || (a.created_at ?? '').localeCompare(b.created_at ?? '');
    })
    .map(r => (r.script ?? '').trim())
    .filter(part => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join('\n\n');
}

function getPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

// Generation-row columns, in render order. Widths are the resizable defaults.
const COLUMNS = [
  { id: 'generation_id', label: 'Generation ID', width: 120 },
  { id: 'created',        label: 'Created',       width: 160 },
  { id: 'ad_id',          label: 'Ad ID',         width: 90 },
  { id: 'script_id',      label: 'Script ID',     width: 90 },
  { id: 'concept',        label: 'Concept',       width: 180 },
  { id: 'angle',          label: 'Angle',         width: 130 },
  { id: 'funnel',         label: 'Funnel',        width: 110 },
  { id: 'scene_selection',label: 'Scene Selection', width: 140 },
  { id: 'cs',             label: 'CS',            width: 110 },
  { id: 'brand',          label: 'Brand',         width: 110 },
  { id: 'product',        label: 'Product',       width: 110 },
  { id: 'status',         label: 'Progress',      width: 190 },
  { id: 'pipeline_status',label: 'Pipeline Status', width: 150 },
] as const;

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: <Clock className="h-3 w-3" /> },
  processing: { label: 'Processing', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',       icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  merging:    { label: 'Merging',    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed:  { label: 'Completed',  color: 'bg-green-500/10 text-green-500 border-green-500/20',    icon: <CheckCircle className="h-3 w-3" /> },
  failed:     { label: 'Failed',     color: 'bg-red-500/10 text-red-500 border-red-500/20',          icon: <XCircle className="h-3 w-3" /> },
};

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = statusConfig[status] || statusConfig.pending;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cfg.color)}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

const stageMeta: Record<ProgressStage, { label: string; bar: string; text: string }> = {
  pending:    { label: 'Queued',     bar: '[&>div]:bg-yellow-500', text: 'text-yellow-600' },
  generating: { label: 'Generating', bar: '[&>div]:bg-blue-500',   text: 'text-blue-600' },
  merging:    { label: 'Merging',    bar: '[&>div]:bg-purple-500', text: 'text-purple-600' },
  done:       { label: 'Completed',  bar: '[&>div]:bg-green-500',  text: 'text-green-600' },
  failed:     { label: 'Failed',     bar: '[&>div]:bg-red-500',    text: 'text-red-600' },
  pushing:    { label: 'Pushing',    bar: '[&>div]:bg-indigo-500', text: 'text-indigo-600' },
  pushed:     { label: 'Pushed',     bar: '[&>div]:bg-emerald-500',text: 'text-emerald-600' },
};

// Bar + (stage · ETA/duration) line. Shared by the generation row and avatar cards.
function ProgressLine({ pct, stage, etaMs, totalMs, elapsedMs, height = 'h-1.5' }: {
  pct: number;
  stage: ProgressStage;
  etaMs: number | null;
  totalMs?: number | null;
  elapsedMs?: number | null;
  height?: string;
}) {
  const meta = stageMeta[stage];
  const right =
    stage === 'failed' ? null
    : stage === 'done' ? (totalMs != null ? `Took ${formatDuration(totalMs)}` : 'Completed')
    : stage === 'pushed' ? (totalMs != null ? `Took ${formatDuration(totalMs)}` : null)
    : etaMs != null ? formatEta(etaMs)
    : elapsedMs != null ? `${formatDuration(elapsedMs)} elapsed`
    : null;
  return (
    <div className="flex w-full flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium leading-none">
        <span className={cn('truncate', meta.text)}>{meta.label}</span>
        {right && <span className="shrink-0 text-muted-foreground tabular-nums">{right}</span>}
      </div>
      <Progress value={Math.round(pct)} className={cn(height, meta.bar)} />
    </div>
  );
}

// Defers loading the video until it scrolls into view, so a grid of many
// cards doesn't fetch every clip at once.
function LazyVideo({ src, onDuration }: { src: string; onDuration?: (seconds: number) => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!el || visible || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setVisible(true); io.disconnect(); break; }
      }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [el, visible]);
  return (
    <div ref={setEl} className="w-full h-full">
      <video
        src={src}
        controls
        preload={visible ? 'metadata' : 'none'}
        playsInline
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) onDuration?.(d);
        }}
        className="w-full h-full object-cover bg-black"
      />
    </div>
  );
}

// ── Pre-launch edits ─────────────────────────────────────────────────────────
// Inline editor for the generation's targeting fields, shown in the expanded
// row. Editable until the ad is pushed to the pipeline, then locked to a
// read-only summary (the brief/launch then owns the truth). Each field saves on
// change via update_by_generation_id, so every record in the generation stays
// uniform — matching how the values were written at creation time.
const FUNNEL_OPTIONS = ['Onbrand', 'Comparison', 'TSL'] as const;

interface TargetingMeta { persona: string | null; sub_angle: string | null; sub_angle_detail?: string | null; main_pains: string[] | null; }

type CsOwner = { label: string; email?: string };

// ── Playback speed (pre-push) — ClickUp 86carazce ────────────────────────────
// A finished video can be re-processed to a faster playback speed (pitch-safe)
// BEFORE it is pushed to the pipeline, so borderline-60s ads land under 59s. The
// re-process always derives from the natural-pace original, so re-picking never
// stacks (1.25x then 1.5x = 1.5x). "Normal" reverts to the original.
const SPEED_OPTIONS = ['Normal', '1.1x', '1.2x', '1.25x', '1.5x'];
const speedLabelToFactor = (label: string): number =>
  label === 'Normal' ? 1 : Number(label.replace(/x$/i, '')) || 1;
const speedFactorToLabel = (factor: number | null | undefined): string => {
  const f = Number(factor);
  return !f || f === 1 ? 'Normal' : `${f}x`;
};

// Preview-then-apply speed picker (ClickUp 86carazce follow-up). Opens on "Change
// speed": plays the natural-pace ORIGINAL and previews each speed INSTANTLY via the
// browser's playbackRate (pitch preserved, so it matches the server render), each
// with a projected length. Nothing is processed until "Apply" runs the ONE real
// re-encode. Previewing is client-only — a previewed-but-not-applied clip still
// pushes its original.
function SpeedPreviewModal({
  open, onClose, records, busy, onApply,
}: {
  open: boolean;
  onClose: () => void;
  records: LogRecord[];
  busy: boolean;
  onApply: (label: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentSpeed = Number(records.find(r => r.final_playback_speed)?.final_playback_speed) || 1;
  const [factor, setFactor] = useState<number>(currentSpeed);
  const [measured, setMeasured] = useState<number | null>(null);
  const [srcError, setSrcError] = useState(false);

  // Preview + projected lengths reference the natural-pace ORIGINAL (Apply always
  // re-derives from it, so previewing the current possibly-sped file would compound
  // the speed). Fall back to the current preview for legacy rows (still at Normal).
  const originalSrc = resolveVideoUrl(
    records.find(r => r.original_preview_video_url)?.original_preview_video_url
    // Only fall back to preview_video_url when the row is at Normal (then it IS the
    // original). Never for a sped row without a frozen original — that would play the
    // already-sped file at playbackRate and compound the preview. Projected lengths
    // still come from derivedOriginal, so the modal stays useful either way.
    ?? records.find(r => (Number(r.final_playback_speed) || 1) === 1 && r.preview_video_url)?.preview_video_url
    ?? null
  );
  const currentDur = records.find(r => r.final_video_duration_sec != null)?.final_video_duration_sec ?? null;
  const derivedOriginal = currentDur != null ? currentDur * currentSpeed : null;
  // Measured (from the actual original file) wins; derived covers the 14-day
  // server-file cleanup case where the original preview 404s.
  const originalDuration = measured ?? derivedOriginal;

  // Reset selection/measurement whenever a new video is opened.
  useEffect(() => {
    if (open) { setFactor(currentSpeed); setMeasured(null); setSrcError(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, originalSrc]);

  const applyPitchSafeRate = () => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = factor;
    // Preserve pitch so the preview voice is natural (matches the ffmpeg atempo
    // render), not chipmunk. Default true in Chromium; set explicitly + prefixed.
    (v as any).preservesPitch = true;
    (v as any).webkitPreservesPitch = true;
    (v as any).mozPreservesPitch = true;
  };
  useEffect(() => { applyPitchSafeRate(); }, [factor]);

  const projFor = (f: number): number | null =>
    originalDuration == null ? null : (f === 1 ? originalDuration : originalDuration / f);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-violet-600" /> Change playback speed
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg overflow-hidden bg-black aspect-[9/16] max-h-[50vh] mx-auto">
          {originalSrc && !srcError ? (
            <video
              ref={videoRef}
              src={originalSrc}
              controls
              autoPlay
              playsInline
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setMeasured(d);
                applyPitchSafeRate();
              }}
              onError={() => setSrcError(true)}
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-center text-[11px] text-muted-foreground px-4">
              Original preview expired (cleaned after 14 days). Projected lengths below are still accurate — Apply to re-render.
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Preview each speed instantly — the voice stays natural. Nothing is processed until you Apply.
        </p>

        <div className="grid grid-cols-5 gap-1.5">
          {SPEED_OPTIONS.map((opt) => {
            const f = speedLabelToFactor(opt);
            const proj = projFor(f);
            const selected = f === factor;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setFactor(f)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] font-semibold transition-colors',
                  selected ? 'bg-violet-600 border-violet-600 text-white' : 'bg-background border-border hover:bg-muted/50'
                )}
              >
                <span>{opt}</span>
                <span className={cn(
                  'text-[9px] font-medium tabular-nums',
                  selected ? 'text-white/90' : proj != null && proj <= 59 ? 'text-emerald-600' : 'text-amber-600'
                )}>
                  {proj != null ? formatClipDuration(proj) : '—'}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="mt-1 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-md border text-xs hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || factor === currentSpeed}
            onClick={() => onApply(speedFactorToLabel(factor))}
            title={factor === currentSpeed ? 'Already at this speed' : 'Render this speed and use it for the push'}
            className="h-8 px-3 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors"
          >
            {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</> : `Apply ${speedFactorToLabel(factor)}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Mirror of BatchCreator's SoftSelect — a shadcn Select with a "None"/placeholder
// row, so the log's targeting dropdowns match the creation page exactly. Radix
// forbids an empty-string value, so we route "no selection" through a sentinel.
function SoftSelect({
  value, onChange, options, placeholder, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const NONE = '__none__';
  const cleanOptions = options.filter((o) => o && o.trim());
  // Surface a value that isn't in the fetched list as a one-off item so the
  // trigger doesn't render a blank/broken state.
  const valueNotInList = value && !cleanOptions.includes(value);
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)} disabled={disabled}>
      <SelectTrigger className="h-9 text-[12.5px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="italic text-muted-foreground">{placeholder}</SelectItem>
        {valueNotInList && <SelectItem value={value}>{value}</SelectItem>}
        {cleanOptions.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Mirror of BatchCreator's CsCombobox — a searchable Popover + Command list for
// picking the Creative Strategist, matching the creation page's CS field.
function CsCombobox({
  value, owners, onChange, disabled,
}: {
  value: string;
  owners: CsOwner[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (owners.length === 0) {
    return (
      <div className="h-9 px-3 flex items-center text-[12.5px] rounded-md border border-border/85 bg-muted/30 text-muted-foreground">
        {value || 'Agentic'} <span className="ml-auto text-[10.5px] italic">(roster unavailable)</span>
      </div>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full px-3 flex items-center text-[12.5px] rounded-md border border-border/85 bg-background hover:bg-muted/40 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="truncate">{value || 'Pick a CS'}</span>
          <ChevronDown className="ml-auto size-3.5 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search Creative Strategists…" className="h-9 text-[12px]" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No CS matched.</CommandEmpty>
            <CommandGroup>
              {owners.map((c) => (
                <CommandItem
                  key={c.label}
                  value={`${c.label} ${c.email ?? ''}`}
                  onSelect={() => { onChange(c.label); setOpen(false); }}
                  className="text-[12px] flex items-center"
                >
                  <Check className={cn('mr-2 size-3.5', value === c.label ? 'opacity-100 text-emerald-500' : 'opacity-0')} />
                  <span className="font-medium">{c.label}</span>
                  {c.email && <span className="ml-auto text-[10.5px] text-muted-foreground">{c.email}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PreLaunchEditor({
  group, product, locked, onSaved,
}: {
  group: LogGroup;
  product: string;
  locked: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const targeting: TargetingMeta =
    group.records.find(r => r.targeting_metadata)?.targeting_metadata
    ?? { persona: null, sub_angle: null, sub_angle_detail: null, main_pains: null };

  const cs = group.cs ?? '';
  const concept = group.concept ?? '';
  const persona = targeting.persona ?? '';
  // Legacy `sub_angle` column = the "Angle" (relabelled in the UI below).
  const subAngle = targeting.sub_angle ?? '';
  // New `sub_angle_detail` column = the real "Sub-angle".
  const subAngleDetail = targeting.sub_angle_detail ?? '';
  const mainPains = targeting.main_pains ?? [];

  const [pending, setPending] = useState<string | null>(null);
  const [conceptDraft, setConceptDraft] = useState(concept);
  const [csOwners, setCsOwners] = useState<CsOwner[]>([]);
  const [personaOpts, setPersonaOpts] = useState<string[]>([]);
  const [subAngleOpts, setSubAngleOpts] = useState<string[]>([]);
  const [subAngleDetailOpts, setSubAngleDetailOpts] = useState<string[]>([]);
  const [painOpts, setPainOpts] = useState<string[]>([]);

  // Keep the concept draft in sync when a refetch brings a new server value.
  useEffect(() => { setConceptDraft(concept); }, [concept]);

  // Load option lists once when the (unlocked) editor mounts for this product.
  useEffect(() => {
    if (locked || !product) return;
    const q = `productName=${encodeURIComponent(product)}`;
    let cancelled = false;
    (async () => {
      const safeJson = async (url: string) => {
        try { const r = await fetch(url); return r.ok ? await r.json() : []; } catch { return []; }
      };
      // Angle + Sub-angle values come from the CS KPIs config so the form
      // matches the KPI taxonomy. "angles" = main angle (stored in sub_angle),
      // "sub-angle-details" = the new Sub-angle (stored in sub_angle_detail).
      const [owners, personas, angles, subAngleDetails, pains] = await Promise.all([
        safeJson(`${API_BASE}/api/options/cs-owners`),
        safeJson(`${API_BASE}/api/options/personas?${q}`),
        safeJson(`${API_BASE}/api/options/angles?${q}`),
        safeJson(`${API_BASE}/api/options/sub-angle-details?${q}`),
        safeJson(`${API_BASE}/api/options/pains?${q}`),
      ]);
      if (cancelled) return;
      setCsOwners(Array.isArray(owners) ? owners.map((c: { label?: string; email?: string }) => ({ label: c?.label, email: c?.email })).filter((o: CsOwner) => o.label) : []);
      setPersonaOpts(Array.isArray(personas) ? personas.filter(Boolean) : []);
      setSubAngleOpts(Array.isArray(angles) ? angles.filter(Boolean) : []);
      setSubAngleDetailOpts(Array.isArray(subAngleDetails) ? subAngleDetails.filter(Boolean) : []);
      setPainOpts(Array.isArray(pains) ? pains.filter(Boolean) : []);
    })();
    return () => { cancelled = true; };
  }, [locked, product]);

  // 'Agentic' is always offered; the current value is surfaced if the roster
  // doesn't include it. Deduped by label so the combobox has no repeats.
  const csComboOwners = useMemo(() => {
    const base: CsOwner[] = [{ label: 'Agentic' }, ...csOwners];
    if (cs && !base.some(o => o.label === cs)) base.push({ label: cs });
    const seen = new Set<string>();
    return base.filter(o => (seen.has(o.label) ? false : (seen.add(o.label), true)));
  }, [csOwners, cs]);

  const patch = async (key: string, update: Record<string, unknown>) => {
    setPending(key);
    try {
      const res = await fetch(`${API_BASE}/api/video-generation-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_by_generation_id', generation_id: group.generation_id, update }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Server error ${res.status}`);
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setPending(null);
    }
  };

  const patchTargeting = (partial: Partial<TargetingMeta>) =>
    patch('targeting', {
      targeting_metadata: {
        persona: targeting.persona ?? null,
        sub_angle: targeting.sub_angle ?? null,
        sub_angle_detail: targeting.sub_angle_detail ?? null,
        main_pains: targeting.main_pains ?? null,
        ...partial,
      },
    });

  const togglePain = (p: string) => {
    const next = mainPains.includes(p) ? mainPains.filter(x => x !== p) : [...mainPains, p];
    patchTargeting({ main_pains: next.length ? next : null });
  };

  // ── Locked: read-only summary ──────────────────────────────────────────────
  if (locked) {
    return (
      <div className="mb-4 rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground/80">
          <Lock className="h-3 w-3" /> Final · locked
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-1.5 text-xs">
          <ReadField label="Product" value={product} muted />
          <ReadField label="CS" value={cs} />
          <ReadField label="Concept" value={concept} />
          {/* Persona hidden for the CS rollout — value/column kept, not shown. */}
          <ReadField label="Angle" value={subAngle || 'None'} muted={!subAngle} />
          <ReadField label="Sub-angle" value={subAngleDetail || 'None'} muted={!subAngleDetail} />
        </dl>
        {mainPains.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Main Pains</span>
            {mainPains.map(p => (
              <span key={p} className="inline-flex items-center rounded-full border bg-card px-2 py-0.5 text-[10.5px] text-foreground/90">{p}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Unlocked: inline editor ────────────────────────────────────────────────
  return (
    <div className="mb-4 rounded-lg border bg-primary/[0.03] px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Pencil className="h-3 w-3 text-primary" />
        <span className="text-[10.5px] uppercase tracking-wider font-semibold text-foreground/80">Pre-launch edits</span>
        <span className="text-[10.5px] text-muted-foreground/75 italic">Locked once the ad is pushed to launch</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <EditField label="Product">
          <div className="h-8 px-2 flex items-center text-xs text-muted-foreground/80 truncate" title={product}>{product || '—'}</div>
        </EditField>
        <EditField label="CS" busy={pending === 'cs'}>
          <CsCombobox
            value={cs}
            owners={csComboOwners}
            disabled={pending === 'cs'}
            onChange={(v) => patch('cs', { cs: v })}
          />
        </EditField>
        {/* Persona is hidden for the CS rollout. The value, the patchTargeting
            payload, and the ads.persona column are kept — only the editor field
            is not rendered. */}
        <EditField label="Angle" busy={pending === 'targeting'}>
          <SoftSelect
            value={subAngle}
            options={subAngleOpts}
            placeholder="None"
            disabled={pending === 'targeting'}
            onChange={(v) => patchTargeting({ sub_angle: v || null })}
          />
        </EditField>
        <EditField label="Sub-angle" busy={pending === 'targeting'}>
          <SoftSelect
            value={subAngleDetail}
            options={subAngleDetailOpts}
            placeholder="None"
            disabled={pending === 'targeting'}
            onChange={(v) => patchTargeting({ sub_angle_detail: v || null })}
          />
        </EditField>
        <EditField label="Concept" busy={pending === 'concept'}>
          <Input
            value={conceptDraft}
            disabled={pending === 'concept'}
            onChange={(e) => setConceptDraft(e.target.value)}
            onBlur={() => { if (conceptDraft.trim() !== concept) patch('concept', { concept: conceptDraft.trim() }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="h-8 text-xs"
            placeholder="Concept"
          />
        </EditField>
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1.5 flex items-center gap-1.5">
          Main Pains
          {pending === 'targeting' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
        </div>
        {painOpts.length > 0 ? (
          <div className="flex items-center gap-1 flex-wrap">
            {painOpts.map(p => {
              const active = mainPains.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePain(p)}
                  disabled={pending === 'targeting'}
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40',
                    active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted text-muted-foreground'
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground italic">No pain library entries for {product || 'this product'}.</div>
        )}
      </div>
    </div>
  );
}

function ReadField({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{label}</div>
      <div className={cn('text-xs truncate', muted ? 'text-muted-foreground/70' : 'text-foreground font-medium')} title={value}>{value || '—'}</div>
    </div>
  );
}

function EditField({ label, busy, children }: { label: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold flex items-center gap-1">
        {label}
        {busy && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      </div>
      {children}
    </div>
  );
}

export default function UgcVideoBuiltLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogGroup[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  // Speed preview-then-apply modal target (one avatar's records).
  const [speedModal, setSpeedModal] = useState<{ generationId: string; avatarId: string; records: LogRecord[] } | null>(null);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  // Clip playback length (seconds) per avatar, read from each preview <video>.
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [colWidths, setColWidths] = useState<Record<string, number>>(
    () => Object.fromEntries(COLUMNS.map(c => [c.id, c.width]))
  );

  // Drag-to-resize a column from its right border (AG-Grid-style).
  const handleResizeStart = (e: React.MouseEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colId];
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(60, startWidth + (ev.clientX - startX));
      setColWidths(prev => ({ ...prev, [colId]: next }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const tableWidth = COLUMNS.reduce((sum, c) => sum + colWidths[c.id], 0);

  const [expandedGenId, setExpandedGenId] = useState<string | null>(null);
  const [expandedAvatarKey, setExpandedAvatarKey] = useState<string | null>(null);
  const [pipelineJobs, setPipelineJobs] = useState<Record<string, { jobId: string; status: string }>>({});
  const [regeneratingAvatars, setRegeneratingAvatars] = useState<Record<string, boolean>>({});
  // Per-avatar "adjusting playback speed" spinner (key = `${generation_id}_${avatar_id}`).
  const [adjustingAvatars, setAdjustingAvatars] = useState<Record<string, boolean>>({});
  const [pipelineSelectedAvatarIds, setPipelineSelectedAvatarIds] = useState<Set<string>>(new Set());
  const [pipelineIntendedPlatform, setPipelineIntendedPlatform] = useState<'Meta' | 'Applovin' | 'Both'>('Both');
  const [pipelineScriptIdMode, setPipelineScriptIdMode] = useState<'new' | 'existing'>('existing');
  const [pipelineScriptId, setPipelineScriptId] = useState<string>('');

  // ── Log scoping + filters (ticket criterion 5) ──────────────────────────────
  const isAdmin = useMemo(
    () => (user?.user_type ?? []).some((t) => ["Admin", "Super Admin", "Dev"].includes(t)),
    [user],
  );
  const [sourceFilter, setSourceFilter] = useState<'all' | 'agentic' | 'human'>('all');
  const [csFilter, setCsFilter] = useState<string>('__all__');
  const [myCsLabel, setMyCsLabel] = useState<string>('');

  // Resolve the logged-in user's CS label (as stored in video_generation_logs.cs)
  // by matching their email against the cs_config-backed options list.
  useEffect(() => {
    if (!user?.email) return;
    fetch(`${API_BASE}/api/options/cs-owners`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        const me = (Array.isArray(rows) ? rows : []).find(
          (r) => String(r.email || '').toLowerCase() === user.email.toLowerCase(),
        );
        if (me?.label) setMyCsLabel(me.label);
      })
      .catch(() => {});
  }, [user?.email]);

  const isAgenticGroup = (g: LogGroup) =>
    /^AGENTIC-/i.test(g.concept || '') || String(g.cs || '').toLowerCase() === 'agentic';

  const csOptions = useMemo(() => {
    const s = new Set<string>();
    for (const g of logs) if (g.cs) s.add(g.cs);
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [logs]);

  useEffect(() => {
    if (!user) return;
    fetchLogs();
    supabase.from('brands').select('name, brand_code').then(({ data }) => setBrands((data as any) || []));
    supabase.from('products').select('name, product_code').then(({ data }) => setProducts((data as any) || []));
  }, [user]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);
  useEffect(() => { setCurrentPage(1); }, [pageSize]);
  useEffect(() => { setCurrentPage(1); }, [sourceFilter, csFilter]);

  // Live progress/ETA support. `now` ticks the elapsed/ETA readouts; the rolling
  // average baseline and the "any generation in flight?" flag are derived from
  // the fetched logs.
  const [now, setNow] = useState<number>(() => Date.now());
  const avgDurationMs = useMemo(() => computeTypicalDurationMs(logs), [logs]);
  const typicalPushMs = useMemo(() => computeTypicalPushMs(logs), [logs]);
  const hasActive = useMemo(
    () => logs.some(g => g.records.some(
      r => ACTIVE_STATUSES.has(r.status) || (r.in_pipeline || '').toLowerCase() === 'processing'
    )),
    [logs]
  );

  // Tick once per second while something is generating, so the bars/ETAs move
  // without re-fetching. Paused when nothing is active or the tab is hidden.
  useEffect(() => {
    if (!hasActive) return;
    setNow(Date.now());
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [hasActive]);

  // Poll the backend every 10s while in-flight so real status transitions
  // (processing → merging → completed) surface on their own. Silent refresh =
  // no full-page loader. Stops when nothing is active / tab hidden.
  // Init to null (NOT fetchLogs) — fetchLogs is declared further down, so
  // referencing it here would hit its temporal dead zone and crash the render.
  // The effect below refreshes the ref after each render, by which point
  // fetchLogs is defined.
  const fetchLogsRef = useRef<((silent?: boolean) => void) | null>(null);
  useEffect(() => { fetchLogsRef.current = fetchLogs; });
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchLogsRef.current?.(true);
    }, 10000);
    return () => clearInterval(id);
  }, [hasActive]);

  // When a generation row expands, start with NOTHing selected (the user picks
  // videos manually) and default the script-ID controls from the group.
  useEffect(() => {
    if (!expandedGenId) return;
    const group = logs.find(g => g.generation_id === expandedGenId);
    if (!group) return;
    setPipelineSelectedAvatarIds(new Set());
    setPipelineScriptIdMode(group.ads_script_id ? 'existing' : 'new');
    setPipelineScriptId(group.ads_script_id != null ? String(group.ads_script_id) : '');
    // Default the platform radios to the value chosen on the creation page
    // (persisted on the log row), not a hardcoded "Both". Falls back to "Both"
    // for legacy rows created before intended_platform was plumbed through.
    setPipelineIntendedPlatform(normalizePlatform(
      group.intended_platform ?? group.records.find(r => r.intended_platform)?.intended_platform ?? null
    ));
  }, [expandedGenId]);

  const fetchLogs = async (silent = false) => {
    if (!user) return;
    if (!silent) setLoadingLogs(true);
    const fnResult = await fetch(`${API_BASE}/api/video-generation-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'select_all' }),
    }).then(res => res.json()).catch(err => ({ error: err?.message || 'Network error' }));

    if (fnResult?.error) {
      console.error('Error fetching logs:', fnResult.error);
      setLoadingLogs(false);
      return;
    }

    const data = fnResult?.data as LogRecord[];
    const map = new Map<string, LogGroup>();
    for (const row of data || []) {
      if (!map.has(row.generation_id)) {
        map.set(row.generation_id, {
          generation_id: row.generation_id,
          created_at: row.created_at,
          brand: row.brand,
          product_name: row.product_name,
          cs: row.cs,
          avatar_name: row.avatars?.name ?? '',
          avatar_image: row.avatars?.image_url ?? null,
          overall_status: row.status,
          final_video_url: row.final_video_url,
          in_pipeline: row.in_pipeline,
          ads_script_id: row.ads_script_id,
          funnel: row.funnel,
          scene_selection: row.scene_selection,
          ad_id: row.ad_id,
          clickup_url: row.clickup_url,
          concept: row.concept ?? null,
          created_by: row.created_by ?? null,
          intended_platform: row.intended_platform ?? null,
          records: [],
        });
      }
      const group = map.get(row.generation_id)!;
      group.records.push(row);
      const activePriority: Record<string, number> = { processing: 3, merging: 2, pending: 1 };
      if ((activePriority[row.status] ?? 0) > (activePriority[group.overall_status] ?? 0)) {
        group.overall_status = row.status;
      }
      if (row.final_video_url) group.final_video_url = row.final_video_url;
    }

    setLogs(Array.from(map.values()));
    setLoadingLogs(false);
  };

  // ── Edit & Regenerate (86caug6v1) ────────────────────────────────────────
  // Which of the loaded generations have a saved settings snapshot. Ads generated before
  // this feature shipped have none, and get NO button at all — a best-effort rebuild from
  // the log rows would silently misrepresent the avatar mode, the look on a without-only
  // ad, and any static bar the user configured then switched off. A form that looks
  // complete but isn't is worse than no button.
  const [snapshotGenIds, setSnapshotGenIds] = useState<Set<string>>(new Set());
  const [reopeningGenId, setReopeningGenId] = useState<string | null>(null);
  // generation_id → the generation it was regenerated FROM. Drives the lineage badge, which
  // is the cheapest governance we get: regenerating spends real HeyGen credits, and making
  // repeat regeneration VISIBLE means someone notices an ad that has been re-rolled ten times.
  const [snapshotLineage, setSnapshotLineage] = useState<Record<string, string>>({});
  // generation_id → how many ads its batch holds. 1 means "Reopen whole batch" would do
  // exactly what "Reopen this ad" does, so the UI drops the menu and acts directly.
  const [snapshotBatchSize, setSnapshotBatchSize] = useState<Record<string, number>>({});

  // One round trip for the whole page. Checking per row would fire a request per group on
  // every load, on a page that already pulls the entire log table unfiltered.
  useEffect(() => {
    const ids = logs.map(g => g.generation_id).filter(Boolean);
    if (ids.length === 0) { setSnapshotGenIds(new Set()); setSnapshotLineage({}); return; }
    let cancelled = false;
    (async () => {
      try {
        // CHUNKED, not truncated. select_all pulls the whole log table and groups it client
        // side, so `ids` is the total number of generations that exist — it grows without
        // bound. Slicing to the server's 500-id cap would silently drop older ads and take
        // their button away with no error anywhere.
        const CHUNK = 500;
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

        const responses = await Promise.all(chunks.map(chunk =>
          fetch(`${API_BASE}/api/ugc-generation-settings/exists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ generation_ids: chunk }),
          }).then(r => (r.ok ? r.json() : null)).catch(() => null)
        ));

        const existing = new Set<string>();
        const lineage: Record<string, string> = {};
        const sizes: Record<string, number> = {};
        for (const data of responses) {
          if (!data) continue;
          for (const id of data.existing ?? []) existing.add(id);
          Object.assign(lineage, data.lineage ?? {});
          Object.assign(sizes, data.batchSize ?? {});
        }
        if (!cancelled) {
          setSnapshotGenIds(existing);
          setSnapshotLineage(lineage);
          setSnapshotBatchSize(sizes);
        }
      } catch {
        // Backend unreachable → no buttons. Degrading to "feature absent" is correct here;
        // the log itself must keep working.
      }
    })();
    return () => { cancelled = true; };
  }, [logs]);

  /**
   * Reopen the Generate Video Ads page pre-filled from this ad's saved settings.
   *
   * Hands off through sessionStorage rather than a route param: the payload is a full
   * settings blob, and BatchCreator already consumes a one-shot sessionStorage handoff for
   * the chat flow, so this reuses a proven seam instead of inventing new plumbing.
   *
   * Nothing here mutates the source ad. The restored form mints FRESH generation_ids at
   * submit, so regenerating produces a brand-new log entry and the originals are untouched.
   */
  const handleEditRegenerate = async (generationId: string, scope: 'ad' | 'batch') => {
    setReopeningGenId(generationId);
    try {
      const res = await fetch(`${API_BASE}/api/ugc-generation-settings/${generationId}`);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'No saved settings for this ad — it was generated before Edit & Regenerate existed.'
            : `Could not load the saved settings (HTTP ${res.status}).`,
        );
      }
      const row = await res.json();
      let snapshots: unknown[] = [row.settings_json];

      if (scope === 'batch' && row.batch_id) {
        const bRes = await fetch(
          `${API_BASE}/api/ugc-generation-settings?batch_id=${encodeURIComponent(row.batch_id)}`,
        );
        if (bRes.ok) {
          const b = await bRes.json();
          if (Array.isArray(b.settings) && b.settings.length) {
            snapshots = b.settings.map((s: { settings_json: unknown }) => s.settings_json);
          }
        }
        // A failed batch lookup falls back to the single ad we already have rather than
        // aborting — the user still gets a usable form.
      }

      sessionStorage.setItem(
        RESTORE_SESSION_KEY,
        JSON.stringify({ snapshots, source_generation_id: generationId }),
      );
      navigate('/ugc-builder/batch-creator');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reopen these settings');
    } finally {
      setReopeningGenId(null);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `video-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Download failed.');
    }
  };

  const handlePushToPipeline = async (
    group: LogGroup,
    selectedAvatarIds: Set<string>,
    intendedPlatform: string,
    scriptIdMode: 'new' | 'existing',
    manualScriptId: string,
  ) => {
    const brandCode = brands.find(b => b.name === group.brand)?.brand_code ?? group.brand;
    const productCode = products.find(p => p.name === group.product_name)?.product_code ?? group.product_name;

    // Targeting attributes are uniform across a generation — read from any record that has them.
    const targeting = group.records.find(r => r.targeting_metadata)?.targeting_metadata ?? null;

    const avatarMap = new Map<string, LogRecord[]>();
    for (const rec of group.records) {
      if (!avatarMap.has(rec.avatar_id)) avatarMap.set(rec.avatar_id, []);
      avatarMap.get(rec.avatar_id)!.push(rec);
    }

    const driveVideoLinks: string[] = [];
    const allRecordIds: string[] = [];

    for (const avatarId of selectedAvatarIds) {
      const records = avatarMap.get(avatarId) ?? [];
      const finalVideoUrl = records.find(r => r.final_video_url)?.final_video_url ?? null;
      if (!finalVideoUrl) continue;
      driveVideoLinks.push(finalVideoUrl);
      allRecordIds.push(...records.map(r => r.id));
    }

    if (driveVideoLinks.length === 0) return;

    const key = group.generation_id;
    setPipelineJobs(prev => ({ ...prev, [key]: { jobId: '', status: 'submitting' } }));

    try {
      // Resolve the script id: create a new one, or use the value entered by the user.
      let scriptId = String(manualScriptId ?? '').trim() || null;
      if (scriptIdMode === 'new') {
        const scriptRes = await fetch(`${API_BASE}/api/create-script`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_code: brandCode, product_code: productCode }),
        }).then(r => r.json()).catch(() => null);
        if (!scriptRes?.success || !scriptRes?.data?.script_id) {
          throw new Error('Failed to create script');
        }
        scriptId = String(scriptRes.data.script_id);
      }

      // Persist the resolved script id onto every record of this generation.
      if (scriptId) {
        await Promise.all(
          group.records.map(rec =>
            fetch(`${API_BASE}/api/video-generation-logs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'update_by_id', id: rec.id, update: { ads_script_id: scriptId } }),
            })
          )
        );
      }

      console.log("targeting: ",targeting)

      // The generated script + its generation id, so the pipeline writes them
      // into the ad's brief Doc (same as the automation push).
      //
      // A build splits the script into N ordered scene clips stored as separate
      // records (`scene_index` 1..N, product clip last), and every selected avatar
      // repeats the same indexed clip set. Reconstruct the full script by taking
      // one clip per scene_index in ascending order — this both restores the
      // narrative order and drops the per-avatar duplication.
      const script = buildFullScript(group.records);

      const res = await fetch(`${API_BASE}/api/push-to-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: productCode,
          brand: brandCode,
          cs: group.cs,
          driveVideoLinks,
          funnel: group.funnel,
          scriptId,
          concept: group.concept,
          intendedPlatform,
          recordIds: allRecordIds,
          persona:   targeting?.persona ?? "",
          angle:     targeting?.sub_angle ?? "",
          subAngle:  targeting?.sub_angle_detail ?? "",
          mainPains: targeting?.main_pains ?? [],
          script,
          generationId: group.generation_id,
        }),
      });

      if (!res.ok) throw new Error(`Pipeline API error: ${res.status}`);

      setPipelineJobs(prev => ({ ...prev, [key]: { jobId: '', status: 'done' } }));
      toast.success('Videos pushed to pipeline!');
      fetchLogs();
    } catch (err) {
      console.error('Pipeline push error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to push to pipeline');
      setPipelineJobs(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  };

  // Re-process an avatar's finished video to the chosen playback speed, then swap
  // the stored final in place so "Open in Drive", the preview <video>, and the
  // push all use the sped file. Always re-derives from the natural-pace original
  // server-side, so re-picking a speed never stacks.
  const handleAdjustSpeed = async (generationId: string, avatarRecords: LogRecord[], speedLabel: string) => {
    const avatarId = avatarRecords[0].avatar_id;
    const key = `${generationId}_${avatarId}`;
    const speed = speedLabelToFactor(speedLabel);
    const current = Number(avatarRecords.find(r => r.final_playback_speed)?.final_playback_speed) || 1;
    if (current === speed) return; // already at this speed — no-op

    setAdjustingAvatars(prev => ({ ...prev, [key]: true }));
    // Drop this video from the push selection while it re-processes — its
    // final_video_url is changing, so it must not be pushed mid-flight. The
    // select toggle is also disabled during this window (re-select once done).
    setPipelineSelectedAvatarIds(prev => {
      if (!prev.has(avatarId)) return prev;
      const next = new Set(prev);
      next.delete(avatarId);
      return next;
    });
    try {
      const res = await fetch(`${API_BASE}/api/adjust-video-speed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds: avatarRecords.map(r => r.id), speed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || body?.details || `Adjust speed failed (${res.status})`);

      const { driveLink, serverVideoUrl, durationSec } = body as { driveLink: string; serverVideoUrl: string; durationSec: number | null };
      const affected = new Set(avatarRecords.map(r => r.id));
      setLogs(prev => prev.map(g =>
        g.generation_id === generationId
          ? {
              ...g,
              final_video_url: g.records.some(r => affected.has(r.id)) ? driveLink : g.final_video_url,
              records: g.records.map(r =>
                affected.has(r.id)
                  ? { ...r, final_video_url: driveLink, preview_video_url: serverVideoUrl, final_video_duration_sec: durationSec, final_playback_speed: speed }
                  : r
              ),
            }
          : g
      ));
      // Update the length badge immediately (the preview <video> also re-measures
      // when its src changes, but this refreshes it even if it's off-screen).
      if (durationSec != null) setClipDurations(prev => ({ ...prev, [avatarId]: durationSec }));
      toast.success(speed === 1 ? 'Reverted to original speed' : `Sped up to ${speedLabel}`);
    } catch (err) {
      console.error('Adjust speed error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to adjust speed');
    } finally {
      setAdjustingAvatars(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
  };

  const handleRegenerateAvatar = async (generationId: string, avatarRecords: LogRecord[]) => {
    const avatarId = avatarRecords[0].avatar_id;
    const key = `${generationId}_${avatarId}`;
    setRegeneratingAvatars(prev => ({ ...prev, [key]: true }));

    try {
      await Promise.all(
        avatarRecords.map(rec =>
          fetch(`${API_BASE}/api/video-generation-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_by_id', id: rec.id, update: { status: 'processing', final_video_url: null } }),
          })
        )
      );
      setLogs(prev => prev.map(g =>
        g.generation_id === generationId
          ? {
              ...g,
              overall_status: 'processing',
              final_video_url: null,
              records: g.records.map(r =>
                avatarRecords.some(ar => ar.id === r.id) ? { ...r, status: 'processing', final_video_url: null } : r
              ),
            }
          : g
      ));

      // The FACE comes from the scene row; the VOICE must come from the avatar that
      // OWNS that scene, not from the log row's `avatar_id`. For an ordinary clip the
      // two are the same id (checked on the 25 most recent production rows with a
      // scene_id: 25/25 equal). For a HOOK clip (ClickUp 86caz3tkg) they deliberately
      // differ — the hook row is bucketed under the BODY avatar's id so the Build Log
      // keeps showing one card per delivered video, while its scene is the HOOK
      // avatar's. Keying the voice off rec.avatar_id there re-filmed the hook with the
      // hook avatar's face and the body avatar's voice. The `?? rec.avatar_id` fallback
      // keeps every pre-hook / hook-off row byte-identical to before (same id, and the
      // same lookup when a row has no scene_id at all).
      const sceneResults = await Promise.all(
        avatarRecords.map(rec =>
          rec.scene_id
            ? supabase.from('scenes').select('heygen_avatar_id, is_product, avatar_id').eq('id', rec.scene_id).single()
            : Promise.resolve({ data: null, error: null })
        )
      );
      const sceneOwnerAvatarId = (i: number): string | null =>
        (sceneResults[i].data as { avatar_id?: string | null } | null)?.avatar_id ?? null;
      const voiceResults = await Promise.all(
        avatarRecords.map((rec, i) =>
          supabase
            .from('avatars')
            .select('heygen_voice_id')
            .eq('id', sceneOwnerAvatarId(i) ?? rec.avatar_id)
            .single()
        )
      );

      await Promise.all(
        avatarRecords.map(async (rec, i) => {
          const heygenAvatarId = (sceneResults[i].data as any)?.heygen_avatar_id;
          const heygenVoiceId = (voiceResults[i].data as any)?.heygen_voice_id ?? 'Ryelb74sfkLgSElzikns';
          if (!heygenAvatarId) throw new Error(`No HeyGen avatar ID for scene of ${rec.scenes?.name ?? rec.scene_id}`);
          const res = await fetch(`${API_BASE}/api/create-heygen-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              heygen_avatar_id: heygenAvatarId,
              title: rec.scenes?.name ?? 'Video',
              script: rec.script,
              voice_id: heygenVoiceId,
              log: {
                id: rec.id,
                avatar_id: rec.avatar_id,
                generation_id: rec.generation_id ?? generationId,
                scene_id: rec.scene_id,
                product_name: rec.product_name,
                brand: rec.brand,
                script: rec.script,
                cs: rec.cs,
                concept: rec.concept,
                is_product: (sceneResults[i].data as any)?.is_product,
                ads_script_id: rec.ads_script_id,
                funnel: rec.funnel,
                scene_selection: rec.scene_selection,
                caption_placement: rec.caption_placement,
                product_placement: rec.product_placement,
                targeting_metadata: rec.targeting_metadata ?? null,
              },
            }),
          });
          const data = await res.json();
          if (!data?.video_id) throw new Error(`Video creation failed for ${rec.scenes?.name ?? rec.id}`);
          return data;
        })
      );

      toast.success(`Video regenerating for ${avatarRecords[0].avatars?.name ?? 'avatar'}…`);
      fetchLogs();
    } catch (err) {
      console.error('Regeneration failed:', err);
      toast.error(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegeneratingAvatars(prev => ({ ...prev, [key]: false }));
    }
  };

  const filteredLogs = logs.filter((g) => {
    // Access scoping: non-admins (CS / media buyer / any custom user) see ONLY
    // their own videos, matched by CS label. Agentic/automation videos are
    // hidden from them entirely — those are admin / super-admin / dev only,
    // even ones they created themselves.
    if (!isAdmin) {
      if (isAgenticGroup(g)) return false;
      const csMatch = !!myCsLabel && String(g.cs || '').toLowerCase() === myCsLabel.toLowerCase();
      if (!csMatch) return false;
    } else {
      // Admin filters: source (agentic/human) + CS.
      if (sourceFilter === 'agentic' && !isAgenticGroup(g)) return false;
      if (sourceFilter === 'human' && isAgenticGroup(g)) return false;
      if (csFilter !== '__all__' && String(g.cs || '') !== csFilter) return false;
    }
    return logSearchMatches(g, searchTerm);
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 p-6 h-full overflow-hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Video Build Log</h1>
          <p className="text-sm text-muted-foreground">Track all video generations from UGC Builder.</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by generation ID, brand, product, avatar, status…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => navigate('/ugc-builder/batch-creator')}>
              Create Batch
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchLogs()} disabled={loadingLogs}>
              {loadingLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Filters — admins get source (agentic/human) + CS filters; non-admins
            are scoped to their own ads and just see a hint. */}
        {isAdmin ? (
          <div className="flex items-center gap-2 flex-wrap -mt-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mr-1">Source</span>
            {([
              { id: 'all' as const,     label: 'All' },
              { id: 'agentic' as const, label: 'Agentic' },
              { id: 'human' as const,   label: 'Human' },
            ]).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSourceFilter(s.id)}
                className={cn(
                  'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  sourceFilter === s.id
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
                )}
              >
                {s.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <Select value={csFilter} onValueChange={setCsFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="All CS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All CS</SelectItem>
                {csOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(sourceFilter !== 'all' || csFilter !== '__all__') && (
              <Button
                variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
                onClick={() => { setSourceFilter('all'); setCsFilter('__all__'); }}
              >
                Clear
              </Button>
            )}
          </div>
        ) : (
          <div className="-mt-1 text-xs text-muted-foreground">
            Showing your ads{myCsLabel ? ` (CS: ${myCsLabel})` : ''}.
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {loadingLogs ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">No generated videos yet.</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">No results match your search.</p>
          ) : (
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                <div className="overflow-auto flex-1">
                  <table className="text-sm" style={{ tableLayout: 'fixed', width: tableWidth, minWidth: '100%' }}>
                    <colgroup>
                      {COLUMNS.map(c => (
                        <col key={c.id} style={{ width: colWidths[c.id] }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="border-b bg-muted text-xs text-muted-foreground sticky top-0 z-10">
                        {COLUMNS.map(c => (
                          <th key={c.id} className="relative px-4 py-3 text-left font-medium select-none">
                            <span className="block truncate pr-1">{c.label}</span>
                            <div
                              onMouseDown={(e) => handleResizeStart(e, c.id)}
                              className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                              title="Drag to resize"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLogs.map((group) => (
                        <React.Fragment key={group.generation_id}>
                          {/* Level 1 — generation row */}
                          <tr
                            className="border-b hover:bg-muted/30 transition-colors cursor-pointer [&>td]:overflow-hidden"
                            onClick={() => setExpandedGenId(prev => prev === group.generation_id ? null : group.generation_id)}
                          >
                            {/* Generation ID — truncated to 8 chars, copy full UUID */}
                            <td className="px-4 py-3">
                              <div className="group/cell flex items-center gap-1 min-w-0">
                                <span className="font-mono text-xs text-muted-foreground truncate flex-1" title={group.generation_id}>
                                  {group.generation_id.slice(0, 8)}…
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(group.generation_id); toast.success('Copied!'); }}
                                  className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                  title="Copy full ID"
                                >
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                </button>
                              </div>
                            </td>
                            {/* Created */}
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(group.created_at).toLocaleString()}
                            </td>
                            {/* Ad ID */}
                            <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const adId = group.records.find(r => r.ad_id && r.ad_id !== 'NULL')?.ad_id;
                                return adId ? (
                                  <div className="group/cell flex items-center gap-1">
                                    <span className="text-xs font-mono">{adId}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(adId); toast.success('Copied!'); }}
                                      className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                      title="Copy"
                                    >
                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">—</span>;
                              })()}
                            </td>
                            {/* Script ID */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {group.ads_script_id ? (
                                <div className="group/cell flex items-center gap-1">
                                  <span className="font-mono text-xs">{group.ads_script_id}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(group.ads_script_id!); toast.success('Copied!'); }}
                                    className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                    title="Copy"
                                  >
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            {/* Concept — resizable column; drag the header border to widen */}
                            <td className="px-4 py-3">
                              {group.concept ? (
                                <div className="group/cell flex items-center gap-1 min-w-0">
                                  <span className="text-xs truncate flex-1" title={group.concept}>
                                    {group.concept}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(group.concept!); toast.success('Copied!'); }}
                                    className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                    title="Copy"
                                  >
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            {/* Angle — generation-level targeting sub_angle */}
                            <td className="px-4 py-3">
                              {(() => {
                                const angle = group.records.find(r => r.targeting_metadata)?.targeting_metadata?.sub_angle ?? null;
                                return angle ? (
                                  <div className="group/cell flex items-center gap-1 min-w-0">
                                    <span className="text-xs truncate flex-1" title={angle}>
                                      {angle}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(angle); toast.success('Copied!'); }}
                                      className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                      title="Copy"
                                    >
                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">—</span>;
                              })()}
                            </td>
                            {/* Funnel */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {group.funnel ? (
                                <div className="group/cell flex items-center gap-1">
                                  <span className="text-xs">{group.funnel}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(group.funnel!); toast.success('Copied!'); }}
                                    className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                    title="Copy"
                                  >
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            {/* Scene Selection */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              {group.scene_selection ? (
                                <div className="group/cell flex items-center gap-1">
                                  <span className="text-xs">{group.scene_selection}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(group.scene_selection!); toast.success('Copied!'); }}
                                    className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                    title="Copy"
                                  >
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            {/* CS */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="group/cell flex items-center gap-1">
                                <div className="flex flex-col">
                                  <span className="text-xs">{group.cs || '—'}</span>
                                  {group.created_by && (
                                    <span className="text-[9px] text-muted-foreground/70" title={`Created by ${group.created_by}`}>
                                      {group.created_by}
                                    </span>
                                  )}
                                </div>
                                {(group.cs || group.created_by) && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText([group.cs, group.created_by].filter(Boolean).join(' / ')); toast.success('Copied!'); }}
                                    className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                    title="Copy"
                                  >
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </td>
                            {/* Brand */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="group/cell flex items-center gap-1">
                                <span className="text-xs">{group.brand || '—'}</span>
                                {group.brand && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(group.brand); toast.success('Copied!'); }}
                                    className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                    title="Copy"
                                  >
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </td>
                            {/* Product */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="group/cell flex items-center gap-1">
                                <span className="text-xs">{group.product_name || '—'}</span>
                                {group.product_name && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(group.product_name); toast.success('Copied!'); }}
                                    className="shrink-0 rounded p-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                    title="Copy"
                                  >
                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const gp = computeGroupProgress(group, now, avgDurationMs);
                                return (
                                  <ProgressLine
                                    pct={gp.pct}
                                    stage={gp.stage}
                                    etaMs={gp.etaMs}
                                    totalMs={gp.totalMs}
                                  />
                                );
                              })()}
                            </td>
                            {/* Pipeline Status — push progress while pushing/pushed, else raw in_pipeline badge */}
                            <td className="px-4 py-3">
                              {(() => {
                                const gp = computeGroupPush(group, now, typicalPushMs);
                                if (gp.stage === 'pushing' || gp.stage === 'pushed') {
                                  return <ProgressLine pct={gp.pct} stage={gp.stage} etaMs={gp.etaMs} totalMs={gp.totalMs} />;
                                }
                                const pipelineStatus = group.records.find(r => r.in_pipeline)?.in_pipeline ?? group.in_pipeline;
                                if (!pipelineStatus) return <span className="text-xs text-muted-foreground">—</span>;
                                const s = pipelineStatus.toLowerCase();
                                const color =
                                  s.includes('ready to launch')  ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                  : s.includes('process')  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                  : s.includes('pending approval')  ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                  : s.includes('failed')  ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                  : 'bg-muted text-muted-foreground border-border';
                                return (
                                  <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', color)}>
                                    {pipelineStatus}
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>

                          {/* Level 2 — per-avatar rows */}
                          {expandedGenId === group.generation_id && (() => {
                            const avatarMap = new Map<string, LogRecord[]>();
                            for (const rec of group.records) {
                              if (!avatarMap.has(rec.avatar_id)) avatarMap.set(rec.avatar_id, []);
                              avatarMap.get(rec.avatar_id)!.push(rec);
                            }
                            const pipelineLocked = group.records.some(r => r.in_pipeline?.toLowerCase() === 'ready to launch');
                            // ClickUp is shared across all of a generation's videos — surface it once, up top.
                            const sharedClickupUrl = group.records.find(r => r.clickup_url && r.clickup_url !== 'NULL' && r.clickup_url.startsWith('http'))?.clickup_url ?? null;
                            // A video is "pushed" once its records carry a pipeline state (the backend
                            // sets in_pipeline → processing → Ready to Launch only for pushed records).
                            const isAvatarPushed = (recs: LogRecord[]) => recs.some(r => {
                              const s = r.in_pipeline?.toLowerCase();
                              return s === 'processing' || s === 'ready to launch';
                            });
                            const avatarsWithVideo = Array.from(avatarMap.entries()).filter(([, recs]) => recs.some(r => r.final_video_url));
                            const pushableAvatarIds = avatarsWithVideo.filter(([, recs]) => !isAvatarPushed(recs)).map(([id]) => id);
                            const pushedCount = avatarsWithVideo.length - pushableAvatarIds.length;
                            const selectedPushCount = pushableAvatarIds.filter(id => pipelineSelectedAvatarIds.has(id)).length;
                            const allPushed = avatarsWithVideo.length > 0 && pushableAvatarIds.length === 0;
                            const isSubmitting = pipelineJobs[group.generation_id]?.status === 'submitting';

                            // Edit & Regenerate (86caug6v1). Built here rather than inline so it can
                            // sit on the provenance row while still lining up above the push button —
                            // both are right-aligned, one row apart.
                            // Deliberately NOT gated on pipelineLocked, unlike the per-avatar
                            // Regenerate: this mutates nothing and creates a brand-new batch, so
                            // reopening an already-pushed ad is safe.
                            const lineageSourceId = snapshotLineage[group.generation_id];
                            const adsInBatch = snapshotBatchSize[group.generation_id] ?? 1;
                            const reopenBusy = reopeningGenId === group.generation_id;
                            const reopenBtnClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-all hover:bg-primary/15 disabled:opacity-50 disabled:cursor-not-allowed';
                            const reopenIcon = reopenBusy
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Pencil className="h-4 w-4" />;

                            const editRegenerateControl = !snapshotGenIds.has(group.generation_id) ? null
                              // SINGLE-AD BATCH: "Reopen whole batch" would do exactly what "Reopen
                              // this ad" does, so offering both asks the user to choose between two
                              // identical things. Act on click; explain the flow in tooltip + caption.
                              : adsInBatch <= 1 ? (
                                <div className="flex flex-col items-end gap-1">
                                  <button
                                    type="button"
                                    disabled={reopenBusy}
                                    onClick={() => handleEditRegenerate(group.generation_id, 'ad')}
                                    className={reopenBtnClass}
                                    title={"Reopens this ad's settings, pre-filled, on the Generate Video Ads page.\n\nYou can change anything — scripts, avatars, title bar — then generate again.\n\nA NEW entry is created in this log. These videos stay exactly as they are."}
                                    data-testid="edit-regenerate-trigger"
                                  >
                                    {reopenIcon}
                                    {reopenBusy ? 'Opening…' : 'Edit & Regenerate'}
                                  </button>
                                  <span className="text-[10.5px] text-muted-foreground">
                                    Reopens pre-filled · creates a new entry · these videos stay
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-1">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        disabled={reopenBusy}
                                        className={reopenBtnClass}
                                        title="Reopen these settings pre-filled and generate a NEW batch — the original videos stay untouched"
                                        data-testid="edit-regenerate-trigger"
                                      >
                                        {reopenIcon}
                                        {reopenBusy ? 'Opening…' : 'Edit & Regenerate'}
                                        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-72 p-1.5">
                                      <p className="px-2 pt-1 pb-2 text-[11px] leading-snug text-muted-foreground">
                                        Opens the settings page pre-filled. Generating creates a{' '}
                                        <span className="font-medium text-foreground">new</span> log entry —
                                        these videos stay exactly as they are.
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleEditRegenerate(group.generation_id, 'ad')}
                                        className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                                        data-testid="edit-regenerate-this-ad"
                                      >
                                        <span className="font-medium">Reopen this ad</span>
                                        <span className="block text-[10.5px] text-muted-foreground">
                                          Just this one, with its own settings
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleEditRegenerate(group.generation_id, 'batch')}
                                        className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                                        data-testid="edit-regenerate-whole-batch"
                                      >
                                        <span className="font-medium">Reopen whole batch ({adsInBatch} ads)</span>
                                        <span className="block text-[10.5px] text-muted-foreground">
                                          Every ad created in the same submit
                                        </span>
                                      </button>
                                    </PopoverContent>
                                  </Popover>
                                  <span className="text-[10.5px] text-muted-foreground">
                                    {adsInBatch} ads in this batch · originals stay
                                  </span>
                                </div>
                              );

                            return (
                              <tr>
                                <td colSpan={13} className="p-0 bg-muted/5 border-b">
                                  <div className="px-6 py-4">
                                    {/* Row header — provenance on the left, Edit & Regenerate on the
                                        right, sharing one line. They belong together: "this came from
                                        X" and "make another one from this" are the same story. Right
                                        aligning the button also keeps it directly above the push
                                        button, one row down.
                                        This sits ABOVE the control toolbar, never inside it: the
                                        provenance is metadata about the row, not an action, and among
                                        the Script ID / Platform groups it read as a control. Those
                                        groups are flex-col with a label stacked on top, so a bare pill
                                        in an items-center row also floated visually between their
                                        label and their input.
                                        Neutral, not amber — amber is reserved for genuine warnings
                                        (see the stale-avatar notice), and reusing it here for a
                                        purely informational fact drains that signal.
                                        text-foreground/70 rather than text-muted-foreground: the
                                        muted token measures 4.29:1 on this surface, just under the
                                        4.5:1 AA floor for normal text. /70 composites to rgb(87,93,105)
                                        = 6.64:1, passing AA while staying clearly subordinate to the
                                        id link beside it (17.87:1). Measured in-browser, compositing
                                        the alpha over the surface — not eyeballed. */}
                                    {(lineageSourceId || editRegenerateControl) && (
                                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
                                        {lineageSourceId ? (
                                          <div className="flex items-center gap-1.5 text-xs text-foreground/70 min-w-0">
                                            <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            <span className="shrink-0">Regenerated from</span>
                                            {/* Full id, not truncated: the whole point is to paste it
                                                into the log search, and an 8-char stub cannot be. */}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSearchTerm(lineageSourceId);
                                                setExpandedGenId(lineageSourceId);
                                                toast.info('Filtered to the ad this was regenerated from');
                                              }}
                                              className="font-mono text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm truncate transition-colors"
                                              title="Click to filter the log to this generation"
                                              data-testid="regenerated-from-badge"
                                            >
                                              {lineageSourceId}
                                            </button>
                                            {/* Always visible, unlike the hover-reveal copy buttons in
                                                the table cells: there is exactly one of these per row,
                                                so there is no clutter to hide, and hiding it would make
                                                the main reason this id is shown undiscoverable. */}
                                            <button
                                              type="button"
                                              onClick={() => { navigator.clipboard.writeText(lineageSourceId); toast.success('Copied!'); }}
                                              className="shrink-0 rounded p-0.5 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                              title="Copy full generation ID"
                                              aria-label="Copy full generation ID"
                                              data-testid="regenerated-from-copy"
                                            >
                                              <Copy className="h-3 w-3 text-muted-foreground" />
                                            </button>
                                          </div>
                                        ) : <span />}
                                        {editRegenerateControl}
                                      </div>
                                    )}
                                    {/* Toolbar — shared ClickUp link, script + platform selection, push button */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 pb-3 border-b">
                                      {sharedClickupUrl && (
                                        <a
                                          href={sharedClickupUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" /> ClickUp
                                        </a>
                                      )}
                                      {!allPushed && (
                                        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                                          {/* Script ID — reuse an existing id or mint a fresh one on push */}
                                          <div
                                            className="flex flex-col gap-1.5"
                                            title={pipelineLocked ? 'Locked — already pushed to Ready to Launch' : undefined}
                                          >
                                            <span className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground/80">Script ID</span>
                                            <div className="flex items-center gap-2">
                                              <div className={cn('flex rounded-md border overflow-hidden', pipelineLocked && 'opacity-50')}>
                                                {([{ value: 'existing', label: 'Existing' }, { value: 'new', label: 'New' }] as const).map(({ value, label }) => (
                                                  <button
                                                    key={value}
                                                    type="button"
                                                    disabled={pipelineLocked}
                                                    onClick={() => { setPipelineScriptIdMode(value); if (value === 'new') setPipelineScriptId(''); }}
                                                    className={cn(
                                                      'px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0',
                                                      pipelineScriptIdMode === value ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                                                      pipelineLocked && 'cursor-not-allowed'
                                                    )}
                                                  >
                                                    {label}
                                                  </button>
                                                ))}
                                              </div>
                                              {pipelineScriptIdMode === 'existing' && (
                                                <Input
                                                  className="h-7 w-32 text-xs"
                                                  placeholder="Enter script ID…"
                                                  value={pipelineScriptId}
                                                  disabled={pipelineLocked}
                                                  onChange={(e) => setPipelineScriptId(e.target.value)}
                                                />
                                              )}
                                            </div>
                                          </div>
                                          {/* Intended Platform — which ad network the videos are built for */}
                                          <div
                                            className="flex flex-col gap-1.5"
                                            title={pipelineLocked ? 'Locked — already pushed to Ready to Launch' : undefined}
                                          >
                                            <span className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground/80">Intended Platform</span>
                                            <div
                                              role="radiogroup"
                                              aria-label="Intended platform"
                                              className={cn('flex w-fit rounded-md border overflow-hidden', pipelineLocked && 'opacity-50')}
                                            >
                                              {(['Meta', 'Applovin', 'Both'] as const).map(platform => (
                                                <button
                                                  key={platform}
                                                  type="button"
                                                  role="radio"
                                                  aria-checked={pipelineIntendedPlatform === platform}
                                                  disabled={pipelineLocked}
                                                  onClick={() => setPipelineIntendedPlatform(platform)}
                                                  className={cn(
                                                    'px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0',
                                                    pipelineIntendedPlatform === platform ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                                                    pipelineLocked && 'cursor-not-allowed'
                                                  )}
                                                >
                                                  {platform}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      <div className="ml-auto flex items-center gap-3">
                                        {pushedCount > 0 && (
                                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                            <Check className="h-3.5 w-3.5" /> {pushedCount} pushed
                                          </span>
                                        )}
                                        {allPushed || pipelineLocked ? (
                                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                                            <Check className="h-4 w-4" /> {allPushed ? 'Pushed to Ready to Launch' : 'Locked — Ready to Launch'}
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={isSubmitting || selectedPushCount === 0 || (pipelineScriptIdMode === 'existing' && !pipelineScriptId.trim())}
                                            onClick={() => handlePushToPipeline(group, pipelineSelectedAvatarIds, pipelineIntendedPlatform, pipelineScriptIdMode, pipelineScriptId)}
                                            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                            {isSubmitting ? 'Pushing…' : `Push ${selectedPushCount}/${pushableAvatarIds.length} to Ready to Launch`}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {/* Pre-launch edits — inline editor for the generation's targeting
                                        fields (uniform across the generation). Locks to a read-only
                                        summary once any video is pushed to the pipeline. */}
                                    <PreLaunchEditor
                                      group={group}
                                      product={group.product_name}
                                      locked={isPipelinePushed(group.records)}
                                      onSaved={() => fetchLogs(true)}
                                    />
                                    <div className="flex flex-wrap gap-3">
                                      {Array.from(avatarMap.entries()).map(([avatarId, records]) => {
                                        const avatarName = records[0].avatars?.name ?? 'Unknown';
                                        const avatarImage = records[0].avatars?.image_url ?? null;
                                        const finalVideoUrl = records.find(r => r.final_video_url)?.final_video_url ?? null;
                                        const previewUrl = resolveVideoUrl(records.find(r => r.preview_video_url)?.preview_video_url ?? null);
                                        const avatarStatus =
                                          records.some(r => r.status === 'processing') ? 'processing'
                                          : records.some(r => r.status === 'merging')  ? 'merging'
                                          : records.some(r => r.status === 'pending')  ? 'pending'
                                          : records.every(r => r.status === 'completed') ? 'completed'
                                          : 'failed';
                                        const avatarPushedForTiming = isPipelinePushed(records);
                                        const avatarProgress = computeProgress({
                                          status: avatarStatus,
                                          startMs: avatarStart(records),
                                          now,
                                          avgMs: avgDurationMs,
                                        });
                                        // Trustworthy finish time only when done and not pushed.
                                        const avatarTotalMs =
                                          avatarStatus === 'completed' && !avatarPushedForTiming
                                            ? avatarLastUpdate(records) - avatarStart(records)
                                            : null;
                                        const avatarPush = computePushProgress(records, now, typicalPushMs);
                                        const captionPos = (() => {
                                          const val = records.find(r => r.caption_placement)?.caption_placement;
                                          if (!val) return null;
                                          const m = /^(top|bottom):(\d+(?:\.\d+)?)$/.exec(val.trim().toLowerCase());
                                          return m ? `From ${m[1]}: ${m[2]}%` : val;
                                        })();
                                        const regenKey = `${group.generation_id}_${avatarId}`;
                                        const isRegenerating = !!regeneratingAvatars[regenKey];
                                        const isAdjustingSpeed = !!adjustingAvatars[regenKey];
                                        const currentSpeedLabel = speedFactorToLabel(records.find(r => r.final_playback_speed)?.final_playback_speed);
                                        // Voice speed this avatar's clips were GENERATED at (baked into
                                        // the HeyGen render). Distinct from the post-generation
                                        // playback-speed adjuster above.
                                        const genVoiceSpeed = records.find(r => r.voice_speed != null)?.voice_speed ?? null;
                                        const isAvatarExpanded = expandedAvatarKey === regenKey;
                                        const sortedRecords = [...records].sort((a, b) => {
                                          if (typeof a.scene_index === 'number' && typeof b.scene_index === 'number') {
                                            return a.scene_index - b.scene_index;
                                          }
                                          const aIsProduct = a.scenes?.is_product ?? true;
                                          const bIsProduct = b.scenes?.is_product ?? true;
                                          return aIsProduct === bIsProduct ? 0 : aIsProduct ? 1 : -1;
                                        });
                                        const downloadUrl = previewUrl ?? finalVideoUrl;
                                        const avatarPushed = isAvatarPushed(records);
                                        const avatarLaunched = records.some(r => r.in_pipeline?.toLowerCase() === 'ready to launch');
                                        const isSelectedForPush = !!finalVideoUrl && !avatarPushed && !pipelineLocked && pipelineSelectedAvatarIds.has(avatarId);
                                        return (
                                          <div
                                            key={avatarId}
                                            className={cn(
                                              'w-[190px] rounded-lg border bg-background overflow-hidden flex flex-col transition-all',
                                              avatarPushed
                                                ? 'border-emerald-500 ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-background'
                                                : isSelectedForPush
                                                ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md'
                                                : 'border-border'
                                            )}
                                          >
                                            {/* Video preview */}
                                            <div className="relative aspect-[9/16] bg-black/90 flex items-center justify-center">
                                              {previewUrl ? (
                                                <LazyVideo
                                                  src={previewUrl}
                                                  onDuration={(d) => setClipDurations(prev => (prev[avatarId] === d ? prev : { ...prev, [avatarId]: d }))}
                                                />
                                              ) : avatarStatus === 'completed' && finalVideoUrl ? (
                                                <a
                                                  href={finalVideoUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-primary px-2 text-center"
                                                >
                                                  <ExternalLink className="h-5 w-5" />
                                                  <span className="text-[10px]">Open in Drive</span>
                                                </a>
                                              ) : avatarStatus === 'failed' ? (
                                                <div className="flex flex-col items-center gap-1 text-destructive/80">
                                                  <XCircle className="h-5 w-5" />
                                                  <span className="text-[10px]">Failed</span>
                                                </div>
                                              ) : (
                                                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                                                  <Loader2 className="h-5 w-5 animate-spin" />
                                                  <span className="text-[10px] capitalize">{avatarStatus}…</span>
                                                </div>
                                              )}
                                              <div className="absolute top-1.5 left-1.5">
                                                <StatusBadge status={avatarStatus} />
                                              </div>
                                              {finalVideoUrl && avatarPushed ? (
                                                <span
                                                  title={avatarLaunched ? 'Pushed — Ready to Launch' : 'Pushed — processing'}
                                                  className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm"
                                                >
                                                  {avatarLaunched ? <Check className="h-2.5 w-2.5" /> : <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                                  Pushed
                                                </span>
                                              ) : finalVideoUrl ? (
                                                <button
                                                  type="button"
                                                  disabled={pipelineLocked || isAdjustingSpeed}
                                                  onClick={() => setPipelineSelectedAvatarIds(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(avatarId)) next.delete(avatarId); else next.add(avatarId);
                                                    return next;
                                                  })}
                                                  title={
                                                    pipelineLocked ? 'Locked — already pushed to Ready to Launch'
                                                    : isAdjustingSpeed ? 'Changing speed — can’t select for push yet'
                                                    : pipelineSelectedAvatarIds.has(avatarId) ? 'Selected for push' : 'Select for push'
                                                  }
                                                  className={cn(
                                                    'absolute top-1.5 right-1.5 h-5 w-5 rounded-md border flex items-center justify-center transition-colors backdrop-blur-sm',
                                                    pipelineSelectedAvatarIds.has(avatarId)
                                                      ? 'bg-primary border-primary text-primary-foreground'
                                                      : 'bg-black/40 border-white/50 text-transparent hover:border-white',
                                                    (pipelineLocked || isAdjustingSpeed) && 'cursor-not-allowed opacity-50'
                                                  )}
                                                >
                                                  <Check className="h-3 w-3" />
                                                </button>
                                              ) : null}
                                            </div>

                                            {/* Meta + actions */}
                                            <div className="p-2 flex flex-col gap-1.5">
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                {avatarImage ? (
                                                  <img src={avatarImage} alt={avatarName} className="h-5 w-5 rounded-full object-cover shrink-0" />
                                                ) : (
                                                  <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold shrink-0">
                                                    {avatarName.charAt(0)}
                                                  </div>
                                                )}
                                                <span className="text-xs font-medium truncate" title={avatarName}>{avatarName}</span>
                                                {genVoiceSpeed != null && (
                                                  <span
                                                    title={`Generated at ${genVoiceSpeed}× voice speed (baked into the render)`}
                                                    className="ml-auto shrink-0 inline-flex items-center rounded-full border border-sky-400/40 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-sky-600 dark:text-sky-300"
                                                  >
                                                    {genVoiceSpeed}×
                                                  </span>
                                                )}
                                              </div>
                                              {clipDurations[avatarId] != null && (
                                                <span
                                                  className={cn(
                                                    'inline-flex items-center gap-1 text-[10px] tabular-nums',
                                                    clipDurations[avatarId] <= 59 ? 'text-emerald-600' : 'text-amber-600'
                                                  )}
                                                  title={clipDurations[avatarId] <= 59 ? 'Fits under 59s' : 'Over 59s — pick a speed to shorten'}
                                                >
                                                  <Clock className="h-2.5 w-2.5" /> {formatClipDuration(clipDurations[avatarId])}
                                                </span>
                                              )}
                                              {/* Pre-push playback speed (ClickUp 86carazce) — "Change speed"
                                                  opens a preview-then-apply modal. Only while the video is
                                                  finished and not yet pushed. */}
                                              {finalVideoUrl && avatarStatus === 'completed' && !avatarPushed && (
                                                <button
                                                  type="button"
                                                  disabled={isAdjustingSpeed || isRegenerating || pipelineLocked}
                                                  onClick={() => setSpeedModal({ generationId: group.generation_id, avatarId, records })}
                                                  title="Preview speeds and apply one before pushing"
                                                  className={cn(
                                                    'h-6 px-2 self-start flex items-center gap-1 text-[10px] font-bold rounded-full border shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                                                    currentSpeedLabel !== 'Normal'
                                                      // A non-Normal speed is applied → solid violet so it's unmistakable.
                                                      ? 'bg-violet-600 border-violet-600 text-white hover:bg-violet-700'
                                                      : 'bg-violet-500/15 border-violet-500/50 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25'
                                                  )}
                                                >
                                                  {isAdjustingSpeed ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />}
                                                  <span className="truncate">
                                                    {isAdjustingSpeed ? 'Processing…' : currentSpeedLabel !== 'Normal' ? `Speed ${currentSpeedLabel}` : 'Change speed'}
                                                  </span>
                                                </button>
                                              )}
                                              <ProgressLine
                                                pct={avatarProgress.pct}
                                                stage={avatarProgress.stage}
                                                etaMs={avatarProgress.etaMs}
                                                totalMs={avatarTotalMs}
                                                elapsedMs={avatarProgress.elapsedMs}
                                              />
                                              {avatarPush.stage !== 'idle' && (
                                                <ProgressLine
                                                  pct={avatarPush.pct}
                                                  stage={avatarPush.stage}
                                                  etaMs={avatarPush.etaMs}
                                                  totalMs={avatarPush.totalMs}
                                                  elapsedMs={avatarPush.elapsedMs}
                                                />
                                              )}
                                              {captionPos && (
                                                <span className="text-[10px] text-muted-foreground capitalize">{captionPos}</span>
                                              )}
                                              <div className="flex items-center gap-1 pt-0.5">
                                                {finalVideoUrl && (
                                                  <a
                                                    href={finalVideoUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-500/20 transition-colors"
                                                    title="Open in Drive"
                                                  >
                                                    Open in Drive
                                                  </a>
                                                )}
                                                <div className="ml-auto flex items-center gap-1">
                                                  <button
                                                    type="button"
                                                    disabled={isRegenerating || pipelineLocked}
                                                    onClick={() => handleRegenerateAvatar(group.generation_id, records)}
                                                    title={pipelineLocked ? 'Cannot regenerate after pipeline push' : 'Regenerate video'}
                                                    className="rounded p-1.5 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                    <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', isRegenerating && 'animate-spin')} />
                                                  </button>
                                                  {downloadUrl && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleDownload(downloadUrl)}
                                                      className="rounded p-1.5 hover:bg-accent transition-colors"
                                                      title="Download video"
                                                    >
                                                      <Download className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => setExpandedAvatarKey(prev => prev === regenKey ? null : regenKey)}
                                                className="text-[10px] text-muted-foreground hover:text-foreground text-left transition-colors"
                                              >
                                                {isAvatarExpanded ? 'Hide scenes' : `Scenes (${records.length})`}
                                              </button>

                                              {/* Per-record scene details */}
                                              {isAvatarExpanded && (
                                                <div className="flex flex-col gap-1.5 border-t pt-1.5 mt-0.5">
                                                  {sortedRecords.map(rec => {
                                                    // fal clips have no scene row — show their reference images
                                                    // instead (the P1+P2 clip carries two: Scene 1 + Scene 2).
                                                    const isFal = rec.provider === 'fal';
                                                    const thumbUrls = isFal
                                                      ? (rec.fal_reference_image_url ?? [])
                                                      : (rec.scenes?.image_url ? [rec.scenes.image_url] : []);
                                                    return (
                                                    <div key={rec.id} className="flex flex-col gap-1 rounded bg-muted/40 p-1.5">
                                                      <div className="flex items-center gap-1">
                                                        <span className={cn(
                                                          'rounded px-1 py-0.5 text-[9px] font-medium',
                                                          rec.scenes?.is_product ? 'bg-blue-500/10 text-blue-600' : 'bg-orange-500/10 text-orange-600'
                                                        )}>
                                                          {rec.scenes?.is_product ? 'With Product' : 'No Product'}
                                                        </span>
                                                        {rec.generated_video_url && (
                                                          <a
                                                            href={rec.generated_video_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="ml-auto flex items-center gap-0.5 text-[9px] text-primary hover:underline"
                                                          >
                                                            <ExternalLink className="h-2.5 w-2.5" /> View
                                                          </a>
                                                        )}
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                        {thumbUrls.length > 0 ? (
                                                          thumbUrls.map((url, i) => (
                                                            <img
                                                              key={i}
                                                              src={url}
                                                              alt={rec.scenes?.name ?? `Reference ${i + 1}`}
                                                              className="h-6 w-6 rounded object-cover shrink-0 cursor-pointer"
                                                              onClick={() => setModalImageUrl(url)}
                                                              title="Click to preview"
                                                            />
                                                          ))
                                                        ) : (
                                                          <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                                                            <Video className="h-3 w-3 text-muted-foreground" />
                                                          </div>
                                                        )}
                                                        <span className="text-[10px] truncate" title={rec.scenes?.name ?? rec.concept ?? ''}>{rec.scenes?.name ?? rec.concept ?? '—'}</span>
                                                      </div>
                                                      <div className="flex items-start gap-1">
                                                        <p className="text-[10px] text-muted-foreground line-clamp-2 flex-1">{rec.script}</p>
                                                        <button
                                                          type="button"
                                                          onClick={() => { navigator.clipboard.writeText(rec.script); toast.success('Script copied!'); }}
                                                          className="shrink-0 rounded p-0.5 hover:bg-accent"
                                                          title="Copy script"
                                                        >
                                                          <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                                                        </button>
                                                      </div>
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
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {filteredLogs.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground shrink-0 pb-2">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-7 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(n => (
                      <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>
                  Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length}
                </span>
              </div>
              {totalPages > 1 && (
                <Pagination className="w-auto mx-0">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                    {getPageRange(currentPage, totalPages).map((p, i) =>
                      p === '...' ? (
                        <PaginationItem key={`ellipsis-${i}`}><PaginationEllipsis /></PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            href="#"
                            isActive={p === currentPage}
                            onClick={(e) => { e.preventDefault(); setCurrentPage(p as number); }}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!modalImageUrl} onOpenChange={(open) => { if (!open) setModalImageUrl(null); }}>
        <DialogContent className="max-w-lg p-3">
          {modalImageUrl && (
            <img
              src={modalImageUrl}
              alt="Preview"
              className="w-full max-h-[80vh] rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {speedModal && (
        <SpeedPreviewModal
          open={!!speedModal}
          onClose={() => setSpeedModal(null)}
          records={speedModal.records}
          busy={!!adjustingAvatars[`${speedModal.generationId}_${speedModal.avatarId}`]}
          onApply={async (label) => {
            await handleAdjustSpeed(speedModal.generationId, speedModal.records, label);
            setSpeedModal(null);
          }}
        />
      )}
    </DashboardLayout>
  );
}
