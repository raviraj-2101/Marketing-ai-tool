/**
 * ugcSettingsSnapshot.ts — builds the settings snapshot written at generation time so the
 * Generate Video Ads page can later be reopened pre-filled ("Edit & Regenerate", 86caug6v1).
 *
 * WHY THIS EXISTS
 * Most of the form does not survive generation. Of the 53 settings on the page, 26 reach no
 * database row at all — most damagingly the avatar-picking choices: from video_generation_logs
 * you cannot tell whether the user hand-picked N avatars or the tool rolled them at random,
 * so a form rebuilt from those rows would behave differently on re-submit. Unique Intro is
 * worse still: submit() joins advanceScripts[0] and [1] with a bare space into one row, which
 * cannot be split back apart. The only correct moment to capture the settings is BEFORE the
 * render fan-out, from live component state — which is what this module serializes.
 *
 * WHY IT SERIALIZES THE AD WHOLESALE RATHER THAN FIELD BY FIELD
 * This repo's build does not typecheck (`vite build` with SWC strips types without checking),
 * so a hand-enumerated projection rots silently: that is exactly how `subAngleDetail` came to
 * be read at submit off a type that never declared it, persisting null for months. Copying the
 * ad object verbatim means a field added to AdState tomorrow is captured for free, and no
 * field can be quietly forgotten.
 *
 * Pure and side-effect free by design, so it can be unit-tested without React or the network.
 */

/** Bump when the snapshot shape changes incompatibly, so the restore path can refuse or
 *  migrate an old snapshot instead of silently mis-hydrating the form. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/** Batch-level settings — shared by every ad in one submit. */
export type SnapshotPage = {
  /** Raw opaque product id from /api/ugc/products. Stored alongside product_name because a
   *  reverse name→id lookup is ambiguous once a product is renamed. */
  product: string;
  product_name: string;
  brand: string;
  funnel: string;
  intended_platform: string;
  cs: string;
};

export type SnapshotProvenance = {
  /** Source script chat, when this batch came through the chat handoff. */
  chat_id: string | null;
  /** The generation_id this batch was regenerated FROM. Null for an original batch. */
  source_generation_id: string | null;
};

export type SettingsSnapshot = {
  schema_version: number;
  captured_at: string;
  page: SnapshotPage;
  provenance: SnapshotProvenance;
  /** Exactly one entry: this ad's state, verbatim, minus local-only keys. An array (rather
   *  than a bare object) so a future "whole batch in one row" variant stays shape-compatible. */
  ads: Array<Record<string, unknown>>;
  /** True when at least one gripExampleImages entry was dropped for being an inline data-URI.
   *  The restore path uses this to tell the user to re-attach them. */
  grip_examples_truncated?: boolean;
};

/** Local-only keys that must never be restored. `uid` is a React list key — reusing a stale
 *  one across a restore would collide with a freshly-created ad's key. */
const LOCAL_ONLY_KEYS = ["uid"] as const;

