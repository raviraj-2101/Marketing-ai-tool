// NewPixarBuilder — variant of PixarBuilder ("/new-pixar-builder").
//
// Same flow as /pixar-builder (loads the handed-over storyboard from
// sessionStorage via lib/pixarBuildSession) but additionally renders the FULL
// character roster (meta.characters — every character, not just the main one),
// and the storyboard table surfaces the per-scene cast (characters_in_scene)
// and the per-scene product flag (is_product_to_show) columns.
//
// Flow:
//   1. Show the full character roster + the scenes in a table.
//   2. "Create main character avatar" → async job → 3 reference avatars.
//   3. User picks one reference.
//   4. "Generate scene images" → async job → 4-5 images per scene, rendered
//      as scene-wise cards (results stream in via Supabase realtime).

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Clapperboard, Loader2, Check, ArrowLeft, UserPlus, Images, AlertTriangle, Sparkles,
  ExternalLink, Film, Package, Users, RefreshCw,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import {
  loadPixarBuild, parseDurationSeconds, toImageBuilderScenes,
  type PixarBuildSession,
} from "@/lib/pixarBuildSession";
import { driveProxyFull } from "@/lib/driveImage";
import {
  useStartPixarCharacter, useStartPixarProductBoard, useStartPixarSceneImages, useStartPixarNewVideo,
  fetchPixarCharacterJob, fetchPixarSceneImageJob, fetchPixarVideoJob, subscribePixarJob,
  type PixarCharacterJob, type PixarSceneImageJob, type PixarVideoJob, type PixarAvatarRef,
} from "@/hooks/usePixarBuild";

