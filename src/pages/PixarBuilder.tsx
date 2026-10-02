// PixarBuilder — the "Build UGC" workspace for a Pixar-style storyboard.
//
// Reached from the "Build UGC" button on a Pixar storyboard in Script Chat.
// The storyboard is handed over via sessionStorage (see lib/pixarBuildSession).
//
// Flow:
//   1. Show the scenes in a table + basic details.
//   2. "Create main character avatar" → async job → 3 reference avatars.
//   3. User picks one reference.
//   4. "Generate scene images" → async job → 4-5 images per scene, rendered
//      as scene-wise cards (results stream in via Supabase realtime).

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clapperboard, Loader2, Check, ArrowLeft, UserPlus, Images, AlertTriangle, Sparkles,
  ExternalLink, Film, Package,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useProducts } from "@/hooks/useProducts";
import { toast } from "@/hooks/use-toast";
import {
  loadPixarBuild, parseDurationSeconds, toImageBuilderScenes,
  type PixarBuildSession,
} from "@/lib/pixarBuildSession";
import { driveProxyFull } from "@/lib/driveImage";
import {
  useStartPixarCharacter, useStartPixarSceneImages, useStartPixarNewVideo,
  fetchPixarCharacterJob, fetchPixarSceneImageJob, fetchPixarVideoJob, subscribePixarJob,
  type PixarCharacterJob, type PixarSceneImageJob, type PixarVideoJob, type PixarAvatarRef,
} from "@/hooks/usePixarBuild";