/**
 * Deep-copy the ad, detaching it completely from live component state.
 *
 * A shallow `{ ...ad }` leaves nested objects (staticBar, manualAvatarIds, moduleTexts,
 * pipelineImages, …) ALIASED to the caller's state, so anything mutating those after capture
 * would silently rewrite an already-"captured" snapshot — the exact class of bug this module
 * exists to prevent. The current caller stringifies immediately and would be unharmed, but a
 * guarantee that depends on caller timing is not a guarantee.
 *
 * Cloning through JSON rather than structuredClone is deliberate: the snapshot is persisted
 * as jsonb, so a JSON round-trip yields precisely what will be stored (dropping `undefined`
 * exactly as the wire does) instead of an in-memory object that is subtly richer than the
 * saved one. Non-serializable input throws, which the caller already treats as a non-fatal
 * snapshot failure.
 */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isDataUri(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

/**
 * Strip inline upload data-URIs from gripExampleImages.
 *
 * gripExampleImages may hold either stored product_reference_images URLs or raw upload
 * data-URIs. A handful of the latter can run to megabytes, which would blow the snapshot past
 * the server's 256KB ceiling and fail the write — costing the user the whole Edit & Regenerate
 * button to preserve images the restore cannot meaningfully re-upload anyway. Stored URLs are
 * kept; data-URIs are dropped and flagged.
 */
function stripDataUris(ad: Record<string, unknown>): { ad: Record<string, unknown>; truncated: boolean } {
  const grips = ad.gripExampleImages;
  if (!Array.isArray(grips)) return { ad, truncated: false };

  const kept = grips.filter((g) => !isDataUri(g));
  if (kept.length === grips.length) return { ad, truncated: false };

  return { ad: { ...ad, gripExampleImages: kept }, truncated: true };
}

/**
 * Build the snapshot for ONE ad.
 *
 * `ad` is deliberately typed loosely rather than as BatchCreator's AdState: this module must
 * keep working when AdState gains fields, which is the entire point of copying it wholesale.
 */
export function buildSettingsSnapshot(input: {
  ad: Record<string, unknown>;
  page: SnapshotPage;
  chatId?: string | null;
  sourceGenerationId?: string | null;
  /** Injectable so tests are deterministic. */
  capturedAt?: string;
}): SettingsSnapshot {
  const { ad, page, chatId = null, sourceGenerationId = null, capturedAt } = input;

  const copy: Record<string, unknown> = deepCopy(ad);
  for (const key of LOCAL_ONLY_KEYS) delete copy[key];

  const { ad: cleaned, truncated } = stripDataUris(copy);

  const snapshot: SettingsSnapshot = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    // `||` not `??`, matching chatId/sourceGenerationId below: an empty string is treated as
    // "not supplied" rather than persisted as a blank timestamp.
    captured_at: capturedAt || new Date().toISOString(),
    page: { ...page },
    provenance: {
      chat_id: chatId || null,
      source_generation_id: sourceGenerationId || null,
    },
    ads: [cleaned],
  };

  // Only present when something was actually dropped — keeps the common snapshot clean.
  if (truncated) snapshot.grip_examples_truncated = true;

  return snapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * sessionStorage key the Video Build Log writes and BatchCreator reads, deliberately a
 * SIBLING of the existing chat handoff key ("ugc.create.payload") rather than a reuse of it:
 * the two carry different shapes and the chat one is parsed by content-sniffing.
 * Exported so the writer and the reader cannot drift apart.
 */
export const RESTORE_SESSION_KEY = "ugc.create.restore";

/**
 * What the Video Build Log puts in sessionStorage. `snapshots` holds one entry per ad —
 * a single element for "Reopen this ad", N for "Reopen whole batch".
 */
export type RestorePayload = {
  snapshots: unknown[];
  /** The generation_id being regenerated FROM, recorded as lineage on the new batch. */
  source_generation_id: string;
};

export type HydratedSnapshot = {
  page: SnapshotPage;
  /** One entry per ad, each already merged over a fresh-ad default. */
  ads: Array<Record<string, unknown>>;
  chatId: string | null;
  sourceGenerationId: string | null;
  gripExamplesTruncated: boolean;
};

/**
 * Each branch declares the OTHER branch's field as optional-undefined. That is not
 * decoration: this repo compiles with `strict: false`, where a bare `if (!result.ok)` does
 * not reliably narrow a discriminated union, and callers would be left unable to read
 * `.reason` without a cast. Spelling both fields out makes the narrowing work regardless of
 * compiler flags.
 */
export type HydrateResult =
  | { ok: true; value: HydratedSnapshot; reason?: undefined }
  | { ok: false; value?: undefined; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Merge one snapshotted ad over a fresh-ad default.
 *
 * Only keys the CURRENT AdState knows about are taken from the snapshot:
 *   - a field added to AdState since the snapshot was captured is missing from it, so it
 *     lands on today's default rather than `undefined`;
 *   - a field since REMOVED or renamed is present in the snapshot but absent from the
 *     defaults, so it is dropped instead of resurrecting a shape the form can no longer
 *     consume.
 * `uid` is never present in a snapshot (it is stripped at capture), so the fresh default's
 * uid always wins — which is what forces AdCard to remount and, usefully, stops its
 * mode-change effect from wiping the restored avatar picks.
 */
function hydrateAd<TAd extends Record<string, unknown>>(rawAd: unknown, defaults: TAd): TAd {
  if (!isRecord(rawAd)) return defaults;
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key === "uid") continue;
    if (key in rawAd) out[key] = rawAd[key];
  }
  return out as TAd;
}

