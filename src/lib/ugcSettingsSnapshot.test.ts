import { describe, it, expect } from "vitest";
import {
  SNAPSHOT_SCHEMA_VERSION,
  RESTORE_SESSION_KEY,
  buildSettingsSnapshot,
  hydrateSnapshot,
  hydrateRestorePayload,
  type SnapshotPage,
  type HydrateResult,
  type HydratedSnapshot,
} from "./ugcSettingsSnapshot";

// A faithful full "Unique Intro" (Format-02) ad — the format that restores worst, because
// submit() joins advanceScripts[0] and [1] with a bare space into one un-splittable row and
// the avatar picks never reach a column at all. Mirrors AdState in src/pages/BatchCreator.tsx.
function uniqueIntroAd(): Record<string, unknown> {
  return {
    uid: "ad-local-key-7",
    concept: "Nurse explains the neck cause",
    mode: "combination",
    modeLocked: true,
    allowUnlimitedLength: false,
    isUniqueIntro: true,
    formatLabel: "Unique Intro · A1 Label/Cause",
    advanceScripts: [
      "Script one: the label nobody reads.",
      "Script two: the cause nobody names.",
      "Script three: the fix nobody sells.",
    ],
    withProductText: "P2 with-product body copy.",
    withoutProductText: "P1 without-product body copy.",
    lengthTarget: "60s",
    m1Text: "",
    m2Text: "",
    moduleTexts: ["MODULE A", "MODULE B", "MODULE C"],
    allowedAvatarTypes: ["doctor", "natural_wellness"],
    avatarsCount: 3,
    randomAvatars: false,
    manualAvatarIds: ["av_101", "av_202", "av_303"],
    randomAvatarIds: [],
    avatarSpeeds: { av_101: 1.1, av_202: 0.95, av_303: 1 },
    selectedLooks: { av_101: "look-uid-a", av_202: "look-uid-b" },
    advanceScenes: {
      av_101: ["scene_1", "scene_2", "scene_3"],
      av_202: ["scene_4", "", ""],
    },
    pipelineScenes: {
      p1: { scenery: "clinic hallway", scene: "nurse turns to camera" },
      p2: { scenery: "kitchen counter", scene: "holds the bottle" },
      p3: { scenery: "bathroom mirror", scene: "points at neck" },
      p4: { scenery: "living room sofa" },
      p5: { scenery: "close-up hands" },
    },
    productImageUrl: "https://cdn.example.com/product/hero.png",
    pipelineImages: {
      av_101: { p1: "drive-file-1", p2: "drive-file-2", p5: "drive-file-5" },
    },
    imageModel: "gpt",
    gripExampleImages: [
      "https://cdn.example.com/refs/grip-1.jpg",
      "https://cdn.example.com/refs/grip-2.jpg",
    ],
    persona: "women-45-plus",
    subAngle: "label-cause",
    subAngleDetail: "the-neck-cause",
    mainPains: ["swelling", "fatigue"],
    variationNumber: 4,
    source: "chat",
    staticBar: {
      enabled: true,
      text: "THE NECK CAUSE",
      bgColor: "#0f172a",
      textColor: "#ffffff",
      durationSec: 3,
      captionPlacement: "bottom",
      staticBarPlacement: "top",
    },
    isAnimatedChars: false,
    animatedMeta: undefined,
    animatedChars: undefined,
  };
}

const PAGE: SnapshotPage = {
  product: "prod_abc123",
  product_name: "BlueForce Drops",
  brand: "BlueForce",
  funnel: "vsl",
  intended_platform: "meta",
  cs: "Agentic",
};

const AT = "2026-07-21T09:30:00.000Z";

/** Convenience: build with the deterministic timestamp and read back the single ad. */
function snapshotOf(ad: Record<string, unknown>, page: SnapshotPage = PAGE) {
  return buildSettingsSnapshot({ ad, page, capturedAt: AT });
}

describe("buildSettingsSnapshot — wholesale copying (the core contract)", () => {
  it("carries a field the module has never heard of straight into the snapshot", () => {
    // THE most important property: the build does not typecheck, so a hand-enumerated
    // projection would silently drop any field added to AdState later. Copying verbatim
    // means tomorrow's field is captured for free.
    const ad = {
      ...uniqueIntroAd(),
      aFieldInventedTomorrow: { deeply: { nested: ["value", 42] } },
      anotherUnknownScalar: "keep me",
    };

    const snap = snapshotOf(ad);

    expect(snap.ads[0].aFieldInventedTomorrow).toEqual({ deeply: { nested: ["value", 42] } });
    expect(snap.ads[0].anotherUnknownScalar).toBe("keep me");
  });

  it("copies every key of the ad that has a defined value, except the local-only ones", () => {
    const ad = uniqueIntroAd();
    const expectedKeys = Object.keys(ad)
      .filter((k) => k !== "uid" && ad[k] !== undefined)
      .sort();

    expect(Object.keys(snapshotOf(ad).ads[0]).sort()).toEqual(expectedKeys);
  });

  it("drops keys whose value is undefined, matching what actually gets persisted", () => {
    // The snapshot is deep-copied through JSON, which omits undefined-valued keys — exactly
    // as JSON.stringify already does when the snapshot is POSTed and stored as jsonb. So an
    // absent key here is not a loss: it was never going to reach the database either way,
    // and the restore path merges the snapshot OVER makeFreshAd() defaults, which means a
    // missing optional field lands on today's default rather than on undefined.
    const ad = uniqueIntroAd();
    expect("animatedChars" in ad).toBe(true);
    expect(ad.animatedChars).toBeUndefined();

    const snap = snapshotOf(ad);

    expect("animatedChars" in snap.ads[0]).toBe(false);
    // A key explicitly set to null is NOT undefined, so it must survive.
    expect("pipelineScenes" in snap.ads[0]).toBe(ad.pipelineScenes !== undefined);
  });

  it("puts exactly one ad in the ads array", () => {
    const snap = snapshotOf(uniqueIntroAd());
    expect(Array.isArray(snap.ads)).toBe(true);
    expect(snap.ads).toHaveLength(1);
  });

  it("preserves an empty ad object rather than inventing defaults", () => {
    const snap = snapshotOf({});
    expect(snap.ads[0]).toEqual({});
  });
});

describe("buildSettingsSnapshot — uid stripping", () => {
  it("omits uid, which is a React list key and would collide on restore", () => {
    const snap = snapshotOf(uniqueIntroAd());
    expect("uid" in snap.ads[0]).toBe(false);
    expect(snap.ads[0].uid).toBeUndefined();
  });

  it("does not mutate the caller's ad object while stripping uid", () => {
    // The caller passes live React state — mutating it in place would be a nasty bug.
    const ad = uniqueIntroAd();
    buildSettingsSnapshot({ ad, page: PAGE, capturedAt: AT });

    expect("uid" in ad).toBe(true);
    expect(ad.uid).toBe("ad-local-key-7");
  });

  it("keeps a falsy uid stripped rather than copying an empty string through", () => {
    const snap = snapshotOf({ ...uniqueIntroAd(), uid: "" });
    expect("uid" in snap.ads[0]).toBe(false);
  });

  it("handles an ad that has no uid at all without adding one", () => {
    const { uid: _uid, ...noUid } = uniqueIntroAd();
    const snap = snapshotOf(noUid);
    expect("uid" in snap.ads[0]).toBe(false);
  });
});