export default function PixarBuilder() {
  const navigate = useNavigate();
  const [session] = useState<PixarBuildSession | null>(() => loadPixarBuild());

  const startCharacter = useStartPixarCharacter();
  const startSceneImages = useStartPixarSceneImages();
  const startNewVideo = useStartPixarNewVideo();

  const [characterJobId, setCharacterJobId] = useState<string | null>(null);
  const [characterJob, setCharacterJob] = useState<PixarCharacterJob | null>(null);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);

  const [sceneJobId, setSceneJobId] = useState<string | null>(null);
  const [sceneJob, setSceneJob] = useState<PixarSceneImageJob | null>(null);

  // Chosen frame image urls per scene_number (step 3 input). The user can pick one
  // or more; they're sent (in scene-image order) as frame_urls so Image Builder
  // animates the whole selection. The first selected frame is the keyframe anchor.
  const [selectedFrames, setSelectedFrames] = useState<Record<number, string>>({});

  // Per-scene "show product" toggle — controls whether the product reference is
  // used when generating that scene's images (and later its video). Seeded from
  // the script-declared `is_product_to_show` flag (Pixar law P19) so scenes the
  // writer marked for product showcase start checked; the user can still toggle.
  const [showProduct, setShowProduct] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    for (const s of session?.scenes ?? []) {
      if (s.isProductToShow) init[s.sceneNumber] = true;
    }
    return init;
  });

  // ── Product reference picker (Step 2) ──────────────────────────────────────
  // Lets the user choose WHICH product (and which of its images) is reproduced in
  // the scenes flagged "show product". Without this the backend falls back to a
  // hardcoded default reference; here we send the real per-product image URL.
  const { products } = useProducts();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedProductImageUrl, setSelectedProductImageUrl] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => products?.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  // Images offered as the reference: packshots first, then real holding photos.
  const productImageOptions = useMemo(() => {
    if (!selectedProduct) return [] as string[];
    const byOrder = <T extends { image_url: string; order_index: number }>(arr?: T[]) =>
      (arr ?? []).slice().sort((a, b) => a.order_index - b.order_index).map((i) => i.image_url);
    return [...byOrder(selectedProduct.product_images), ...byOrder(selectedProduct.product_reference_images)]
      .filter(Boolean);
  }, [selectedProduct]);

  // Resolve the product this script was built for. The script handoff stores the
  // product's UUID in productSlug and its name in productLabel (see ScriptChat /
  // pixarBuildSession), so match by id first, then by name — and DON'T fall back
  // to an arbitrary product, which would surface the wrong one.
  useEffect(() => {
    if (!products || selectedProductId) return;
    const id = session?.productSlug?.trim();
    const label = session?.productLabel?.trim().toLowerCase();
    const match =
      (id && products.find((p) => p.id === id)) ||
      (label && products.find((p) => p.name?.trim().toLowerCase() === label)) ||
      (id && products.find((p) => p.product_code?.trim().toLowerCase() === id.toLowerCase())) ||
      null;
    if (match) setSelectedProductId(match.id);
  }, [products, selectedProductId, session]);

  // When the product changes, default the reference image to its first one.
  useEffect(() => {
    setSelectedProductImageUrl(productImageOptions[0] ?? null);
  }, [productImageOptions]);

  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoJob, setVideoJob] = useState<PixarVideoJob | null>(null);

  // Realtime: character job
  useEffect(() => {
    if (!characterJobId) return;
    let active = true;
    fetchPixarCharacterJob(characterJobId).then((row) => {
      if (active && row) setCharacterJob(row);
    }).catch(() => {});
    const unsub = subscribePixarJob("pixar_character_jobs", characterJobId, (row) => {
      setCharacterJob({
        ...(row as unknown as PixarCharacterJob),
        result_avatars: (row.result_avatars as PixarAvatarRef[]) || [],
      });
    });
    return () => { active = false; unsub(); };
  }, [characterJobId]);

  // Realtime: scene-image job
  useEffect(() => {
    if (!sceneJobId) return;
    let active = true;
    fetchPixarSceneImageJob(sceneJobId).then((row) => {
      if (active && row) setSceneJob(row);
    }).catch(() => {});
    const unsub = subscribePixarJob("pixar_scene_image_jobs", sceneJobId, (row) => {
      setSceneJob({
        ...(row as unknown as PixarSceneImageJob),
        result_scenes: (row.result_scenes as PixarSceneImageJob["result_scenes"]) || [],
      });
    });
    return () => { active = false; unsub(); };
  }, [sceneJobId]);

  // Realtime: video job
  useEffect(() => {
    if (!videoJobId) return;
    let active = true;
    fetchPixarVideoJob(videoJobId).then((row) => {
      if (active && row) setVideoJob(row);
    }).catch(() => {});
    const unsub = subscribePixarJob("pixar_video_jobs", videoJobId, (row) => {
      setVideoJob(row as unknown as PixarVideoJob);
    });
    return () => { active = false; unsub(); };
  }, [videoJobId]);

  const scenesByNumber = useMemo(() => {
    const m = new Map<number, PixarSceneImageJob["result_scenes"][number]>();
    for (const s of sceneJob?.result_scenes || []) m.set(s.scene_number, s);
    return m;
  }, [sceneJob?.result_scenes]);

  // Scenes that have at least one generated image — these need a frame selection.
  const scenesNeedingKeyframe = useMemo(
    () => (session?.scenes || []).filter((s) => (scenesByNumber.get(s.sceneNumber)?.images?.length || 0) > 0),
    [session?.scenes, scenesByNumber],
  );
  const allKeyframesPicked =
    scenesNeedingKeyframe.length > 0 &&
    scenesNeedingKeyframe.every((s) => !!selectedFrames[s.sceneNumber]);

  // Pick the single first frame for a scene (Seedance animates forward from it).
  // Clicking the already-selected frame clears it.
  const selectFrame = (sceneNumber: number, url: string) => {
    setSelectedFrames((prev) => ({
      ...prev,
      [sceneNumber]: prev[sceneNumber] === url ? "" : url,
    }));
  };

  if (!session) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
          <Clapperboard className="size-10 text-muted-foreground/50" />
          <div>
            <h1 className="text-lg font-semibold">No storyboard loaded</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Open a Pixar-style storyboard in Script Chat and click{" "}
              <span className="font-medium">Build UGC</span> to start here.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4 mr-1.5" /> Go back
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const { meta, scenes, productLabel } = session;
  const metaRows: Array<{ label: string; value: string }> = [];
  if (productLabel) metaRows.push({ label: "Brand", value: productLabel });
  if (meta.mainCharacter) metaRows.push({ label: "Main character", value: meta.mainCharacter });
  if (meta.mainPain) metaRows.push({ label: "Main pain", value: meta.mainPain });
  if (meta.chosenStorylinePattern) metaRows.push({ label: "Storyline pattern", value: meta.chosenStorylinePattern });

  const characterStatus = characterJob?.status;
  const characterPending = startCharacter.isPending || characterStatus === "pending" || characterStatus === "in_progress";
  const avatars = characterJob?.result_avatars || [];

  const sceneStatus = sceneJob?.status;
  const scenePending = startSceneImages.isPending || sceneStatus === "pending" || sceneStatus === "in_progress";

  const videoStatus = videoJob?.status;
  const videoPending = startNewVideo.isPending || videoStatus === "pending" || videoStatus === "in_progress";

  const handleCreateCharacter = async () => {
    try {
      const id = await startCharacter.mutateAsync({
        product: session.productSlug,
        productLabel: session.productLabel,
        mainCharacter: meta.mainCharacter,
        mainPain: meta.mainPain,
        storylinePattern: meta.chosenStorylinePattern,
        variantCount: 3,
      });
      setCharacterJobId(id);
      setCharacterJob(null);
      toast({ title: "Generating character references…", description: "3 options will appear here shortly." });
    } catch { /* surfaced by hook */ }
  };

  const handleGenerateSceneImages = async () => {
    if (!selectedAvatarUrl) return;
    try {
      const id = await startSceneImages.mutateAsync({
        characterJobId: characterJobId || undefined,
        selectedAvatarUrl,
        product: session.productSlug,
        productLabel: session.productLabel,
        productImage: selectedProductImageUrl || undefined,
        meta: {
          main_character: meta.mainCharacter,
          main_pain: meta.mainPain,
          storyline_pattern: meta.chosenStorylinePattern,
        },
        scenes: toImageBuilderScenes(scenes).map((sc) => ({
          ...sc,
          show_product: !!showProduct[sc.scene_number as number],
        })),
        storyboard: { meta, scenes },
      });
      setSceneJobId(id);
      setSceneJob(null);
      toast({ title: "Generating scene images…", description: "Images will stream in scene by scene." });
    } catch { /* surfaced by hook */ }
  };

  const handleGenerateVideo = async () => {
    if (!allKeyframesPicked) return;
    // New-video (Seedance) payload: ONLY the first frame per scene (proxied so
    // Replicate can fetch it) plus the storyboard fields the backend formats into
    // the cinematic prompt.
    const videoScenes = scenesNeedingKeyframe.map((s) => {
      const first = selectedFrames[s.sceneNumber];
      return {
        scene_number: s.sceneNumber,
        first_frame: driveProxyFull(first),
        duration_s: parseDurationSeconds(s.meta),
        spoken_line: s.spokenLine || "",
        setting: s.visual.setting ?? null,
        expression: s.visual.characterExpression ?? null,
        action: s.visual.characterAction ?? null,
        camera: s.visual.camera ?? null,
        characters_in_scene: s.visual.charactersInScene ?? null,
        audio_beat: s.audioBeat ?? null,
        show_product: !!showProduct[s.sceneNumber],
      };
    });
    try {
      const result = await startNewVideo.mutateAsync({
        jobId: sceneJobId || characterJobId || undefined,
        style: "Stylized 3D animated",
        // Brand + product from the script's resolved product (brand and
        // product_name carry the same human label, mirroring the HeyGen path);
        // product is the slug/id, product_image the chosen reference.
        brand: selectedProduct?.brands?.name || productLabel || undefined,
        product: session.productSlug || selectedProduct?.id || undefined,
        product_name: selectedProduct?.name || productLabel || undefined,
        product_image: selectedProductImageUrl || undefined,
        video_format: session.videoFormat || undefined,
        meta: {
          main_character: meta.mainCharacter,
          main_pain: meta.mainPain,
          storyline_pattern: meta.chosenStorylinePattern,
        },
        scenes: videoScenes,
      });
      toast({
        title: "New-video generation started",
        description: `Sent ${result.scenes} scene(s) to fal — track progress in the Video Build Log.`,
      });
      navigate("/ugc-builder/video-build-log");
    } catch { /* surfaced by hook */ }
  };

  return (
    <DashboardLayout scrollable>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowLeft className="size-4 mr-1.5" /> Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Clapperboard className="size-5 text-primary" /> Build UGC
            </h1>
            <p className="text-sm text-muted-foreground">
              {scenes.length} scene{scenes.length === 1 ? "" : "s"}
              {productLabel ? ` · ${productLabel}` : ""}
            </p>
          </div>
        </div>

        {/* Basic details */}
        {metaRows.length > 0 && (
          <section className="rounded-lg border border-border bg-card px-4 py-3.5">
            <h2 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Details</h2>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              {metaRows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-muted-foreground font-medium">{r.label}</dt>
                  <dd className="text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Scene table */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold">Storyboard scenes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Duration</th>
                  <th className="px-3 py-2 font-semibold">Spoken line</th>
                  <th className="px-3 py-2 font-semibold">Characters</th>
                  <th className="px-3 py-2 font-semibold">Setting</th>
                  <th className="px-3 py-2 font-semibold">Expression</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Camera</th>
                  <th className="px-3 py-2 font-semibold">Product?</th>
                  <th className="px-3 py-2 font-semibold">Audio · beat</th>
                </tr>
              </thead>
              <tbody>
                {scenes.map((s) => {
                  const dur = parseDurationSeconds(s.meta);
                  return (
                    <tr key={s.sceneNumber} className="border-t border-border/60 align-top">
                      <td className="px-3 py-2 font-semibold tabular-nums">{s.sceneNumber}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{dur != null ? `${dur}s` : s.meta || "—"}</td>
                      <td className="px-3 py-2 max-w-[260px]">{s.spokenLine || <span className="text-muted-foreground/60 italic">—</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.visual.charactersInScene || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.visual.setting || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.visual.characterExpression || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.visual.characterAction || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.visual.camera || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{s.isProductToShow ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[220px]">{s.audioBeat || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Step 1: main character avatar */}
        <section className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">1</span>
            <h2 className="text-sm font-semibold">Main character avatar</h2>
          </div>

          {avatars.length === 0 && (
            <Button onClick={handleCreateCharacter} disabled={characterPending}>
              {characterPending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <UserPlus className="size-4 mr-1.5" />}
              {characterPending ? "Generating references…" : "Create main character avatar"}
            </Button>
          )}

          {characterStatus === "failed" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>{characterJob?.error || "Character generation failed."}{" "}
                <button className="underline font-medium" onClick={handleCreateCharacter}>Retry</button>
              </span>
            </div>
          )}

          {avatars.length > 0 && (
            <div>
              <p className="text-[12px] text-muted-foreground mb-2">Pick one reference to anchor the character across every scene:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {avatars.map((a, i) => {
                  const on = selectedAvatarUrl === a.url;
                  return (
                    <button
                      key={a.url + i}
                      type="button"
                      onClick={() => setSelectedAvatarUrl(a.url)}
                      className={`group relative rounded-lg border-2 overflow-hidden transition-all ${on ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                      data-testid={`pixar-avatar-${i}`}
                    >
                      <img src={driveProxyFull(a.url)} alt={a.label || `Option ${i + 1}`} className="w-full aspect-[9/16] object-contain bg-muted" />
                      <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] font-medium text-left">
                        {a.label || `Option ${i + 1}`}
                      </div>
                      {on && (
                        <div className="absolute top-1.5 right-1.5 size-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="size-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Step 2: scene images */}
        <section className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">2</span>
            <h2 className="text-sm font-semibold">Scene images</h2>
            {sceneStatus === "in_progress" && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> generating…
              </span>
            )}
          </div>

          {!sceneJob && (
            <>
              <div className="space-y-2">
                <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
                  <Package className="size-3.5" /> Product to feature (from your script) — pick the reference image reproduced in the ticked scenes:
                </p>
                <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-[12.5px] font-medium">
                  <Package className="size-3.5 text-primary" />
                  {selectedProduct
                    ? <>{selectedProduct.name}{selectedProduct.brands?.name ? ` · ${selectedProduct.brands.name}` : ""}</>
                    : (productLabel || "Resolving product…")}
                </div>

                {selectedProduct && productImageOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {productImageOptions.map((url) => {
                      const picked = selectedProductImageUrl === url;
                      return (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setSelectedProductImageUrl(url)}
                          className={`relative rounded-md overflow-hidden border-2 transition-colors ${picked ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                          title={picked ? "Selected product reference" : "Use this product image"}
                        >
                          <img src={driveProxyFull(url)} alt="Product reference" className="size-16 object-contain bg-muted" />
                          {picked && (
                            <span className="absolute top-0.5 left-0.5 inline-flex items-center rounded bg-primary p-0.5 text-primary-foreground">
                              <Check className="size-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : selectedProduct ? (
                  <p className="text-[11px] text-amber-500 flex items-center gap-1">
                    <AlertTriangle className="size-3" /> This product has no images — a default reference will be used.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <p className="text-[11.5px] text-muted-foreground">Tick the scenes where the product should appear:</p>
                {scenes.map((s) => (
                  <label key={s.sceneNumber} className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                    <Checkbox
                      className="mt-0.5"
                      checked={!!showProduct[s.sceneNumber]}
                      onCheckedChange={(v) => setShowProduct((prev) => ({ ...prev, [s.sceneNumber]: v === true }))}
                    />
                    <span className="font-medium tabular-nums shrink-0">Scene {s.sceneNumber}</span>
                    {s.spokenLine && <span className="text-muted-foreground line-clamp-1">— {s.spokenLine}</span>}
                  </label>
                ))}
              </div>
              <Button onClick={handleGenerateSceneImages} disabled={!selectedAvatarUrl || scenePending}>
                {scenePending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Images className="size-4 mr-1.5" />}
                {scenePending ? "Starting…" : "Generate scene images"}
              </Button>
            </>
          )}
          {!selectedAvatarUrl && !sceneJob && (
            <p className="text-[11.5px] text-muted-foreground -mt-2">Select a character reference above first.</p>
          )}

          {sceneStatus === "failed" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>{sceneJob?.error || "Scene image generation failed."}{" "}
                <button className="underline font-medium" onClick={handleGenerateSceneImages}>Retry</button>
              </span>
            </div>
          )}

          {sceneJob && (
            <div className="space-y-4">
              {scenes.map((s) => {
                const result = scenesByNumber.get(s.sceneNumber);
                const imgs = result?.images || [];
                return (
                  <article key={s.sceneNumber} className="rounded-lg border border-border bg-background overflow-hidden">
                    <header className="px-4 py-2.5 border-b border-border/60 bg-muted/30 flex items-baseline gap-3">
                      <span className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-[12px] font-bold tabular-nums px-2 py-0.5">
                        Scene {s.sceneNumber}
                      </span>
                      {s.meta && <span className="text-[11px] text-muted-foreground tabular-nums">{s.meta}</span>}
                      <span className="ml-auto text-[11px] text-muted-foreground">{imgs.length} image{imgs.length === 1 ? "" : "s"}</span>
                      {imgs.length > 0 && (
                        <span className={`text-[10.5px] font-medium ${selectedFrames[s.sceneNumber] ? "text-emerald-500" : "text-amber-500"}`}>
                          {selectedFrames[s.sceneNumber] ? "✓ first frame picked" : "pick first frame"}
                        </span>
                      )}
                    </header>
                    <div className="px-4 py-3 space-y-3">
                      {s.spokenLine && <p className="text-[12.5px] leading-relaxed">{s.spokenLine}</p>}
                      {imgs.length === 0 ? (
                        <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-4">
                          {scenePending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                          {scenePending ? "Generating images for this scene…" : "No images yet."}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                          {imgs.map((img, i) => {
                            const picked = selectedFrames[s.sceneNumber] === img.url;
                            return (
                              <div
                                key={img.url + i}
                                className={`group relative rounded-md overflow-hidden border-2 transition-colors ${picked ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => selectFrame(s.sceneNumber, img.url)}
                                  className="block w-full"
                                  title={picked ? "Unpick this first frame" : "Use this as the scene's first frame"}
                                  data-testid={`pixar-keyframe-${s.sceneNumber}-${i}`}
                                >
                                  <img src={driveProxyFull(img.url)} alt={`Scene ${s.sceneNumber} image ${i + 1}`} className="w-full aspect-[9/16] object-contain bg-muted" />
                                </button>
                                {picked && (
                                  <div className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[9.5px] font-semibold text-primary-foreground">
                                    <Check className="size-2.5" /> First frame
                                  </div>
                                )}
                                <a
                                  href={driveProxyFull(img.url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-1 right-1 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Open full size"
                                >
                                  <ExternalLink className="size-3" />
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Step 3: build the video */}
        <section className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">3</span>
            <h2 className="text-sm font-semibold">Build video</h2>
            {videoStatus === "in_progress" && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> rendering…
              </span>
            )}
          </div>

          {videoJob?.status !== "completed" && (
            <>
              <p className="text-[12px] text-muted-foreground">
                Pick the first frame for each scene above, then build. Each scene's first frame
                is sent to Seedance, which animates it forward into a clip with its own
                lip-synced audio. The raw video URLs are logged on the Image Builder.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleGenerateVideo} disabled={!allKeyframesPicked || videoPending}>
                  {videoPending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Film className="size-4 mr-1.5" />}
                  {videoPending ? "Building…" : "Build video"}
                </Button>
                <span className="text-[11.5px] text-muted-foreground tabular-nums">
                  {scenesNeedingKeyframe.filter((s) => !!selectedFrames[s.sceneNumber]).length}/{scenesNeedingKeyframe.length} scenes have a first frame
                </span>
              </div>
              {!allKeyframesPicked && scenesNeedingKeyframe.length > 0 && (
                <p className="text-[11.5px] text-amber-500 -mt-1">
                  Every scene needs a first frame selected before you can build.
                </p>
              )}
              {scenesNeedingKeyframe.length === 0 && (
                <p className="text-[11.5px] text-muted-foreground -mt-1">Generate scene images first (step 2).</p>
              )}
            </>
          )}

          {videoStatus === "failed" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>{videoJob?.error || "Video generation failed."}{" "}
                <button className="underline font-medium" onClick={handleGenerateVideo}>Retry</button>
              </span>
            </div>
          )}

          {videoPending && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2">
              <Loader2 className="size-4 animate-spin" />
              Animating scenes, adding voiceover + music, stitching the final cut… this can take a few minutes.
            </div>
          )}

          {videoJob?.status === "completed" && videoJob.final_video_url && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-border bg-black mx-auto max-w-[360px]">
                <video
                  src={driveProxyFull(videoJob.final_video_url)}
                  controls
                  playsInline
                  className="w-full aspect-[9/16] bg-black"
                  data-testid="pixar-final-video"
                />
              </div>
              <a
                href={driveProxyFull(videoJob.final_video_url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Open / download the video
              </a>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