/**
 * Parse and hydrate a stored snapshot into ads ready to hand to setAds().
 *
 * Returns a discriminated result rather than throwing, because every failure here is a
 * normal thing that can happen to stored data — the caller's job is to tell the user the
 * settings could not be reopened, not to crash the page.
 *
 * `makeDefaultAd` is injected rather than imported so this module stays free of any
 * dependency on the page component (and stays trivially unit-testable).
 */
export function hydrateSnapshot<TAd extends Record<string, unknown>>(
  raw: unknown,
  makeDefaultAd: () => TAd,
): HydrateResult {
  if (!isRecord(raw)) return { ok: false, reason: "Snapshot is not an object" };

  const version = raw.schema_version;
  if (typeof version !== "number" || !Number.isFinite(version)) {
    return { ok: false, reason: "Snapshot has no schema_version" };
  }
  // A snapshot written by a NEWER build may contain fields this build cannot interpret.
  // Refuse rather than silently restore a partial form — a form that looks complete but
  // isn't is the failure mode this whole feature exists to avoid.
  if (version > SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Snapshot was saved by a newer version (v${version} > v${SNAPSHOT_SCHEMA_VERSION})`,
    };
  }

  if (!isRecord(raw.page)) return { ok: false, reason: "Snapshot has no page settings" };
  if (!Array.isArray(raw.ads) || raw.ads.length === 0) {
    return { ok: false, reason: "Snapshot contains no ads" };
  }

  const p = raw.page as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const provenance = isRecord(raw.provenance) ? raw.provenance : {};

  return {
    ok: true,
    value: {
      page: {
        product: str(p.product),
        product_name: str(p.product_name),
        brand: str(p.brand),
        funnel: str(p.funnel),
        intended_platform: str(p.intended_platform),
        cs: str(p.cs),
      },
      ads: raw.ads.map((a) => hydrateAd(a, makeDefaultAd())),
      chatId: str(provenance.chat_id) || null,
      sourceGenerationId: str(provenance.source_generation_id) || null,
      gripExamplesTruncated: raw.grip_examples_truncated === true,
    },
  };
}

/**
 * Hydrate the whole sessionStorage restore payload — one snapshot for "Reopen this ad",
 * several for "Reopen whole batch".
 *
 * Batch-level settings (product / funnel / platform / cs) come from the FIRST snapshot: every
 * ad in a batch was submitted from one form, so they necessarily agree. The ads are then
 * concatenated in payload order.
 *
 * `sourceGenerationId` on the RESULT is the ad being regenerated from (supplied by the log
 * page), NOT the `provenance.source_generation_id` stored inside the snapshot — that one
 * records what the ORIGINAL batch was itself regenerated from, i.e. a generation further
 * back. Conflating the two would corrupt the lineage chain.
 */
export function hydrateRestorePayload<TAd extends Record<string, unknown>>(
  raw: unknown,
  makeDefaultAd: () => TAd,
): HydrateResult {
  if (!isRecord(raw)) return { ok: false, reason: "Restore payload is not an object" };
  if (!Array.isArray(raw.snapshots) || raw.snapshots.length === 0) {
    return { ok: false, reason: "Restore payload contains no snapshots" };
  }

  const hydrated: HydratedSnapshot[] = [];
  for (const snap of raw.snapshots) {
    const one = hydrateSnapshot(snap, makeDefaultAd);
    if (!one.ok) return one;
    hydrated.push(one.value);
  }

  const first = hydrated[0];
  return {
    ok: true,
    value: {
      page: first.page,
      ads: hydrated.flatMap((h) => h.ads),
      chatId: first.chatId,
      sourceGenerationId:
        typeof raw.source_generation_id === "string" && raw.source_generation_id
          ? raw.source_generation_id
          : null,
      gripExamplesTruncated: hydrated.some((h) => h.gripExamplesTruncated),
    },
  };
}