describe("buildSettingsSnapshot — gripExampleImages data-URI stripping", () => {
  it("drops every entry when they are all inline data-URIs and flags the truncation", () => {
    const snap = snapshotOf({
      ...uniqueIntroAd(),
      gripExampleImages: ["data:image/png;base64,AAAA", "data:image/jpeg;base64,BBBB"],
    });

    expect(snap.ads[0].gripExampleImages).toEqual([]);
    expect(snap.grip_examples_truncated).toBe(true);
  });

  it("keeps stored https URLs and drops only the data-URIs in a mixed list", () => {
    const snap = snapshotOf({
      ...uniqueIntroAd(),
      gripExampleImages: [
        "https://cdn.example.com/refs/grip-1.jpg",
        "data:image/png;base64,AAAA",
        "https://cdn.example.com/refs/grip-2.jpg",
      ],
    });

    expect(snap.ads[0].gripExampleImages).toEqual([
      "https://cdn.example.com/refs/grip-1.jpg",
      "https://cdn.example.com/refs/grip-2.jpg",
    ]);
    expect(snap.grip_examples_truncated).toBe(true);
  });

  it("preserves order of the kept URLs", () => {
    const snap = snapshotOf({
      ...uniqueIntroAd(),
      gripExampleImages: ["https://a/1.jpg", "data:image/png;base64,X", "https://a/2.jpg", "https://a/3.jpg"],
    });

    expect(snap.ads[0].gripExampleImages).toEqual([
      "https://a/1.jpg",
      "https://a/2.jpg",
      "https://a/3.jpg",
    ]);
  });

  it("omits the grip_examples_truncated key entirely when nothing was dropped", () => {
    const snap = snapshotOf(uniqueIntroAd());

    expect(snap.ads[0].gripExampleImages).toEqual([
      "https://cdn.example.com/refs/grip-1.jpg",
      "https://cdn.example.com/refs/grip-2.jpg",
    ]);
    expect("grip_examples_truncated" in snap).toBe(false);
  });

  it("omits the flag when gripExampleImages is absent (gemini runs / older drafts)", () => {
    const { gripExampleImages: _g, ...noGrips } = uniqueIntroAd();
    const snap = snapshotOf(noGrips);

    expect("gripExampleImages" in snap.ads[0]).toBe(false);
    expect("grip_examples_truncated" in snap).toBe(false);
  });

  it("leaves an empty gripExampleImages array untouched and unflagged", () => {
    const snap = snapshotOf({ ...uniqueIntroAd(), gripExampleImages: [] });

    expect(snap.ads[0].gripExampleImages).toEqual([]);
    expect("grip_examples_truncated" in snap).toBe(false);
  });

  it("passes gripExampleImages through unchanged when it is not an array", () => {
    const snapNull = snapshotOf({ ...uniqueIntroAd(), gripExampleImages: null });
    expect(snapNull.ads[0].gripExampleImages).toBeNull();
    expect("grip_examples_truncated" in snapNull).toBe(false);

    // A bare string is not filtered even though it IS a data-URI — stripping only
    // applies to arrays. Documented so a future change to the field's type is noticed.
    const snapString = snapshotOf({ ...uniqueIntroAd(), gripExampleImages: "data:image/png;base64,AAAA" });
    expect(snapString.ads[0].gripExampleImages).toBe("data:image/png;base64,AAAA");
    expect("grip_examples_truncated" in snapString).toBe(false);
  });

  it("only treats a leading data: as inline — URLs merely containing 'data:' are kept", () => {
    const snap = snapshotOf({
      ...uniqueIntroAd(),
      gripExampleImages: ["https://cdn.example.com/x?src=data:image/png", "DATA:image/png;base64,AAAA"],
    });

    expect(snap.ads[0].gripExampleImages).toEqual([
      "https://cdn.example.com/x?src=data:image/png",
      "DATA:image/png;base64,AAAA",
    ]);
    expect("grip_examples_truncated" in snap).toBe(false);
  });

  it("does not mutate the caller's gripExampleImages array when stripping", () => {
    const ad = uniqueIntroAd();
    ad.gripExampleImages = ["https://cdn.example.com/refs/grip-1.jpg", "data:image/png;base64,AAAA"];
    const original = ad.gripExampleImages as string[];

    buildSettingsSnapshot({ ad, page: PAGE, capturedAt: AT });

    expect(original).toEqual([
      "https://cdn.example.com/refs/grip-1.jpg",
      "data:image/png;base64,AAAA",
    ]);
  });
});

describe("buildSettingsSnapshot — the fields that are provably lost today", () => {
  it("keeps randomAvatars:false alongside manualAvatarIds, which the DB cannot distinguish", () => {
    const snap = snapshotOf(uniqueIntroAd());

    expect(snap.ads[0].randomAvatars).toBe(false);
    expect(snap.ads[0].manualAvatarIds).toEqual(["av_101", "av_202", "av_303"]);
    expect(snap.ads[0].randomAvatarIds).toEqual([]);
  });

  it("keeps the random-roll case distinguishable from the hand-picked case", () => {
    const snap = snapshotOf({
      ...uniqueIntroAd(),
      randomAvatars: true,
      manualAvatarIds: [],
      randomAvatarIds: ["av_901", "av_902", "av_903"],
    });

    expect(snap.ads[0].randomAvatars).toBe(true);
    expect(snap.ads[0].manualAvatarIds).toEqual([]);
    expect(snap.ads[0].randomAvatarIds).toEqual(["av_901", "av_902", "av_903"]);
  });

  it("keeps advanceScripts as 3 separate slots (submit joins [0]+[1] irreversibly)", () => {
    const snap = snapshotOf(uniqueIntroAd());

    expect(snap.ads[0].advanceScripts).toEqual([
      "Script one: the label nobody reads.",
      "Script two: the cause nobody names.",
      "Script three: the fix nobody sells.",
    ]);
    expect((snap.ads[0].advanceScripts as string[]).length).toBe(3);
  });

  it("keeps an advanceScripts slot that itself contains spaces splittable-free", () => {
    // The lossy path is join(" "); the snapshot must not depend on spaces being separators.
    const snap = snapshotOf({
      ...uniqueIntroAd(),
      advanceScripts: ["one two three", "four five", ""],
    });

    expect(snap.ads[0].advanceScripts).toEqual(["one two three", "four five", ""]);
  });

  it("keeps subAngleDetail, which persists as null through the normal path", () => {
    expect(snapshotOf(uniqueIntroAd()).ads[0].subAngleDetail).toBe("the-neck-cause");
  });

  it("keeps staticBar colors and duration even when the bar is disabled", () => {
    // Today a disabled bar nulls everything, so re-enabling loses the user's styling.
    const ad = uniqueIntroAd();
    ad.staticBar = {
      enabled: false,
      text: "THE NECK CAUSE",
      bgColor: "#0f172a",
      textColor: "#ffffff",
      durationSec: 3,
      captionPlacement: "bottom",
      staticBarPlacement: "top",
    };

    expect(snapshotOf(ad).ads[0].staticBar).toEqual({
      enabled: false,
      text: "THE NECK CAUSE",
      bgColor: "#0f172a",
      textColor: "#ffffff",
      durationSec: 3,
      captionPlacement: "bottom",
      staticBarPlacement: "top",
    });
  });

  it("preserves moduleTexts order, which scene ordering depends on", () => {
    const snap = snapshotOf({
      ...uniqueIntroAd(),
      moduleTexts: ["first", "second", "third", "fourth"],
    });

    expect(snap.ads[0].moduleTexts).toEqual(["first", "second", "third", "fourth"]);
  });

  it("keeps the avatar-selection fields: types, count, looks and speeds", () => {
    const snap = snapshotOf(uniqueIntroAd());

    expect(snap.ads[0].allowedAvatarTypes).toEqual(["doctor", "natural_wellness"]);
    expect(snap.ads[0].avatarsCount).toBe(3);
    expect(snap.ads[0].selectedLooks).toEqual({ av_101: "look-uid-a", av_202: "look-uid-b" });
    expect(snap.ads[0].avatarSpeeds).toEqual({ av_101: 1.1, av_202: 0.95, av_303: 1 });
  });

  it("keeps the remaining Unique Intro payload (scenes, pipeline images, model)", () => {
    const ad = uniqueIntroAd();
    const snap = snapshotOf(ad);

    expect(snap.ads[0].advanceScenes).toEqual(ad.advanceScenes);
    expect(snap.ads[0].pipelineScenes).toEqual(ad.pipelineScenes);
    expect(snap.ads[0].pipelineImages).toEqual(ad.pipelineImages);
    expect(snap.ads[0].imageModel).toBe("gpt");
    expect(snap.ads[0].productImageUrl).toBe("https://cdn.example.com/product/hero.png");
    expect(snap.ads[0].isUniqueIntro).toBe(true);
    expect(snap.ads[0].formatLabel).toBe("Unique Intro · A1 Label/Cause");
  });
});