export default function NewPixarBuilder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session] = useState<PixarBuildSession | null>(() => loadPixarBuild());

  // Step 3 — Concept name + Creative Strategist (CS), written onto the generation
  // log when the video is built (mirrors the UGC BuildFromChatModal fields).
  const [concept, setConcept] = useState("");
  const [cs, setCs] = useState("");
  // CS roster from cs_config (same endpoint the UGC builder uses).
  const csOwnersQ = useQuery<Array<{ label: string; email: string }>>({
    queryKey: [`${API_BASE}/api/options/cs-owners`],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/options/cs-owners");
      return r.json();
    },
  });
  const csOwners = csOwnersQ.data ?? [];
  const userEmail = user?.email || "";
  const defaultCs = useMemo(() => {
    if (!csOwners.length) return "Agentic";
    const mine = csOwners.find((c) => c.email.toLowerCase() === userEmail.toLowerCase());
    if (mine) return mine.label;
    const agentic = csOwners.find((c) => /^agentic$/i.test(c.label));
    return agentic?.label || csOwners[0].label;
  }, [csOwners, userEmail]);
  // Seed CS once the roster loads (don't clobber a user edit).
  useEffect(() => {
    setCs((prev) => prev || defaultCs);
  }, [defaultCs]);
  // Seed a sensible default concept name from the script's product + storyline.
  useEffect(() => {
    if (!session) return;
    setConcept((prev) => {
      if (prev) return prev;
      const parts = [session.productLabel, session.meta?.chosenStorylinePattern].filter(Boolean);
      return parts.join(" – ");
    });
  }, [session]);

  const startCharacter = useStartPixarCharacter();
  const startProductBoard = useStartPixarProductBoard();
  const startSceneImages = useStartPixarSceneImages();
  const startNewVideo = useStartPixarNewVideo();

  const [characterJobId, setCharacterJobId] = useState<string | null>(null);
  const [characterJob, setCharacterJob] = useState<PixarCharacterJob | null>(null);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);

  // Step 2 — product board (reuses pixar_character_jobs; result in result_avatars).
  const [productBoardJobId, setProductBoardJobId] = useState<string | null>(null);
  const [productBoardJob, setProductBoardJob] = useState<PixarCharacterJob | null>(null);

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
  // Step 2 — product board: MULTIPLE product images can be selected as the
  // board's source-of-truth references (the scene step keeps one reference).
  const [boardProductImages, setBoardProductImages] = useState<string[]>([]);

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

  // When the product changes, default the reference image to its first one, and
  // default the product-board selection to ALL of the product's images.
  useEffect(() => {
    setSelectedProductImageUrl(productImageOptions[0] ?? null);
    setBoardProductImages(productImageOptions);
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

  // Realtime: product-board job (same table as character jobs)
  useEffect(() => {
    if (!productBoardJobId) return;
    let active = true;
    fetchPixarCharacterJob(productBoardJobId).then((row) => {
      if (active && row) setProductBoardJob(row);
    }).catch(() => {});
    const unsub = subscribePixarJob("pixar_character_jobs", productBoardJobId, (row) => {
      setProductBoardJob({
        ...(row as unknown as PixarCharacterJob),
        result_avatars: (row.result_avatars as PixarAvatarRef[]) || [],
      });
    });
    return () => { active = false; unsub(); };
  }, [productBoardJobId]);

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
  if (meta.mainPain) metaRows.push({ label: "Main pain", value: meta.mainPain });
  if (meta.chosenStorylinePattern) metaRows.push({ label: "Storyline pattern", value: meta.chosenStorylinePattern });

  // Full character roster (Pixar law P17). Falls back to the single main_character
  // row when the script didn't emit a roster.
  const characterRoster: Array<{ label: string; value: string }> =
    meta.characters && meta.characters.length > 0
      ? meta.characters
      : meta.mainCharacter
        ? [{ label: "Main character", value: meta.mainCharacter }]
        : [];

  const characterStatus = characterJob?.status;
  const characterPending = startCharacter.isPending || characterStatus === "pending" || characterStatus === "in_progress";
  const avatars = characterJob?.result_avatars || [];

  const productBoardStatus = productBoardJob?.status;
  const productBoardPending = startProductBoard.isPending || productBoardStatus === "pending" || productBoardStatus === "in_progress";
  const productBoards = productBoardJob?.result_avatars || [];
  const productBoardUrl = productBoards[0]?.url || null;

  // Lookup: character name → its generated board URL (board label === character
  // name). Used to attach each scene's characters' boards to the video payload.
  const normalizeName = (n: string) => n.replace(/\(.*?\)/g, "").trim().toLowerCase();
  const boardByName = new Map<string, string>();
  for (const a of avatars) if (a.label) boardByName.set(normalizeName(a.label), a.url);

  // Build-video readiness (no scene images anymore): need character boards, and
  // a product board if any scene shows the product.
  const anySceneShowsProduct = scenes.some((s) => s.isProductToShow);
  const charactersReady = avatars.length > 0;
  const productReady = !anySceneShowsProduct || productBoards.length > 0;
  const videoReady = charactersReady && productReady;

  const sceneStatus = sceneJob?.status;
  const scenePending = startSceneImages.isPending || sceneStatus === "pending" || sceneStatus === "in_progress";

  const videoStatus = videoJob?.status;
  const videoPending = startNewVideo.isPending || videoStatus === "pending" || videoStatus === "in_progress";

  const handleCreateProductBoard = async () => {
    // Use the multi-selected product images (preserve the product's image order),
    // capped so the reference set stays manageable for the model.
    const refs = productImageOptions.filter((u) => boardProductImages.includes(u)).slice(0, 6);
    if (refs.length === 0) return;
    try {
      const id = await startProductBoard.mutateAsync({
        product: session.productSlug,
        productLabel: session.productLabel,
        productName: selectedProduct?.name || session.productLabel,
        brand: selectedProduct?.brands?.name,
        productImages: refs,
      });
      setProductBoardJobId(id);
      setProductBoardJob(null);
      toast({ title: "Generating product board…", description: "The product reference board will appear here shortly." });
    } catch { /* surfaced by hook */ }
  };

  const handleCreateCharacter = async () => {
    try {
      const id = await startCharacter.mutateAsync({
        product: session.productSlug,
        productLabel: session.productLabel,
        mainCharacter: meta.mainCharacter,
        mainPain: meta.mainPain,
        storylinePattern: meta.chosenStorylinePattern,
        // Generate one CHARACTER BOARD per character in the roster (board mode).
        characters: characterRoster,
      });
      setCharacterJobId(id);
      setCharacterJob(null);
      toast({
        title: "Generating character boards…",
        description: `${characterRoster.length} character board${characterRoster.length === 1 ? "" : "s"} will appear here shortly.`,
      });
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
    if (!videoReady) return;
    // New flow: send EVERY storyboard scene with the character board(s) for the
    // characters that appear in that scene, plus the product board when the scene
    // shows the product. The backend uses these as the scene's reference images.
    const videoScenes = scenes.map((s) => {
      const names = (s.visual.charactersInScene || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const character_boards = names
        .map((n) => ({ name: n.replace(/\(.*?\)/g, "").trim(), url: boardByName.get(normalizeName(n)) || null }))
        .filter((c) => c.url) as Array<{ name: string; url: string }>;
      return {
        scene_number: s.sceneNumber,
        duration_s: parseDurationSeconds(s.meta),
        spoken_line: s.spokenLine || "",
        setting: s.visual.setting ?? null,
        expression: s.visual.characterExpression ?? null,
        action: s.visual.characterAction ?? null,
        camera: s.visual.camera ?? null,
        characters_in_scene: s.visual.charactersInScene ?? null,
        audio_beat: s.audioBeat ?? null,
        show_product: !!s.isProductToShow,
        // Reference boards for this scene.
        character_boards,
        product_board: s.isProductToShow ? productBoardUrl : null,
      };
    });
    try {
      const result = await startNewVideo.mutateAsync({
        jobId: characterJobId || productBoardJobId || undefined,
        style: "Stylized 3D animated",
        // Brand + product from the script's resolved product (brand and
        // product_name carry the same human label, mirroring the HeyGen path);
        // product is the slug/id, product_image the chosen reference.
        brand: selectedProduct?.brands?.name || productLabel || undefined,
        product: session.productSlug || selectedProduct?.id || undefined,
        product_name: selectedProduct?.name || productLabel || undefined,
        product_image: selectedProductImageUrl || undefined,
        video_format: session.videoFormat || undefined,
        concept: concept.trim() || undefined,
        cs: cs.trim() || undefined,
        meta: {
          main_character: meta.mainCharacter,
          main_pain: meta.mainPain,
          storyline_pattern: meta.chosenStorylinePattern,
          // Full roster (name + description) so the backend can write accurate,
          // detailed per-character prompt blocks (board images lock exact look).
          characters: (meta.characters || []).map((c) => {
            const m = c.value.match(/^\s*Name:\s*([^.\n]+)/i);
            return { name: m ? m[1].trim() : c.label, description: c.value };
          }),
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
              <Clapperboard className="size-5 text-primary" /> Build UGC · New
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

        {/* Character roster — every character, not just the main one (Pixar law P17) */}
        {characterRoster.length > 0 && (
          <section className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Characters</h2>
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {characterRoster.length} character{characterRoster.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {characterRoster.map((c) => (
                <li key={c.label} className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-primary/80 mb-1">
                    {c.label}
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {c.value}
                  </p>
                </li>
              ))}
            </ul>
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

        {/* Step 1: character boards (one per character) */}
        <section className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">1</span>
            <h2 className="text-sm font-semibold">Character boards</h2>
          </div>

          {avatars.length === 0 && (
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">
                Generates one CHARACTER BOARD reference sheet for each of the{" "}
                {characterRoster.length} character{characterRoster.length === 1 ? "" : "s"} in this script.
              </p>
              <Button onClick={handleCreateCharacter} disabled={characterPending || characterRoster.length === 0}>
                {characterPending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <UserPlus className="size-4 mr-1.5" />}
                {characterPending ? "Generating boards…" : "Create character boards"}
              </Button>
              {characterRoster.length === 0 && (
                <p className="text-[11.5px] text-amber-500">This script has no character roster to build boards from.</p>
              )}
            </div>
          )}

          {characterPending && avatars.length === 0 && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2">
              <Loader2 className="size-4 animate-spin" />
              Generating {characterRoster.length} character board{characterRoster.length === 1 ? "" : "s"}… this can take a minute.
            </div>
          )}

          {characterStatus === "failed" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>{characterJob?.error || "Character board generation failed."}{" "}
                <button className="underline font-medium" onClick={handleCreateCharacter}>Retry</button>
              </span>
            </div>
          )}

          {avatars.length > 0 && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                {avatars.length} character board{avatars.length === 1 ? "" : "s"} generated. Pick one board to anchor the
                main character across every scene:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {avatars.map((a, i) => {
                  const on = selectedAvatarUrl === a.url;
                  return (
                    <div
                      key={a.url + i}
                      className={`group relative rounded-lg border-2 overflow-hidden transition-all ${on ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                      data-testid={`pixar-board-${i}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAvatarUrl(a.url)}
                        className="block w-full"
                        title="Anchor the main character on this board"
                      >
                        <img src={driveProxyFull(a.url)} alt={a.label || `Character ${i + 1}`} className="w-full aspect-[9/16] object-contain bg-muted" />
                      </button>
                      {/* Name + selected state */}
                      <div className="px-2 py-1 border-t border-border/60 bg-muted/30 flex items-center gap-1">
                        <span className="text-[11px] font-medium truncate" title={a.label || `Character ${i + 1}`}>
                          {a.label || `Character ${i + 1}`}
                        </span>
                        {on && (
                          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary shrink-0">
                            <Check className="size-3" /> Main
                          </span>
                        )}
                      </div>
                      {/* Open full-size (hover) */}
                      <a
                        href={driveProxyFull(a.url)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-1 right-1 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Open full size"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                      {/* Selected check overlay */}
                      {on && (
                        <div className="absolute top-1 left-1 size-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="size-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Step 2: product board */}
        <section className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">2</span>
            <h2 className="text-sm font-semibold">Product board</h2>
            {productBoardStatus === "in_progress" && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> generating…
              </span>
            )}
          </div>

          {/* The product this script was built for + its reference image(s) */}
          <div className="space-y-2">
            <p className="text-[11.5px] text-muted-foreground flex items-center gap-1.5">
              <Package className="size-3.5" /> Product this script was built for:
            </p>
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-[12.5px] font-medium">
              <Package className="size-3.5 text-primary" />
              {selectedProduct
                ? <>{selectedProduct.name}{selectedProduct.brands?.name ? ` · ${selectedProduct.brands.name}` : ""}</>
                : (productLabel || "Resolving product…")}
            </div>

            {productImageOptions.length > 0 ? (
              <>
                <p className="text-[11.5px] text-muted-foreground pt-1">
                  Select one or more product images to use as the board's reference
                  {boardProductImages.length > 0 ? ` (${boardProductImages.length} selected)` : ""}:
                </p>
                <div className="flex flex-wrap gap-2">
                  {productImageOptions.map((url) => {
                    const picked = boardProductImages.includes(url);
                    return (
                      <button
                        key={url}
                        type="button"
                        onClick={() =>
                          setBoardProductImages((prev) =>
                            prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
                          )
                        }
                        className={`relative rounded-md overflow-hidden border-2 transition-colors ${picked ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                        title={picked ? "Click to deselect" : "Click to select this product image"}
                      >
                        <img src={driveProxyFull(url)} alt="Product reference" className="size-20 object-contain bg-muted" />
                        {picked && (
                          <span className="absolute top-0.5 left-0.5 inline-flex items-center rounded bg-primary p-0.5 text-primary-foreground">
                            <Check className="size-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : selectedProduct ? (
              <p className="text-[11px] text-amber-500 flex items-center gap-1">
                <AlertTriangle className="size-3" /> This product has no images — add product images to build a board.
              </p>
            ) : null}
          </div>

          {productBoards.length === 0 && (
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">
                Generates a PRODUCT BOARD reference sheet from the selected product image(s) above — used to keep the product on-model across scenes.
              </p>
              <Button onClick={handleCreateProductBoard} disabled={productBoardPending || boardProductImages.length === 0}>
                {productBoardPending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Package className="size-4 mr-1.5" />}
                {productBoardPending ? "Generating board…" : "Create product board"}
              </Button>
              {productImageOptions.length > 0 && boardProductImages.length === 0 && (
                <p className="text-[11.5px] text-amber-500">Select at least one product image.</p>
              )}
            </div>
          )}

          {productBoardPending && productBoards.length === 0 && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2">
              <Loader2 className="size-4 animate-spin" />
              Generating the product board… this can take a minute.
            </div>
          )}

          {productBoardStatus === "failed" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" />
              <span>{productBoardJob?.error || "Product board generation failed."}{" "}
                <button className="underline font-medium" onClick={handleCreateProductBoard}>Retry</button>
              </span>
            </div>
          )}

          {productBoards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-[12px] text-muted-foreground">
                  Product board generated. Not perfect? Regenerate it (adjust the selected images above first if needed).
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={handleCreateProductBoard}
                  disabled={productBoardPending || boardProductImages.length === 0}
                  data-testid="pixar-product-board-regenerate"
                >
                  {productBoardPending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <RefreshCw className="size-4 mr-1.5" />}
                  {productBoardPending ? "Regenerating…" : "Regenerate"}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {productBoards.map((b, i) => (
                <div
                  key={b.url + i}
                  className="group relative rounded-lg border-2 border-border overflow-hidden"
                  data-testid={`pixar-product-board-${i}`}
                >
                  <img src={driveProxyFull(b.url)} alt={b.label || "Product board"} className="w-full aspect-[9/16] object-contain bg-muted" />
                  <div className="px-2 py-1 border-t border-border/60 bg-muted/30">
                    <span className="text-[11px] font-medium truncate block" title={b.label || "Product board"}>
                      {b.label || "Product board"}
                    </span>
                  </div>
                  <a
                    href={driveProxyFull(b.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute top-1 right-1 rounded bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Open full size"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              ))}
              </div>
            </div>
          )}
        </section>

        {/* Step 3: concept name + CS (written onto the generation log) */}
        <section className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">3</span>
            <h2 className="text-sm font-semibold">Concept &amp; owner</h2>
          </div>
          <p className="text-[12px] text-muted-foreground -mt-1">
            These are stamped onto each scene's generation-log row when the video is built.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pixar-concept" className="text-[12px]">Concept name</Label>
              <Input
                id="pixar-concept"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="e.g. Cleantra – external-fix-failed-re-attribution"
                maxLength={200}
                data-testid="pixar-concept-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Creative Strategist (CS)</Label>
              <Select value={cs} onValueChange={setCs}>
                <SelectTrigger data-testid="pixar-cs-select">
                  <SelectValue placeholder={csOwnersQ.isLoading ? "Loading…" : "Select CS"} />
                </SelectTrigger>
                <SelectContent>
                  {csOwners.map((o) => (
                    <SelectItem key={o.label} value={o.label}>{o.label}</SelectItem>
                  ))}
                  {csOwners.length === 0 && <SelectItem value="Agentic">Agentic</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Step 4: build the video */}
        <section className="rounded-lg border border-border bg-card px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold">4</span>
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
                Sends every scene to the backend with the character board(s) for the characters in
                that scene, plus the product board for scenes that show the product. Track progress
                on the Video Build Log.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleGenerateVideo} disabled={!videoReady || videoPending}>
                  {videoPending ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Film className="size-4 mr-1.5" />}
                  {videoPending ? "Building…" : "Build video"}
                </Button>
              </div>
              {!charactersReady && (
                <p className="text-[11.5px] text-amber-500 -mt-1">
                  Create the character boards (step 1) before building.
                </p>
              )}
              {charactersReady && !productReady && (
                <p className="text-[11.5px] text-amber-500 -mt-1">
                  Some scenes show the product — create the product board (step 2) before building.
                </p>
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