describe("buildSettingsSnapshot — provenance and determinism", () => {
  it("defaults chat_id and source_generation_id to null", () => {
    const snap = snapshotOf(uniqueIntroAd());

    expect(snap.provenance).toEqual({ chat_id: null, source_generation_id: null });
  });

  it("records the ids it is given", () => {
    const snap = buildSettingsSnapshot({
      ad: uniqueIntroAd(),
      page: PAGE,
      chatId: "chat_555",
      sourceGenerationId: "gen_777",
      capturedAt: AT,
    });

    expect(snap.provenance).toEqual({ chat_id: "chat_555", source_generation_id: "gen_777" });
  });

  it("coerces empty-string ids to null so restore never sees a bogus id", () => {
    const snap = buildSettingsSnapshot({
      ad: uniqueIntroAd(),
      page: PAGE,
      chatId: "",
      sourceGenerationId: "",
      capturedAt: AT,
    });

    expect(snap.provenance).toEqual({ chat_id: null, source_generation_id: null });
  });

  it("coerces explicitly-null ids to null", () => {
    const snap = buildSettingsSnapshot({
      ad: uniqueIntroAd(),
      page: PAGE,
      chatId: null,
      sourceGenerationId: null,
      capturedAt: AT,
    });

    expect(snap.provenance).toEqual({ chat_id: null, source_generation_id: null });
  });

  it("uses a supplied capturedAt verbatim", () => {
    expect(snapshotOf(uniqueIntroAd()).captured_at).toBe(AT);
  });

  it("falls back to an ISO timestamp of now when capturedAt is omitted", () => {
    const before = Date.now();
    const snap = buildSettingsSnapshot({ ad: uniqueIntroAd(), page: PAGE });
    const after = Date.now();

    expect(snap.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const t = Date.parse(snap.captured_at);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it("stamps schema_version from SNAPSHOT_SCHEMA_VERSION", () => {
    expect(snapshotOf(uniqueIntroAd()).schema_version).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(1);
  });

  it("is deterministic: same input and capturedAt produce an identical snapshot", () => {
    expect(snapshotOf(uniqueIntroAd())).toEqual(snapshotOf(uniqueIntroAd()));
  });
});

describe("buildSettingsSnapshot — page block", () => {
  it("copies every page field", () => {
    expect(snapshotOf(uniqueIntroAd()).page).toEqual(PAGE);
  });

  it("copies the page rather than referencing it, so later edits do not leak in", () => {
    const page = { ...PAGE };
    const snap = buildSettingsSnapshot({ ad: uniqueIntroAd(), page, capturedAt: AT });

    page.product_name = "MUTATED AFTER CAPTURE";
    page.brand = "MUTATED";

    expect(snap.page.product_name).toBe("BlueForce Drops");
    expect(snap.page.brand).toBe("BlueForce");
  });

  it("keeps the opaque product id alongside the name (name lookup is ambiguous)", () => {
    const snap = snapshotOf(uniqueIntroAd());
    expect(snap.page.product).toBe("prod_abc123");
    expect(snap.page.product_name).toBe("BlueForce Drops");
  });
});

describe("buildSettingsSnapshot — top-level ad aliasing", () => {
  it("does not see later top-level edits to the caller's ad object", () => {
    const ad = uniqueIntroAd();
    const snap = buildSettingsSnapshot({ ad, page: PAGE, capturedAt: AT });

    ad.concept = "MUTATED AFTER CAPTURE";
    ad.avatarsCount = 99;

    expect(snap.ads[0].concept).toBe("Nurse explains the neck cause");
    expect(snap.ads[0].avatarsCount).toBe(3);
  });

  it("deep-copies, so a NESTED mutation after capture cannot leak into the snapshot", () => {
    // The caller passes live React state. If the copy were shallow, ads[0].staticBar would
    // be the SAME object as the caller's, and an edit made after capture would silently
    // rewrite an already-captured snapshot — the exact class of bug this module prevents.
    const ad = uniqueIntroAd();
    const snap = buildSettingsSnapshot({ ad, page: PAGE, capturedAt: AT });

    (ad.staticBar as Record<string, unknown>).text = "MUTATED AFTER CAPTURE";
    (ad.manualAvatarIds as string[]).push("av_leaked");
    (ad.moduleTexts as string[]).push("leaked module");
    (ad.selectedLooks as Record<string, string>).av_leaked = "look_leaked";

    expect((snap.ads[0].staticBar as Record<string, unknown>).text).not.toBe("MUTATED AFTER CAPTURE");
    expect(snap.ads[0].manualAvatarIds).not.toContain("av_leaked");
    expect(snap.ads[0].moduleTexts).not.toContain("leaked module");
    expect(snap.ads[0].selectedLooks).not.toHaveProperty("av_leaked");
  });
});

describe("buildSettingsSnapshot — edge values that must round-trip", () => {
  it("preserves null, empty string, zero, false and NaN-free numbers distinctly", () => {
    const snap = snapshotOf({
      uid: "x",
      pipelineScenes: null,
      concept: "",
      avatarsCount: 0,
      randomAvatars: false,
      variationNumber: 0,
      negative: -1,
      fractional: 0.95,
    });

    expect(snap.ads[0].pipelineScenes).toBeNull();
    expect(snap.ads[0].concept).toBe("");
    expect(snap.ads[0].avatarsCount).toBe(0);
    expect(snap.ads[0].randomAvatars).toBe(false);
    expect(snap.ads[0].variationNumber).toBe(0);
    expect(snap.ads[0].negative).toBe(-1);
    expect(snap.ads[0].fractional).toBe(0.95);
  });

  it("distinguishes an explicit null from an absent key", () => {
    const snap = snapshotOf({ uid: "x", pipelineScenes: null });

    expect("pipelineScenes" in snap.ads[0]).toBe(true);
    expect(snap.ads[0].pipelineScenes).toBeNull();
    expect("imageModel" in snap.ads[0]).toBe(false);
  });

  it("preserves empty arrays and empty objects rather than dropping them", () => {
    const snap = snapshotOf({
      uid: "x",
      moduleTexts: [],
      allowedAvatarTypes: [],
      avatarSpeeds: {},
      selectedLooks: {},
    });

    expect(snap.ads[0].moduleTexts).toEqual([]);
    expect(snap.ads[0].allowedAvatarTypes).toEqual([]);
    expect(snap.ads[0].avatarSpeeds).toEqual({});
    expect(snap.ads[0].selectedLooks).toEqual({});
  });

  it("preserves unicode, emoji, newlines and quotes in script text", () => {
    const text = 'Über “curly” quotes — em-dash, emoji 💊, newline\nand a tab\there.';
    const snap = snapshotOf({ uid: "x", withoutProductText: text, formatLabel: "Unique Intro · A1" });

    expect(snap.ads[0].withoutProductText).toBe(text);
    expect(snap.ads[0].formatLabel).toBe("Unique Intro · A1");
  });

  it("preserves deeply nested structures intact", () => {
    const ad = uniqueIntroAd();
    const snap = snapshotOf(ad);

    expect(snap.ads[0].pipelineScenes).toEqual({
      p1: { scenery: "clinic hallway", scene: "nurse turns to camera" },
      p2: { scenery: "kitchen counter", scene: "holds the bottle" },
      p3: { scenery: "bathroom mirror", scene: "points at neck" },
      p4: { scenery: "living room sofa" },
      p5: { scenery: "close-up hands" },
    });
  });

  it("survives a JSON round-trip, which is how the snapshot actually reaches the server", () => {
    const snap = snapshotOf(uniqueIntroAd());
    const roundTripped = JSON.parse(JSON.stringify(snap));

    // undefined-valued optional keys are the only thing JSON drops; everything the
    // restore path reads must be identical.
    expect(roundTripped.ads[0].advanceScripts).toEqual(snap.ads[0].advanceScripts);
    expect(roundTripped.ads[0].staticBar).toEqual(snap.ads[0].staticBar);
    expect(roundTripped.ads[0].subAngleDetail).toBe("the-neck-cause");
    expect(roundTripped.provenance).toEqual(snap.provenance);
    expect(roundTripped.page).toEqual(snap.page);
    expect(roundTripped.schema_version).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(roundTripped.captured_at).toBe(AT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Restore
// ─────────────────────────────────────────────────────────────────────────────

/** Narrow an ok result, failing loudly (with the reason) when it is not ok. */
function expectOk(result: HydrateResult): HydratedSnapshot {
  if (!result.ok) throw new Error(`expected ok:true, got ok:false — "${result.reason}"`);
  return result.value;
}

/** Narrow a failure, asserting the reason is a non-empty human-readable string. */
function expectFail(result: HydrateResult): string {
  if (result.ok) {
    throw new Error(`expected ok:false, got ok:true — ${JSON.stringify(result.value)}`);
  }
  expect(typeof result.reason).toBe("string");
  expect(result.reason.length).toBeGreaterThan(0);
  return result.reason;
}

/**
 * The keys a snapshot of `ad` will actually carry: everything except `uid` (stripped at
 * capture) and except undefined-valued keys (dropped by the JSON deep-copy, exactly as the
 * wire drops them). This is the definition of "equal to the original" for round-trip purposes.
 */
function survivingKeys(ad: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(ad).filter(([k, v]) => k !== "uid" && v !== undefined),
  );
}

/** Any hydrated key still holding this never came from the snapshot. */
const SENTINEL = "__untouched_default__";

/**
 * A default-ad factory whose shape is exactly today's AdState *for this fixture*: it knows
 * every key the snapshot carries, so a faithful merge must overwrite all of them. Each call
 * returns a distinct uid, mirroring makeFreshAd()'s fresh React list key.
 */
function makeDefaultsFactoryFor(ad: Record<string, unknown>) {
  let n = 0;
  return () => {
    const out: Record<string, unknown> = { uid: `fresh-uid-${++n}` };
    for (const key of Object.keys(survivingKeys(ad))) out[key] = SENTINEL;
    return out;
  };
}

/** A minimal, purpose-made default factory for the version-drift tests. */
function makeTinyDefaults(overrides: Record<string, unknown> = {}) {
  let n = 0;
  return () => ({
    uid: `fresh-uid-${++n}`,
    concept: "default concept",
    avatarsCount: 2,
    randomAvatars: true,
    ...overrides,
  });
}

/** A well-formed snapshot object, tweakable per test. */
function validSnapshot(over: Record<string, unknown> = {}) {
  return { ...snapshotOf(uniqueIntroAd()), ...over };
}

describe("RESTORE_SESSION_KEY", () => {
  it("is the exact key the log page writes and BatchCreator reads", () => {
    expect(RESTORE_SESSION_KEY).toBe("ugc.create.restore");
  });

  it("is a SIBLING of the chat handoff key, never the same key", () => {
    // The two payloads have different shapes and the chat one is parsed by content-sniffing;
    // reusing one key would make a restore payload look like a chat payload.
    expect(RESTORE_SESSION_KEY).not.toBe("ugc.create.payload");
  });
});

describe("hydrateSnapshot — round-trip fidelity (the headline property)", () => {
  it("returns the original ad, minus uid and minus undefined-valued keys", () => {
    const original = uniqueIntroAd();
    const snap = buildSettingsSnapshot({ ad: original, page: PAGE, capturedAt: AT });

    const value = expectOk(hydrateSnapshot(snap, makeDefaultsFactoryFor(uniqueIntroAd())));

    expect(value.ads).toHaveLength(1);
    expect(value.ads[0]).toEqual({ ...survivingKeys(original), uid: "fresh-uid-1" });
  });

  it("round-trips through JSON, which is how the snapshot really travels to the server", () => {
    const original = uniqueIntroAd();
    const snap = buildSettingsSnapshot({ ad: original, page: PAGE, capturedAt: AT });
    const stored = JSON.parse(JSON.stringify(snap));

    const value = expectOk(hydrateSnapshot(stored, makeDefaultsFactoryFor(uniqueIntroAd())));

    expect(value.ads[0]).toEqual({ ...survivingKeys(original), uid: "fresh-uid-1" });
  });

  it("leaves no default value untouched — every snapshot key really was taken", () => {
    const snap = snapshotOf(uniqueIntroAd());
    const value = expectOk(hydrateSnapshot(snap, makeDefaultsFactoryFor(uniqueIntroAd())));

    expect(Object.values(value.ads[0])).not.toContain(SENTINEL);
  });

  it("restores the fields that the database provably cannot reconstruct", () => {
    // The whole reason this feature exists: hand-picked vs rolled avatars, and the three
    // Unique Intro script slots that submit() joins irreversibly.
    const snap = JSON.parse(JSON.stringify(snapshotOf(uniqueIntroAd())));
    const ad = expectOk(hydrateSnapshot(snap, makeDefaultsFactoryFor(uniqueIntroAd()))).ads[0];

    expect(ad.randomAvatars).toBe(false);
    expect(ad.manualAvatarIds).toEqual(["av_101", "av_202", "av_303"]);
    expect(ad.advanceScripts).toEqual([
      "Script one: the label nobody reads.",
      "Script two: the cause nobody names.",
      "Script three: the fix nobody sells.",
    ]);
    expect(ad.subAngleDetail).toBe("the-neck-cause");
    expect(ad.staticBar).toEqual({
      enabled: true,
      text: "THE NECK CAUSE",
      bgColor: "#0f172a",
      textColor: "#ffffff",
      durationSec: 3,
      captionPlacement: "bottom",
      staticBarPlacement: "top",
    });
  });

  it("restores the page block verbatim", () => {
    const value = expectOk(
      hydrateSnapshot(snapshotOf(uniqueIntroAd()), makeDefaultsFactoryFor(uniqueIntroAd())),
    );

    expect(value.page).toEqual(PAGE);
  });

  it("carries provenance through: chat_id and the snapshot's own source_generation_id", () => {
    const snap = buildSettingsSnapshot({
      ad: uniqueIntroAd(),
      page: PAGE,
      chatId: "chat_555",
      sourceGenerationId: "gen_777",
      capturedAt: AT,
    });

    const value = expectOk(hydrateSnapshot(snap, makeTinyDefaults()));

    expect(value.chatId).toBe("chat_555");
    expect(value.sourceGenerationId).toBe("gen_777");
  });

  it("maps null provenance ids to null rather than to an empty string", () => {
    const value = expectOk(hydrateSnapshot(snapshotOf(uniqueIntroAd()), makeTinyDefaults()));

    expect(value.chatId).toBeNull();
    expect(value.sourceGenerationId).toBeNull();
  });

  it("reports gripExamplesTruncated exactly as the capture flagged it", () => {
    const clean = expectOk(hydrateSnapshot(snapshotOf(uniqueIntroAd()), makeTinyDefaults()));
    expect(clean.gripExamplesTruncated).toBe(false);

    const truncated = expectOk(
      hydrateSnapshot(
        snapshotOf({ ...uniqueIntroAd(), gripExampleImages: ["data:image/png;base64,AAAA"] }),
        makeTinyDefaults(),
      ),
    );
    expect(truncated.gripExamplesTruncated).toBe(true);
  });

  it("treats a non-true grip_examples_truncated as false rather than truthy-coercing it", () => {
    const value = expectOk(
      hydrateSnapshot(validSnapshot({ grip_examples_truncated: "yes" }), makeTinyDefaults()),
    );

    expect(value.gripExamplesTruncated).toBe(false);
  });

  it("coerces non-string page fields to empty strings instead of leaking them into the form", () => {
    const value = expectOk(
      hydrateSnapshot(
        validSnapshot({ page: { product: 42, product_name: null, brand: "BlueForce" } }),
        makeTinyDefaults(),
      ),
    );

    expect(value.page).toEqual({
      product: "",
      product_name: "",
      brand: "BlueForce",
      funnel: "",
      intended_platform: "",
      cs: "",
    });
  });
});

describe("hydrateSnapshot — merging over defaults (the version-drift contract)", () => {
  it("uses TODAY's default for a key added to AdState since the snapshot was captured", () => {
    // `newFieldAddedLater` did not exist when this snapshot was written.
    const snap = validSnapshot({ ads: [{ concept: "captured concept" }] });
    const makeDefaultAd = makeTinyDefaults({ newFieldAddedLater: "todays default" });

    const ad = expectOk(hydrateSnapshot(snap, makeDefaultAd)).ads[0];

    expect(ad.newFieldAddedLater).toBe("todays default");
    expect(ad.newFieldAddedLater).not.toBeUndefined();
    expect("newFieldAddedLater" in ad).toBe(true);
  });

  it("never yields undefined for a default key missing from the snapshot", () => {
    const snap = validSnapshot({ ads: [{}] });
    const ad = expectOk(hydrateSnapshot(snap, makeTinyDefaults())).ads[0];

    expect(ad.concept).toBe("default concept");
    expect(ad.avatarsCount).toBe(2);
    expect(ad.randomAvatars).toBe(true);
    for (const [key, v] of Object.entries(ad)) {
      expect(v, `key ${key} hydrated to undefined`).not.toBeUndefined();
    }
  });

  it("DROPS a key present in the snapshot but absent from today's defaults", () => {
    // The field was removed or renamed since capture; resurrecting it would hand the form a
    // shape it can no longer consume.
    const snap = validSnapshot({
      ads: [{ concept: "kept", sinceRemovedField: "must not come back", oldTypoedFeild: 1 }],
    });

    const ad = expectOk(hydrateSnapshot(snap, makeTinyDefaults())).ads[0];

    expect("sinceRemovedField" in ad).toBe(false);
    expect("oldTypoedFeild" in ad).toBe(false);
    expect(ad.concept).toBe("kept");
    expect(Object.keys(ad).sort()).toEqual(
      ["avatarsCount", "concept", "randomAvatars", "uid"].sort(),
    );
  });

  it("takes a snapshot value even when it is falsy — 0, false, empty string and null", () => {
    // A naive `snapshot[key] || defaults[key]` merge would silently restore the DEFAULT here,
    // which for randomAvatars would flip a hand-picked batch back to random.
    const snap = validSnapshot({
      ads: [{ concept: "", avatarsCount: 0, randomAvatars: false, extraNull: null }],
    });
    const makeDefaultAd = makeTinyDefaults({ extraNull: "not null" });

    const ad = expectOk(hydrateSnapshot(snap, makeDefaultAd)).ads[0];

    expect(ad.concept).toBe("");
    expect(ad.avatarsCount).toBe(0);
    expect(ad.randomAvatars).toBe(false);
    expect(ad.extraNull).toBeNull();
  });

  it("takes an explicitly-undefined snapshot value over the default, since the key IS present", () => {
    // Only reachable pre-JSON (an in-memory snapshot); documented so the `key in rawAd`
    // membership test is not silently changed to a value test.
    const snap = validSnapshot({ ads: [{ concept: undefined }] });
    const ad = expectOk(hydrateSnapshot(snap, makeTinyDefaults())).ads[0];

    expect("concept" in ad).toBe(true);
    expect(ad.concept).toBeUndefined();
  });

  it("always uses the FRESH default's uid, never anything from the snapshot", () => {
    // A stale React list key would collide with a freshly-created ad's key, and reusing it
    // would stop AdCard remounting.
    const snap = validSnapshot({ ads: [{ uid: "stale-uid-from-snapshot", concept: "c" }] });

    const ad = expectOk(hydrateSnapshot(snap, makeTinyDefaults())).ads[0];

    expect(ad.uid).toBe("fresh-uid-1");
    expect(ad.uid).not.toBe("stale-uid-from-snapshot");
  });

  it("gives each hydrated ad its OWN fresh uid", () => {
    const snap = validSnapshot({ ads: [{ concept: "a" }, { concept: "b" }, { concept: "c" }] });

    const ads = expectOk(hydrateSnapshot(snap, makeTinyDefaults())).ads;

    expect(ads.map((a) => a.uid)).toEqual(["fresh-uid-1", "fresh-uid-2", "fresh-uid-3"]);
    expect(new Set(ads.map((a) => a.uid)).size).toBe(3);
  });

  it("falls back to a pristine default ad when the snapshot entry is not an object", () => {
    const snap = validSnapshot({ ads: [null, "nope", 7, ["a"]] });

    const ads = expectOk(hydrateSnapshot(snap, makeTinyDefaults())).ads;

    expect(ads).toHaveLength(4);
    for (const ad of ads) {
      expect(ad.concept).toBe("default concept");
      expect(ad.avatarsCount).toBe(2);
    }
  });

  it("does not mutate the default object it was handed", () => {
    const defaults = { uid: "fresh", concept: "default concept" };
    const snap = validSnapshot({ ads: [{ concept: "captured" }] });

    expectOk(hydrateSnapshot(snap, () => ({ ...defaults })));

    expect(defaults).toEqual({ uid: "fresh", concept: "default concept" });
  });

  it("does not mutate the raw snapshot it was handed", () => {
    const snap = validSnapshot({ ads: [{ concept: "captured" }] });
    const before = JSON.parse(JSON.stringify(snap));

    expectOk(hydrateSnapshot(snap, makeTinyDefaults()));

    expect(JSON.parse(JSON.stringify(snap))).toEqual(before);
  });
});

describe("hydrateSnapshot — schema version gating", () => {
  it("accepts a snapshot at the current version", () => {
    const value = expectOk(
      hydrateSnapshot(validSnapshot({ schema_version: SNAPSHOT_SCHEMA_VERSION }), makeTinyDefaults()),
    );
    expect(value.ads).toHaveLength(1);
  });

  it("accepts an OLDER snapshot — that is what merging over defaults is for", () => {
    expectOk(hydrateSnapshot(validSnapshot({ schema_version: 0 }), makeTinyDefaults()));
    expectOk(hydrateSnapshot(validSnapshot({ schema_version: -3 }), makeTinyDefaults()));
  });

  it("REFUSES a snapshot written by a newer build", () => {
    // A newer build may have written fields this one cannot interpret. A form that looks
    // complete but isn't is the exact failure this feature exists to prevent.
    const reason = expectFail(
      hydrateSnapshot(validSnapshot({ schema_version: SNAPSHOT_SCHEMA_VERSION + 1 }), makeTinyDefaults()),
    );

    expect(reason).toMatch(/newer version/i);
    expect(reason).toContain(`v${SNAPSHOT_SCHEMA_VERSION + 1}`);
    expect(reason).toContain(`v${SNAPSHOT_SCHEMA_VERSION}`);
  });

  it("refuses a far-future version too", () => {
    expectFail(hydrateSnapshot(validSnapshot({ schema_version: 999 }), makeTinyDefaults()));
    expectFail(hydrateSnapshot(validSnapshot({ schema_version: 1.5 }), makeTinyDefaults()));
  });

  it("refuses a missing schema_version", () => {
    const { schema_version: _v, ...noVersion } = validSnapshot();
    expect(expectFail(hydrateSnapshot(noVersion, makeTinyDefaults()))).toMatch(/schema_version/i);
  });

  it("refuses a non-numeric schema_version", () => {
    for (const version of ["1", null, true, {}, [], "v1"]) {
      expectFail(hydrateSnapshot(validSnapshot({ schema_version: version }), makeTinyDefaults()));
    }
  });

  it("refuses NaN and Infinity, which would slip past a bare `> VERSION` check", () => {
    // NaN > 1 is false and Infinity is not a real version — both must be rejected outright.
    expectFail(hydrateSnapshot(validSnapshot({ schema_version: NaN }), makeTinyDefaults()));
    expectFail(hydrateSnapshot(validSnapshot({ schema_version: Infinity }), makeTinyDefaults()));
    expectFail(hydrateSnapshot(validSnapshot({ schema_version: -Infinity }), makeTinyDefaults()));
  });
});

describe("hydrateSnapshot — malformed input never throws", () => {
  const malformed: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["a string", "not a snapshot"],
    ["an empty string", ""],
    ["a number", 42],
    ["a boolean", true],
    ["an array", [{ schema_version: 1 }]],
    ["an empty array", []],
    ["an empty object", {}],
    ["a JSON string of a valid snapshot (not parsed)", JSON.stringify({ schema_version: 1 })],
  ];

  for (const [label, input] of malformed) {
    it(`returns ok:false with a reason for ${label}, and does not throw`, () => {
      expect(() => hydrateSnapshot(input, makeTinyDefaults())).not.toThrow();
      expectFail(hydrateSnapshot(input, makeTinyDefaults()));
    });
  }

  it("refuses a snapshot with no page block", () => {
    const { page: _p, ...noPage } = validSnapshot();
    expect(expectFail(hydrateSnapshot(noPage, makeTinyDefaults()))).toMatch(/page/i);
  });

  it("refuses a page that is not an object", () => {
    for (const page of [null, "prod_abc123", 7, ["prod_abc123"]]) {
      expectFail(hydrateSnapshot(validSnapshot({ page }), makeTinyDefaults()));
    }
  });

  it("refuses an empty ads array", () => {
    expect(expectFail(hydrateSnapshot(validSnapshot({ ads: [] }), makeTinyDefaults()))).toMatch(
      /no ads/i,
    );
  });

  it("refuses ads that is not an array", () => {
    for (const ads of [null, undefined, {}, "ad", 3, { 0: { concept: "c" } }]) {
      expectFail(hydrateSnapshot(validSnapshot({ ads }), makeTinyDefaults()));
    }
  });

  it("refuses a snapshot with no ads key at all", () => {
    const { ads: _a, ...noAds } = validSnapshot();
    expectFail(hydrateSnapshot(noAds, makeTinyDefaults()));
  });

  it("never throws for any malformed shape, including a deliberately hostile one", () => {
    const hostile: unknown[] = [
      { schema_version: 1, page: {}, ads: [{ toString: null }] },
      { schema_version: 1, page: { product: Symbol("s") }, ads: [{}] },
      { schema_version: 1, page: {}, ads: [{}], provenance: "nope" },
      { schema_version: 1, page: {}, ads: new Array(3) },
      Object.create(null),
    ];

    for (const input of hostile) {
      expect(() => hydrateSnapshot(input, makeTinyDefaults()), JSON.stringify(input)).not.toThrow();
    }
  });

  it("TOLERATES a non-object provenance rather than refusing the whole restore", () => {
    // DELIBERATE, per the implementation: provenance is optional lineage metadata whose two
    // fields are both nullable, and hydrateRestorePayload takes the authoritative
    // sourceGenerationId from the payload's TOP LEVEL anyway. Throwing away an otherwise
    // perfectly restorable form over unreadable metadata would be the worse outcome.
    for (const provenance of [null, "nope", 7, ["chat_1"], undefined]) {
      const value = expectOk(hydrateSnapshot(validSnapshot({ provenance }), makeTinyDefaults()));
      expect(value.chatId).toBeNull();
      expect(value.sourceGenerationId).toBeNull();
      expect(value.ads).toHaveLength(1);
    }
  });

  it("tolerates non-string ids inside an otherwise valid provenance", () => {
    const value = expectOk(
      hydrateSnapshot(
        validSnapshot({ provenance: { chat_id: 12345, source_generation_id: {} } }),
        makeTinyDefaults(),
      ),
    );

    expect(value.chatId).toBeNull();
    expect(value.sourceGenerationId).toBeNull();
  });
});

describe("hydrateRestorePayload — single ad and whole batch", () => {
  /** A payload as the Video Build Log writes it. */
  function payload(snapshots: unknown[], sourceGenerationId = "gen_being_regenerated") {
    return { snapshots, source_generation_id: sourceGenerationId };
  }

  it("yields exactly one ad for 'Reopen this ad'", () => {
    const value = expectOk(
      hydrateRestorePayload(payload([snapshotOf(uniqueIntroAd())]), makeDefaultsFactoryFor(uniqueIntroAd())),
    );

    expect(value.ads).toHaveLength(1);
    expect(value.ads[0]).toEqual({ ...survivingKeys(uniqueIntroAd()), uid: "fresh-uid-1" });
  });

  it("yields N ads IN PAYLOAD ORDER for 'Reopen whole batch'", () => {
    const snaps = ["ad one", "ad two", "ad three", "ad four"].map((concept) =>
      snapshotOf({ ...uniqueIntroAd(), concept }),
    );

    const value = expectOk(hydrateRestorePayload(payload(snaps), makeTinyDefaults()));

    expect(value.ads).toHaveLength(4);
    expect(value.ads.map((a) => a.concept)).toEqual(["ad one", "ad two", "ad three", "ad four"]);
  });

  it("gives every ad in the batch a distinct fresh uid", () => {
    const snaps = [1, 2, 3].map((n) => snapshotOf({ ...uniqueIntroAd(), variationNumber: n }));

    const ads = expectOk(hydrateRestorePayload(payload(snaps), makeTinyDefaults())).ads;

    expect(ads.map((a) => a.uid)).toEqual(["fresh-uid-1", "fresh-uid-2", "fresh-uid-3"]);
  });

  it("flattens a multi-ad snapshot alongside single-ad ones, still in order", () => {
    const multi = { ...validSnapshot(), ads: [{ concept: "b1" }, { concept: "b2" }] };
    const snaps = [snapshotOf({ ...uniqueIntroAd(), concept: "a" }), multi, snapshotOf({ ...uniqueIntroAd(), concept: "c" })];

    const value = expectOk(hydrateRestorePayload(payload(snaps), makeTinyDefaults()));

    expect(value.ads.map((a) => a.concept)).toEqual(["a", "b1", "b2", "c"]);
  });

  it("takes batch-level page settings from the FIRST snapshot", () => {
    const otherPage: SnapshotPage = {
      product: "prod_second",
      product_name: "Second Product",
      brand: "SecondBrand",
      funnel: "advertorial",
      intended_platform: "tiktok",
      cs: "Someone Else",
    };
    const snaps = [snapshotOf(uniqueIntroAd(), PAGE), snapshotOf(uniqueIntroAd(), otherPage)];

    const value = expectOk(hydrateRestorePayload(payload(snaps), makeTinyDefaults()));

    expect(value.page).toEqual(PAGE);
    expect(value.page).not.toEqual(otherPage);
  });

  it("takes chatId from the first snapshot", () => {
    const first = buildSettingsSnapshot({
      ad: uniqueIntroAd(), page: PAGE, chatId: "chat_first", capturedAt: AT,
    });
    const second = buildSettingsSnapshot({
      ad: uniqueIntroAd(), page: PAGE, chatId: "chat_second", capturedAt: AT,
    });

    const value = expectOk(hydrateRestorePayload(payload([first, second]), makeTinyDefaults()));

    expect(value.chatId).toBe("chat_first");
  });

  it("survives the sessionStorage JSON round-trip the payload actually makes", () => {
    const raw = JSON.stringify(payload([snapshotOf(uniqueIntroAd())], "gen_top"));

    const value = expectOk(
      hydrateRestorePayload(JSON.parse(raw), makeDefaultsFactoryFor(uniqueIntroAd())),
    );

    expect(value.ads[0]).toEqual({ ...survivingKeys(uniqueIntroAd()), uid: "fresh-uid-1" });
    expect(value.sourceGenerationId).toBe("gen_top");
    expect(value.page).toEqual(PAGE);
  });
});

describe("hydrateRestorePayload — lineage must not be confused", () => {
  it("takes sourceGenerationId from the payload's TOP LEVEL, not the snapshot's provenance", () => {
    // The top-level id is the ad being regenerated FROM (supplied by the log page). The inner
    // provenance id records what the ORIGINAL batch was itself regenerated from — a generation
    // further back. Reading the inner one here would corrupt the lineage chain.
    const snap = buildSettingsSnapshot({
      ad: uniqueIntroAd(),
      page: PAGE,
      sourceGenerationId: "gen_INNER_one_generation_further_back",
      capturedAt: AT,
    });

    const value = expectOk(
      hydrateRestorePayload(
        { snapshots: [snap], source_generation_id: "gen_TOP_the_ad_being_regenerated" },
        makeTinyDefaults(),
      ),
    );

    expect(value.sourceGenerationId).toBe("gen_TOP_the_ad_being_regenerated");
    expect(value.sourceGenerationId).not.toBe("gen_INNER_one_generation_further_back");
  });

  it("keeps the two ids distinct: hydrateSnapshot alone still reports the INNER one", () => {
    const snap = buildSettingsSnapshot({
      ad: uniqueIntroAd(),
      page: PAGE,
      sourceGenerationId: "gen_INNER",
      capturedAt: AT,
    });

    // Per-snapshot hydration reports the snapshot's own lineage …
    expect(expectOk(hydrateSnapshot(snap, makeTinyDefaults())).sourceGenerationId).toBe("gen_INNER");
    // … while the payload-level result reports the batch's new lineage.
    expect(
      expectOk(
        hydrateRestorePayload({ snapshots: [snap], source_generation_id: "gen_TOP" }, makeTinyDefaults()),
      ).sourceGenerationId,
    ).toBe("gen_TOP");
  });

  it("does NOT fall back to the inner provenance id when the top level is missing", () => {
    // Silently substituting a generation-further-back id would be worse than recording none.
    const snap = buildSettingsSnapshot({
      ad: uniqueIntroAd(), page: PAGE, sourceGenerationId: "gen_INNER", capturedAt: AT,
    });

    for (const top of [undefined, "", null, 12345, {}]) {
      const value = expectOk(
        hydrateRestorePayload({ snapshots: [snap], source_generation_id: top }, makeTinyDefaults()),
      );
      expect(value.sourceGenerationId).toBeNull();
    }
  });

  it("takes the top-level id even when the first snapshot has no provenance at all", () => {
    const value = expectOk(
      hydrateRestorePayload(
        { snapshots: [validSnapshot({ provenance: undefined })], source_generation_id: "gen_TOP" },
        makeTinyDefaults(),
      ),
    );

    expect(value.sourceGenerationId).toBe("gen_TOP");
  });
});

describe("hydrateRestorePayload — one bad snapshot fails the whole call", () => {
  it("fails when ANY snapshot in the payload is invalid, propagating its reason", () => {
    const good = snapshotOf(uniqueIntroAd());
    const bad = validSnapshot({ schema_version: SNAPSHOT_SCHEMA_VERSION + 1 });

    const reason = expectFail(
      hydrateRestorePayload({ snapshots: [good, bad, good], source_generation_id: "g" }, makeTinyDefaults()),
    );

    expect(reason).toMatch(/newer version/i);
  });

  it("fails when the FIRST snapshot is the invalid one", () => {
    const good = snapshotOf(uniqueIntroAd());

    expectFail(
      hydrateRestorePayload({ snapshots: [{}, good], source_generation_id: "g" }, makeTinyDefaults()),
    );
  });

  it("fails when the LAST snapshot is the invalid one — no partial batch is returned", () => {
    // A half-restored batch is precisely the "looks complete but isn't" failure mode.
    const good = snapshotOf(uniqueIntroAd());

    expectFail(
      hydrateRestorePayload(
        { snapshots: [good, good, null], source_generation_id: "g" },
        makeTinyDefaults(),
      ),
    );
  });

  it("refuses an empty snapshots array", () => {
    expect(
      expectFail(hydrateRestorePayload({ snapshots: [], source_generation_id: "g" }, makeTinyDefaults())),
    ).toMatch(/no snapshots/i);
  });

  it("refuses a missing snapshots key", () => {
    expectFail(hydrateRestorePayload({ source_generation_id: "g" }, makeTinyDefaults()));
  });

  it("refuses a snapshots value that is not an array", () => {
    for (const snapshots of [null, undefined, "snap", 3, { 0: {} }, snapshotOf(uniqueIntroAd())]) {
      expectFail(hydrateRestorePayload({ snapshots, source_generation_id: "g" }, makeTinyDefaults()));
    }
  });

  it("refuses a payload that is not an object, without throwing", () => {
    for (const input of [null, undefined, "", "payload", 42, true, [snapshotOf(uniqueIntroAd())]]) {
      expect(() => hydrateRestorePayload(input, makeTinyDefaults())).not.toThrow();
      expect(expectFail(hydrateRestorePayload(input, makeTinyDefaults())).length).toBeGreaterThan(0);
    }
  });
});

describe("hydrateRestorePayload — gripExamplesTruncated is any-of", () => {
  const truncatedSnap = () =>
    snapshotOf({ ...uniqueIntroAd(), gripExampleImages: ["data:image/png;base64,AAAA"] });
  const cleanSnap = () => snapshotOf(uniqueIntroAd());

  it("is false when NO snapshot was truncated", () => {
    const value = expectOk(
      hydrateRestorePayload(
        { snapshots: [cleanSnap(), cleanSnap(), cleanSnap()], source_generation_id: "g" },
        makeTinyDefaults(),
      ),
    );

    expect(value.gripExamplesTruncated).toBe(false);
  });

  it("is true when the FIRST snapshot was truncated", () => {
    const value = expectOk(
      hydrateRestorePayload(
        { snapshots: [truncatedSnap(), cleanSnap()], source_generation_id: "g" },
        makeTinyDefaults(),
      ),
    );

    expect(value.gripExamplesTruncated).toBe(true);
  });

  it("is true when only a LATER snapshot was truncated — not just the first is checked", () => {
    const value = expectOk(
      hydrateRestorePayload(
        { snapshots: [cleanSnap(), cleanSnap(), truncatedSnap()], source_generation_id: "g" },
        makeTinyDefaults(),
      ),
    );

    expect(value.gripExamplesTruncated).toBe(true);
  });

  it("is true when EVERY snapshot was truncated", () => {
    const value = expectOk(
      hydrateRestorePayload(
        { snapshots: [truncatedSnap(), truncatedSnap()], source_generation_id: "g" },
        makeTinyDefaults(),
      ),
    );

    expect(value.gripExamplesTruncated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Optional hook (ClickUp 86caz3tkg) — "Edit & Regenerate" only restores fields
// that exist on a FRESH card's defaults, so the whole of bite #6 is: the hook
// fields are on makeFreshAd(), and an ad saved BEFORE the feature existed must
// therefore fall back to hook-OFF rather than to undefined.
// ─────────────────────────────────────────────────────────────────────────────

/** Fresh-card defaults as they now exist in BatchCreator.makeFreshAd(). */
function makeHookDefaults(overrides: Record<string, unknown> = {}) {
  return makeTinyDefaults({ hookEnabled: false, hookText: "", hookAvatarId: "", ...overrides });
}

describe("hook fields — Edit & Regenerate restore (bite #6)", () => {
  it("falls back to hook-OFF for an ad snapshotted BEFORE the hook existed", () => {
    const preFeatureAd = uniqueIntroAd(); // no hookEnabled / hookText / hookAvatarId keys
    expect("hookEnabled" in preFeatureAd).toBe(false);

    const value = expectOk(hydrateSnapshot(snapshotOf(preFeatureAd), makeHookDefaults()));

    expect(value.ads[0].hookEnabled).toBe(false);
    expect(value.ads[0].hookText).toBe("");
    expect(value.ads[0].hookAvatarId).toBe("");
  });

  it("round-trips a hooked ad — text AND its own avatar survive the reopen", () => {
    const hookedAd = {
      ...uniqueIntroAd(),
      hookEnabled: true,
      hookText: "Stop scrolling — this is the bit nobody tells you.",
      hookAvatarId: "av_hook_999",
    };

    const value = expectOk(hydrateSnapshot(snapshotOf(hookedAd), makeHookDefaults()));

    expect(value.ads[0].hookEnabled).toBe(true);
    expect(value.ads[0].hookText).toBe("Stop scrolling — this is the bit nobody tells you.");
    // Deliberately its OWN avatar — the hook is not assumed to be the body avatar.
    expect(value.ads[0].hookAvatarId).toBe("av_hook_999");
  });

  it("does NOT need a schema-version bump — v1 snapshots still restore", () => {
    const snap = snapshotOf({ ...uniqueIntroAd(), hookEnabled: true, hookText: "Hook.", hookAvatarId: "av_h" });
    expect(snap.schema_version).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(1);
    expect(expectOk(hydrateSnapshot(snap, makeHookDefaults())).ads[0].hookText).toBe("Hook.");
  });
});
