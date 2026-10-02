/**
 * ⚠️ DEPRECATED — this module ("Create Videos", /video-builder/create-videos) is
 * NO LONGER the page users see. The live video builder is the UGC Builder's
 * "Video Build Log" at /ugc-builder/video-build-log (src/pages/UgcVideoBuiltLog.tsx).
 * New features (e.g. the pre-push playback-speed control, ClickUp 86carazce) go
 * THERE, not here. Left in place only until this route is fully removed.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, Video, ChevronRight, CheckCircle, XCircle, Clock, Check, ExternalLink, Copy, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DashboardLayout } from '@/components/DashboardLayout';
import { isAllBrandsAccessUser, userHasBrandAccess } from '@/lib/brandAccess';

const VOICE_ID = 'Ryelb74sfkLgSElzikns';
const API_BASE_URL = import.meta.env.VITE_SERVER_URL as string;

const BRAND_CODES: Record<string, string> = {
  'Ledisa': 'LD',
  'Serabel': 'SB',
  'Cleantra': 'CL',
  'Wellanova': 'WN',
  'CELMOR': 'CM',
  'Rejuvapaw': 'RP',
  'GL-ME': 'GL-ME',
};

const PRODUCT_CODES: Record<string, string> = {
  'GLP-1 Patches': 'GL',
  'Dopamine Patches': 'DOP',
  'ParaVanish': 'PARA',
  'Sleep Patches': 'SLP',
  'Soursop': 'SOUR',
  'Lymphatic Drainage': 'LYMPH',
  'Lymphatic': 'LYMPH',
  'Astaxanthin': 'ASTA',
  'CELMOR Perfume': 'PF',
  'CELMOR Body Oil': 'BO',
  'Mushroom': 'MC',
  'Oregano': 'OREG',
  'GLP-1 Booster': 'GLB',
  'Tallow Balm': 'TB',
};

type Step = 1 | 2 | 3 | 4;

interface Avatar {
  id: string;
  name: string;
  image_url: string | null;
}

interface Scene {
  id: string;
  name: string;
  image_url: string | null;
  heygen_avatar_id: string | null;
  avatar_id: string;
  is_product: boolean;
  scene_group_id: string | null;
}

interface Brand {
  id: string;
  name: string;
  brand_code: string;
  main_cs?: string[];
  secondary_cs?: string[];
}

interface ProductItem {
  id: string;
  name: string;
  brand_id: string;
  product_code: string;
  top_5_comparison_image: string | null;
}

interface CsConfig {
  id: string;
  label: string;
  value?: string;
}

interface LogRecord {
  id: string;
  created_at: string;
  generation_id: string;
  avatar_id: string;
  scene_id: string | null;
  product_name: string;
  brand: string;
  script: string;
  cs: string;
  generated_video_url: string;
  final_video_url: string | null;
  in_pipeline: string | null;
  status: string;
  ads_script_id: string | null;
  funnel: string | null;
  scene_selection: string | null;
  ad_id: string | null;
  clickup_url: string | null;
  concept: string | null;
  caption_placement: string | null;
  product_placement: string | null;
  scenes: { name: string; image_url: string | null; is_product: boolean } | null;
  avatars: { name: string; image_url: string | null } | null;
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
  records: LogRecord[];
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: <Clock className="h-3 w-3" /> },
  processing: { label: 'Processing', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',       icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  merging:    { label: 'Merging',    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed:  { label: 'Completed',  color: 'bg-green-500/10 text-green-500 border-green-500/20',    icon: <CheckCircle className="h-3 w-3" /> },
  failed:     { label: 'Failed',     color: 'bg-red-500/10 text-red-500 border-red-500/20',          icon: <XCircle className="h-3 w-3" /> },
};

export default function NewVideo() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'generate' | 'results'>('generate');
  const [step, setStep] = useState<Step>(1);
  const [expandedGenId, setExpandedGenId] = useState<string | null>(null);

  // Step 1 — form fields
  const [sceneSelection, setSceneSelection] = useState<'with_product' | 'without_product' | 'both'>('with_product');
  const [funnel, setFunnel] = useState<string | null>('Onbrand');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [productItems, setProductItems] = useState<ProductItem[]>([]);
  const [loadingProductItems, setLoadingProductItems] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [scriptIdMode, setScriptIdMode] = useState<'new' | 'existing'>('new');
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [csConfigs, setCsConfigs] = useState<CsConfig[]>([]);
  const [loadingCsConfigs, setLoadingCsConfigs] = useState(false);
  const [selectedCs, setSelectedCs] = useState<string | null>(null);
  const [conceptName, setConceptName] = useState('');

  // Step 2 — script(s)
  const [script, setScript] = useState('');
  const [scriptWithoutProduct, setScriptWithoutProduct] = useState('');

  // Step 3 — avatars (multi-select)
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(true);
  const [selectedAvatars, setSelectedAvatars] = useState<Avatar[]>([]);

  // Step 4 — scenes (one per avatar)
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [sceneByAvatar, setSceneByAvatar] = useState<Record<string, Scene>>({});
  // "both" mode — stores the "without product" scene selection per avatar
  const [sceneByAvatarNoProduct, setSceneByAvatarNoProduct] = useState<Record<string, Scene>>({});

  // Caption and product placement per avatar
  const [captionAnchorByAvatar, setCaptionAnchorByAvatar] = useState<Record<string, 'top' | 'bottom'>>({});
  const [captionPctByAvatar,    setCaptionPctByAvatar]    = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);

  // Generated Results tab
  const [logs, setLogs] = useState<LogGroup[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [pipelineJobs, setPipelineJobs] = useState<Record<string, { jobId: string; status: string }>>({});
  const [regeneratingAvatars, setRegeneratingAvatars] = useState<Record<string, boolean>>({});
  const [expandedAvatarKey, setExpandedAvatarKey] = useState<string | null>(null);
  const [pipelineDialogGroup, setPipelineDialogGroup] = useState<LogGroup | null>(null);
  const [pipelineSelectedAvatarIds, setPipelineSelectedAvatarIds] = useState<Set<string>>(new Set());
  const [pipelineIntendedPlatform, setPipelineIntendedPlatform] = useState<'Meta' | 'Applovin' | 'Both'>('Both');

  // Fetch avatars on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from('avatars')
      .select('id, name, image_url')
      .eq('is_configure', true)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Error fetching avatars:', error);
        setAvatars((data as any) || []);
        setLoadingAvatars(false);
      });
  }, [user]);

  // Fetch scenes for all selected avatars
  useEffect(() => {
    if (selectedAvatars.length === 0) { setScenes([]); return; }
    setLoadingScenes(true);
    const ids = selectedAvatars.map(a => a.id);
    supabase
      .from('scenes')
      .select('id, name, image_url, heygen_avatar_id, avatar_id, is_product, scene_group_id')
      .in('avatar_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Error fetching scenes:', error);
        setScenes((data as any) || []);
        setLoadingScenes(false);
      });
  }, [selectedAvatars]);

  // Fetch brands when entering Step 1
  useEffect(() => {
    if (step !== 1 || !user) return;

    setLoadingBrands(true);
    supabase.from('brands').select('id, name, brand_code, main_cs, secondary_cs').order('name').then(({ data }) => {
      let filteredBrands = (data as any) || [];
      // Super Admin, Admin, Dev users, and All-Brands sentinel users see all brands
      const isAllBrandsUser = isAllBrandsAccessUser(user);
      // Other users see only their assigned brands
      if (!isAllBrandsUser && user?.brand_ids?.length) {
        filteredBrands = filteredBrands.filter((b: Brand) => userHasBrandAccess(user, b.id));
      }
      setBrands(filteredBrands);
      setLoadingBrands(false);
    });
  }, [step, user]);

  // Fetch all CS configs once
  useEffect(() => {
    setLoadingCsConfigs(true);
    supabase.from('cs_config').select('id, label, value').order('label').then(({ data }) => {
      setCsConfigs((data as any) || []);
      setLoadingCsConfigs(false);
    });
  }, []);

  // Filter CS configs based on selected brand
  const filteredCsConfigs = useMemo(() => {
    if (!selectedBrand) return [];

    const mainAndSecondaryEmails = [
      ...(selectedBrand.main_cs || []),
      ...(selectedBrand.secondary_cs || []),
    ];

    return csConfigs.filter((cs: CsConfig) =>
      mainAndSecondaryEmails.some(
        (email) => cs.value?.toLowerCase().trim() === email.toLowerCase().trim()
      )
    );
  }, [selectedBrand, csConfigs]);

  // Fetch products when brand is selected
  useEffect(() => {
    if (!selectedBrand) { setProductItems([]); setSelectedProduct(null); return; }
    setLoadingProductItems(true);
    setSelectedProduct(null);
    setSelectedScriptId('');
    supabase.from('products').select('id, name, brand_id, product_code, top_5_comparison_image').eq('brand_id', selectedBrand.id).order('name').then(({ data }) => {
      setProductItems((data as any) || []);
      setLoadingProductItems(false);
    });
  }, [selectedBrand]);

  useEffect(() => {
    if (activeTab !== 'results') return;
    fetchLogs();
  }, [activeTab, brands, user]);


  // Navigation helpers
  const goBackToStep3 = () => {
    setSceneByAvatar({});
    setSceneByAvatarNoProduct({});
    setStep(3);
  };

  const toggleAvatar = (avatar: Avatar) => {
    setSelectedAvatars(prev =>
      prev.some(a => a.id === avatar.id)
        ? prev.filter(a => a.id !== avatar.id)
        : [...prev, avatar]
    );
  };


  // Fetch and group logs
  const fetchLogs = async () => {
    if (!user) return;
    setLoadingLogs(true);
    const fnResult = await fetch(`${API_BASE_URL}/api/video-generation-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'select_all' }),
    }).then(res => res.json()).catch(err => ({ error: err?.message || 'Network error' }));
    const data = fnResult?.data;
    const error = fnResult?.error;

    if (error) {
      console.error('Error fetching logs:', error);
      setLoadingLogs(false);
      return;
    }

    // Determine if user is restricted to assigned brands only (Super Admin/Admin/Dev
    // and All-Brands sentinel users are never restricted)
    const isRestrictedUser = !isAllBrandsAccessUser(user);

    const map = new Map<string, LogGroup>();
    for (const row of (data as LogRecord[]) || []) {
      // Skip logs from brands not assigned to this user (for restricted users)
      if (isRestrictedUser && user?.brand_ids) {
        const brandMatch = brands.find(b => b.name === row.brand);
        if (!brandMatch || !userHasBrandAccess(user, brandMatch.id)) {
          continue;
        }
      }

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

  // Pipeline push — single request for all selected avatars
  const handlePushToPipeline = async (group: LogGroup, selectedAvatarIds: Set<string>, intendedPlatform: string) => {
    const brandCode = BRAND_CODES[group.brand] ?? group.brand;
    const productCode = PRODUCT_CODES[group.product_name] ?? group.product_name;

    const avatarMap = new Map<string, LogRecord[]>();
    for (const rec of group.records) {
      if (!avatarMap.has(rec.avatar_id)) avatarMap.set(rec.avatar_id, []);
      avatarMap.get(rec.avatar_id)!.push(rec);
    }

    setPipelineDialogGroup(null);

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
      const res = await fetch(`${API_BASE_URL}/api/push-to-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: productCode,
          brand: brandCode,
          cs: group.cs,
          driveVideoLinks: driveVideoLinks,
          funnel: group.funnel,
          scriptId: group.ads_script_id,
          concept: group.concept,
          intendedPlatform,
          recordIds: allRecordIds,
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

  // Regenerate videos for a specific avatar within a generation
  const handleRegenerateAvatar = async (generationId: string, avatarRecords: LogRecord[]) => {
    const avatarId = avatarRecords[0].avatar_id;
    const key = `${generationId}_${avatarId}`;
    setRegeneratingAvatars(prev => ({ ...prev, [key]: true }));

    try {
      // Mark avatar records as processing in DB + update local UI immediately
      await Promise.all(
        avatarRecords.map(rec =>
          fetch(`${API_BASE_URL}/api/video-generation-logs`, {
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

      // Fetch heygen_avatar_id + is_product for each record's scene
      // AND heygen_voice_id for each record's avatar — both in parallel
      const [sceneResults, voiceResults] = await Promise.all([
        Promise.all(
          avatarRecords.map(rec =>
            rec.scene_id
              ? supabase.from('scenes').select('heygen_avatar_id, is_product').eq('id', rec.scene_id).single()
              : Promise.resolve({ data: null, error: null })
          )
        ),
        Promise.all(
          avatarRecords.map(rec =>
            supabase.from('avatars').select('heygen_voice_id').eq('id', rec.avatar_id).single()
          )
        ),
      ]);
      console.log('Scene query results:', sceneResults);

      // Create HeyGen videos for each record — backend handles polling, merge, and DB updates
      await Promise.all(
        avatarRecords.map(async (rec, i) => {
          const heygenAvatarId = (sceneResults[i].data as any)?.heygen_avatar_id;
          const heygenVoiceId = (voiceResults[i].data as any)?.heygen_voice_id ?? VOICE_ID;
          console.log('heygenAvatarId:', heygenAvatarId);
          if (!heygenAvatarId) throw new Error(`No HeyGen avatar ID for scene of ${rec.scenes?.name ?? rec.scene_id}`);
          const res = await fetch(`${API_BASE_URL}/api/create-heygen-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              heygen_avatar_id: heygenAvatarId,
              title: rec.scenes?.name ?? 'Video',
              script: rec.script,
              voice_id: heygenVoiceId,
              top_5_comparison_image: (rec as any).top_5_comparison_image ?? null,
              log: {
                record_id: rec.id,
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
                targeting_metadata: (rec as any).targeting_metadata ?? null,
                top_5_comparison_image: (rec as any).top_5_comparison_image ?? null,
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

  // Generation
  const handleSubmit = async () => {
    for (const avatar of selectedAvatars) {
      const scene = sceneByAvatar[avatar.id];
      if (!scene) {
        toast.error(`Please select a ${sceneSelection === 'both' ? 'with-product ' : ''}scene for ${avatar.name}`);
        return;
      }
      if (!scene.heygen_avatar_id) {
        toast.error(`Scene "${scene.name}" for ${avatar.name} has no HeyGen avatar ID. Confirm in Manage Scenes first.`);
        return;
      }
      if (sceneSelection === 'both') {
        const noProductScene = sceneByAvatarNoProduct[avatar.id];
        if (!noProductScene) {
          toast.error(`Please select a without-product scene for ${avatar.name}`);
          return;
        }
        if (!noProductScene.heygen_avatar_id) {
          toast.error(`Scene "${noProductScene.name}" for ${avatar.name} has no HeyGen avatar ID. Confirm in Manage Scenes first.`);
          return;
        }
      }
    }

    setSubmitting(true);

    const entries = sceneSelection === 'both'
      ? [
          ...selectedAvatars.map(avatar => ({ avatar, scene: sceneByAvatar[avatar.id], scriptText: script.trim() })),
          ...selectedAvatars.map(avatar => ({ avatar, scene: sceneByAvatarNoProduct[avatar.id], scriptText: scriptWithoutProduct.trim() })),
        ]
      : selectedAvatars.map(avatar => ({ avatar, scene: sceneByAvatar[avatar.id], scriptText: script.trim() }));

    try {
      const distinctAvatarIds = [...new Set(entries.map(e => e.scene.avatar_id).filter(Boolean))];
      const { data: avatarVoiceData } = await supabase
        .from('avatars')
        .select('id, heygen_voice_id')
        .in('id', distinctAvatarIds as string[]);
      const avatarVoiceMap: Record<string, string> = {};
      ((avatarVoiceData as any[]) ?? []).forEach((a: any) => {
        if (a.heygen_voice_id) avatarVoiceMap[a.id] = a.heygen_voice_id;
      });

      const generationId = crypto.randomUUID();

      // Resolve ads_script_id: call create-script API for 'new' mode, use entered value for 'existing'
      let adsScriptId: string | null = null;
      if (scriptIdMode === 'new') {
        const scriptRes = await fetch(`${API_BASE_URL}/api/create-script`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_code: selectedBrand!.brand_code,
            product_code: selectedProduct!.product_code,
          }),
        }).then(r => r.json()).catch(() => null);
        if (scriptRes?.success && scriptRes?.data?.script_id) {
          adsScriptId = String(scriptRes.data.script_id);
        }
      } else if (scriptIdMode === 'existing' && selectedScriptId.trim()) {
        adsScriptId = selectedScriptId.trim();
      }

      await Promise.all(
        entries.map(async ({ avatar, scene, scriptText }) => {
          const anchor = captionAnchorByAvatar[avatar.id] ?? 'bottom';
          const pct    = captionPctByAvatar[avatar.id]    ?? '';
          const captionPlacement = pct !== '' ? `${anchor}:${pct}` : undefined;
          console.log(`[CreateVideos] Submitting avatar=${avatar.id} scene=${scene.name} caption_placement=${JSON.stringify(captionPlacement)} (anchor=${anchor}, pct="${pct}")`);
          const res = await fetch(`${API_BASE_URL}/api/create-heygen-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              heygen_avatar_id: scene.heygen_avatar_id,
              title: scene.name,
              script: scriptText,
              voice_id: avatarVoiceMap[scene.avatar_id] ?? VOICE_ID,
              // Product-level overlay card for Top-5 comparison scripts; the
              // backend persists it on the log row so the HeyGen webhook merge
              // can overlay it on the video at caption time.
              top_5_comparison_image: selectedProduct!.top_5_comparison_image ?? null,
              log: {
                avatar_id: avatar.id,
                generation_id: generationId,
                scene_id: scene.id,
                product_name: selectedProduct!.name,
                brand: selectedBrand!.name,
                script: scriptText,
                cs: selectedCs!,
                concept: conceptName,
                is_product: scene.is_product,
                ads_script_id: adsScriptId,
                funnel: funnel,
                scene_selection: sceneSelection === 'with_product'
                  ? 'With Product'
                  : sceneSelection === 'without_product'
                  ? 'Without Product'
                  : 'Both',
                caption_placement: captionPlacement,
                product_placement: null,
                top_5_comparison_image: selectedProduct!.top_5_comparison_image ?? null,
              },
            }),
          });
          const data = await res.json();
          if (!res.ok || !data?.video_id) {
            throw new Error(data?.error || `Video creation failed for ${scene.name}`);
          }
          return data;
        })
      );

      setActiveTab('results');
      setStep(1);
      setSelectedAvatars([]);
      setScenes([]);
      setSceneByAvatar({});
      setSceneByAvatarNoProduct({});
      setScript('');
      setScriptWithoutProduct('');
      setSelectedBrand(null);
      setSelectedProduct(null);
      setSelectedCs(null);
      setFunnel(null);
      setSceneSelection('with_product');
      setScriptIdMode('new');
      setSelectedScriptId('');
      setCaptionAnchorByAvatar({});
      setCaptionPctByAvatar({});

      toast.success(`${entries.length} video(s) queued — tracking in results…`);
      fetchLogs();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate videos');
    } finally {
      setSubmitting(false);
    }
  };



  // ── Inline components ──────────────────────────────────────────────────────

  const SearchableSelect = ({
    options,
    value,
    onSelect,
    placeholder,
    disabled = false,
  }: {
    options: string[];
    value: string | null;
    onSelect: (val: string) => void;
    placeholder: string;
    disabled?: boolean;
  }) => {
    const [open, setOpen] = useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn(
              'w-full justify-between font-normal',
              !value && 'text-muted-foreground'
            )}
          >
            {value ?? placeholder}
            <ChevronRight className="ml-2 h-4 w-4 shrink-0 opacity-50 rotate-90" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search…`} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map(option => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === option ? 'opacity-100' : 'opacity-0')} />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = statusConfig[status] || statusConfig.pending;
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', cfg.color)}>
        {cfg.icon} {cfg.label}
      </span>
    );
  };


  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto">
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'generate' | 'results'); setExpandedGenId(null); if (v === 'generate') setStep(1); }}>
        <TabsList>
          <TabsTrigger value="generate">Generate Video</TabsTrigger>
          <TabsTrigger value="results">Generated Results</TabsTrigger>
        </TabsList>

        {/* ── Generate Video tab ── */}
        <TabsContent value="generate" className="flex flex-col gap-6 mt-4">
          <div>
            <h1 className="text-2xl font-bold">New Video</h1>
            <p className="text-sm text-muted-foreground">Generate HeyGen videos with your avatar</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm flex-wrap">
            {([
              { n: 1 as Step, label: '1. Select Product' },
              { n: 2 as Step, label: '2. Configure Video' },
              { n: 3 as Step, label: '3. Select Avatars' },
              { n: 4 as Step, label: '4. Select Scenes' },
            ] as const).map(({ n, label }, i, arr) => (
              <React.Fragment key={n}>
                <span className={cn('font-medium', step === n ? 'text-primary' : 'text-muted-foreground')}>
                  {label}
                </span>
                {i < arr.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </React.Fragment>
            ))}
          </div>

          {/* ── Step 1 — Select Product ── */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Select Product</CardTitle>
                <p className="text-sm text-muted-foreground">Configure your video settings</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">

                {/* Scene Selection toggle */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Scene Selection <span className="text-destructive">*</span></label>
                  <div className="flex rounded-md border overflow-hidden w-fit">
                    {([
                      { value: 'with_product', label: 'With Product' },
                      { value: 'without_product', label: 'Without Product' },
                      { value: 'both', label: 'Both' },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSceneSelection(value)}
                        className={cn(
                          'px-4 py-2 text-sm font-medium transition-colors border-r last:border-r-0',
                          sceneSelection === value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-accent text-foreground'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Funnel */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Funnel <span className="text-destructive">*</span>
                  </label>
                  <SearchableSelect
                    options={['Onbrand', 'Comparison']}
                    value={funnel}
                    placeholder="Select funnel…"
                    onSelect={setFunnel}
                  />
                </div>

                {/* Brand */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Brand <span className="text-destructive">*</span>
                  </label>
                  {loadingBrands ? (
                    <div className="h-10 rounded-md bg-muted animate-pulse" />
                  ) : (
                    <SearchableSelect
                      options={brands.map(b => b.name)}
                      value={selectedBrand?.name ?? null}
                      placeholder="Select brand…"
                      onSelect={(name) => setSelectedBrand(brands.find(b => b.name === name) ?? null)}
                    />
                  )}
                </div>

                {/* Product */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Product <span className="text-destructive">*</span>
                  </label>
                  {loadingProductItems ? (
                    <div className="h-10 rounded-md bg-muted animate-pulse" />
                  ) : (
                    <SearchableSelect
                      options={productItems.map(p => p.name)}
                      value={selectedProduct?.name ?? null}
                      placeholder={selectedBrand ? 'Select product…' : 'Select a brand first…'}
                      disabled={!selectedBrand}
                      onSelect={(name) => setSelectedProduct(productItems.find(p => p.name === name) ?? null)}
                    />
                  )}
                </div>

                {/* Script ID */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Script ID</label>
                  <div className="flex rounded-md border overflow-hidden w-fit">
                    {([
                      { value: 'new', label: 'Create New' },
                      { value: 'existing', label: 'Use Existing' },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { setScriptIdMode(value); setSelectedScriptId(''); }}
                        className={cn(
                          'px-4 py-2 text-sm font-medium transition-colors border-r last:border-r-0',
                          scriptIdMode === value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-accent text-foreground'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {scriptIdMode === 'existing' && (
                    <Input
                      className="mt-1"
                      placeholder="Enter script ID…"
                      value={selectedScriptId}
                      onChange={(e) => setSelectedScriptId(e.target.value)}
                    />
                  )}
                </div>

                {/* Concept Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Concept Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="Enter concept name (e.g. Story telling, Confession, etc...)"
                    value={conceptName}
                    onChange={(e) => setConceptName(e.target.value)}
                  />
                </div>

                {/* CS */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    CS <span className="text-destructive">*</span>
                  </label>
                  {!selectedBrand ? (
                    <div className="h-10 rounded-md border border-border bg-background flex items-center px-3 text-sm text-muted-foreground">
                      Select a brand first
                    </div>
                  ) : loadingCsConfigs ? (
                    <div className="h-10 rounded-md bg-muted animate-pulse" />
                  ) : filteredCsConfigs.length === 0 ? (
                    <div className="h-10 rounded-md border border-border bg-background flex items-center px-3 text-sm text-muted-foreground">
                      No CS available for this brand
                    </div>
                  ) : (
                    <SearchableSelect
                      options={filteredCsConfigs.map(c => c.label)}
                      value={selectedCs}
                      placeholder="Select CS"
                      onSelect={setSelectedCs}
                    />
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={
                      !funnel ||
                      !selectedBrand ||
                      !selectedProduct ||
                      !conceptName.trim() ||
                      !selectedCs ||
                      (scriptIdMode === 'existing' && !selectedScriptId.trim())
                    }
                  >
                    Next: Configure Video <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 2 — Configure Video ── */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configure Video</CardTitle>
                <p className="text-sm text-muted-foreground">Enter the script for your video</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {sceneSelection === 'both' ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        Without Product Script <span className="text-destructive">*</span>
                      </label>
                      <Textarea
                        placeholder="Enter the without-product script…"
                        className="min-h-[160px] resize-none text-sm"
                        value={scriptWithoutProduct}
                        onChange={(e) => setScriptWithoutProduct(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        With Product Script <span className="text-destructive">*</span>
                      </label>
                      <Textarea
                        placeholder="Enter the with-product script…"
                        className="min-h-[160px] resize-none text-sm"
                        value={script}
                        onChange={(e) => setScript(e.target.value)}
                      />
                    </div>
                    
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Video Script <span className="text-destructive">*</span>
                    </label>
                    <Textarea
                      placeholder="Enter the video script…"
                      className="min-h-[160px] resize-none text-sm"
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={
                      sceneSelection === 'both'
                        ? !script.trim() || !scriptWithoutProduct.trim()
                        : !script.trim()
                    }
                  >
                    Next: Select Avatars <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3 — Select Avatars ── */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Select Avatars
                  {selectedAvatars.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {selectedAvatars.length} selected
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingAvatars ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : avatars.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No avatars found. Create an avatar in Avatar Generation first.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {avatars.map((avatar) => {
                      const isSelected = selectedAvatars.some(a => a.id === avatar.id);
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          onClick={() => toggleAvatar(avatar)}
                          className={cn(
                            'relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all hover:bg-accent',
                            isSelected
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                              : 'border-transparent hover:border-muted-foreground/30'
                          )}
                        >
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 rounded-full bg-primary p-0.5">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                          {avatar.image_url ? (
                            <img src={avatar.image_url} alt={avatar.name} className="h-16 w-16 rounded-full object-cover" />
                          ) : (
                            <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center text-xl font-bold">
                              {avatar.name.charAt(0)}
                            </div>
                          )}
                          <span className="text-xs font-medium text-center line-clamp-2">{avatar.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button onClick={() => setStep(4)} disabled={selectedAvatars.length === 0}>
                    Next: Select Scenes <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 4 — Select Scenes ── */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Select Scenes</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {sceneSelection === 'both'
                    ? 'Choose one with-product and one without-product scene per avatar'
                    : 'Choose one scene per avatar'}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {loadingScenes ? (
                  <div className="flex flex-col gap-4">
                    {selectedAvatars.map((avatar) => (
                      <div key={avatar.id} className="flex flex-col gap-2">
                        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
                        <div className="grid grid-cols-5 gap-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="aspect-[9/8] w-full rounded-md bg-muted animate-pulse" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  selectedAvatars.map((avatar) => {
                    const allAvatarScenes = scenes.filter(s => s.avatar_id === avatar.id);
                    const withProductScenes = allAvatarScenes.filter(s => s.is_product === true);
                    const withoutProductScenes = allAvatarScenes.filter(s => s.is_product === false);
                    const visibleScenes = sceneSelection === 'with_product'
                      ? withProductScenes
                      : sceneSelection === 'without_product'
                        ? withoutProductScenes
                        : allAvatarScenes;

                    const SceneTile = ({
                      scene,
                      isSelected,
                      onToggle,
                      captionTopPercent,
                    }: { scene: Scene; isSelected: boolean; onToggle: () => void; captionTopPercent?: number | null }) => (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={onToggle}
                        className={cn(
                          'relative aspect-[9/8] w-full rounded-md overflow-hidden border-2 transition-all bg-muted',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-transparent hover:border-muted-foreground/40'
                        )}
                      >
                        {scene.image_url ? (
                          <img src={scene.image_url} alt={scene.name} className="h-full w-full object-contain" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            <Video className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5">
                          <p className="text-[10px] text-white truncate">{scene.name}</p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1 rounded-full bg-primary p-0.5">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                        {!scene.heygen_avatar_id && (
                          <div className="absolute top-1 left-1">
                            <span className="rounded bg-yellow-500 px-1 py-0.5 text-[9px] font-bold text-black">No HeyGen ID</span>
                          </div>
                        )}
                        {captionTopPercent != null && (
                          <>
                            <div
                              className="absolute left-0 right-0 border-t border-dashed border-white/80 pointer-events-none z-10"
                              style={{ top: `${captionTopPercent}%` }}
                            />
                            <div
                              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                              style={{ top: `${captionTopPercent}%` }}
                            >
                              <div className="bg-white/90 rounded px-1.5 py-0.5 text-[7px] font-semibold text-gray-800 whitespace-nowrap shadow-sm">
                                Caption
                              </div>
                            </div>
                          </>
                        )}
                      </button>
                    );

                    const rawPct = captionPctByAvatar[avatar.id];
                    const captionAnchor = captionAnchorByAvatar[avatar.id] ?? 'bottom';
                    const numPct = parseFloat(rawPct ?? '');
                    const captionTopPercent = (!isNaN(numPct) && numPct >= 0 && numPct <= 100)
                      ? (captionAnchor === 'top' ? numPct : 100 - numPct)
                      : null;

                    return (
                      <div key={avatar.id} className="flex flex-col gap-3 pb-3 border-b last:border-b-0">
                        {/* Avatar heading */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {avatar.image_url ? (
                              <img src={avatar.image_url} alt={avatar.name} className="h-6 w-6 rounded-full object-cover" />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                                {avatar.name.charAt(0)}
                              </div>
                            )}
                            <span className="text-sm font-medium">{avatar.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                Caption Position <span className="text-destructive">*</span>
                              </label>
                              <div className="flex items-center gap-1.5">
                                <div className="flex rounded-md border border-border overflow-hidden h-8 text-xs">
                                  {(['top', 'bottom'] as const).map(anchor => (
                                    <button
                                      key={anchor}
                                      type="button"
                                      onClick={() => setCaptionAnchorByAvatar(prev => ({ ...prev, [avatar.id]: anchor }))}
                                      className={cn(
                                        'px-2.5 py-1 capitalize transition-colors border-r last:border-r-0',
                                        (captionAnchorByAvatar[avatar.id] ?? 'bottom') === anchor
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-background text-foreground hover:bg-muted'
                                      )}
                                    >
                                      From {anchor}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  placeholder="0–100"
                                  value={captionPctByAvatar[avatar.id] ?? ''}
                                  onChange={e => setCaptionPctByAvatar(prev => ({ ...prev, [avatar.id]: e.target.value }))}
                                  className="h-8 w-20 px-2 bg-background border border-border rounded-md text-sm text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-xs text-muted-foreground">%</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {sceneSelection === 'both' ? (() => {
                          const groups = new Map<string, { withProduct: Scene | null; withoutProduct: Scene | null }>();
                          allAvatarScenes.forEach(scene => {
                            const key = scene.scene_group_id ?? scene.id;
                            if (!groups.has(key)) groups.set(key, { withProduct: null, withoutProduct: null });
                            const g = groups.get(key)!;
                            if (scene.is_product) g.withProduct = scene;
                            else g.withoutProduct = scene;
                          });
                          const groupEntries = Array.from(groups.entries());
                          const isGroupSelected = (wp: Scene | null, wop: Scene | null) =>
                            !!wp && sceneByAvatar[avatar.id]?.id === wp.id &&
                            !!wop && sceneByAvatarNoProduct[avatar.id]?.id === wop.id;
                          const handleGroupSelect = (wp: Scene | null, wop: Scene | null) => {
                            const alreadySelected = isGroupSelected(wp, wop);
                            setSceneByAvatar(prev => {
                              const next = { ...prev };
                              if (alreadySelected || !wp) delete next[avatar.id]; else next[avatar.id] = wp;
                              return next;
                            });
                            setSceneByAvatarNoProduct(prev => {
                              const next = { ...prev };
                              if (alreadySelected || !wop) delete next[avatar.id]; else next[avatar.id] = wop;
                              return next;
                            });
                          };
                          return groupEntries.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-1 pl-2">No scenes found for this avatar</p>
                          ) : (
                            <div className="grid grid-cols-5 gap-2 pl-2">
                              {groupEntries.map(([groupId, { withProduct, withoutProduct }]) => {
                                const selected = isGroupSelected(withProduct, withoutProduct);
                                const name = withProduct?.name ?? withoutProduct?.name ?? groupId;
                                return (
                                  <button
                                    key={groupId}
                                    type="button"
                                    onClick={() => handleGroupSelect(withProduct, withoutProduct)}
                                    className={cn(
                                      'relative flex flex-col overflow-hidden rounded-md border-2 transition-all bg-muted',
                                      selected
                                        ? 'border-primary ring-2 ring-primary/30'
                                        : 'border-transparent hover:border-muted-foreground/40'
                                    )}
                                  >
                                    {/* Side-by-side images: without-product left, with-product right */}
                                    <div className="relative flex w-full">
                                      <div className="w-1/2 aspect-square bg-muted-foreground/10 border-r border-muted-foreground/20">
                                        {withoutProduct?.image_url ? (
                                          <img src={withoutProduct.image_url} alt="Without product" className="h-full w-full object-contain" />
                                        ) : (
                                          <div className="h-full w-full flex items-center justify-center">
                                            <Video className="h-3 w-3 text-muted-foreground" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="w-1/2 aspect-square bg-muted-foreground/10">
                                        {withProduct?.image_url ? (
                                          <img src={withProduct.image_url} alt="With product" className="h-full w-full object-contain" />
                                        ) : (
                                          <div className="h-full w-full flex items-center justify-center">
                                            <Video className="h-3 w-3 text-muted-foreground" />
                                          </div>
                                        )}
                                      </div>
                                      {captionTopPercent != null && (
                                        <>
                                          <div
                                            className="absolute left-0 right-0 border-t border-dashed border-white/80 pointer-events-none z-10"
                                            style={{ top: `${captionTopPercent}%` }}
                                          />
                                          <div
                                            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                                            style={{ top: `${captionTopPercent}%` }}
                                          >
                                            <div className="bg-white/90 rounded px-1 py-0.5 text-[6px] font-semibold text-gray-800 whitespace-nowrap shadow-sm">
                                              Caption
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    <div className="bg-black/60 px-1.5 py-0.5">
                                      <p className="text-[10px] text-white truncate">{name}</p>
                                    </div>
                                    {selected && (
                                      <div className="absolute top-1 right-1 rounded-full bg-primary p-0.5">
                                        <Check className="h-3 w-3 text-primary-foreground" />
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })() : (
                          <div className="flex flex-col gap-1.5 pl-2">
                            {sceneByAvatar[avatar.id] && (
                              <span className="text-xs text-primary">— {sceneByAvatar[avatar.id].name}</span>
                            )}
                            {visibleScenes.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1">No scenes found for this avatar</p>
                            ) : (
                              <div className="grid grid-cols-5 gap-2">
                                {visibleScenes.map(scene => (
                                  <SceneTile
                                    key={scene.id}
                                    scene={scene}
                                    isSelected={sceneByAvatar[avatar.id]?.id === scene.id}
                                    captionTopPercent={captionTopPercent}
                                    onToggle={() => setSceneByAvatar(prev => {
                                      if (prev[avatar.id]?.id === scene.id) {
                                        const next = { ...prev }; delete next[avatar.id]; return next;
                                      }
                                      return { ...prev, [avatar.id]: scene };
                                    })}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" onClick={goBackToStep3}>
                    Back
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      submitting ||
                      selectedAvatars.length === 0 ||
                      Object.keys(sceneByAvatar).length !== selectedAvatars.length ||
                      (sceneSelection === 'both' && Object.keys(sceneByAvatarNoProduct).length !== selectedAvatars.length) ||
                      selectedAvatars.some(a => {
                        const pct = captionPctByAvatar[a.id];
                        if (!pct || pct.trim() === '') return true;
                        const n = parseFloat(pct);
                        return isNaN(n) || n < 0 || n > 100;
                      })
                    }
                    className="min-w-48"
                  >
                    {submitting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                    ) : (
                      <><Video className="mr-2 h-4 w-4" /> Generate Video</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Generated Results tab ── */}
        <TabsContent value="results" className="flex flex-col gap-6 mt-4">
          <div>
            <h1 className="text-2xl font-bold">Generated Results</h1>
            <p className="text-sm text-muted-foreground">Track and manage your video generations.</p>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loadingLogs}>
              {loadingLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {loadingLogs ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">No generated videos yet.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[calc(100vh-300px)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted text-xs text-muted-foreground sticky top-0 z-10">
                        <th className="px-4 py-3 text-left font-medium">Generation ID</th>
                        <th className="px-10 py-3 text-left font-medium">Created</th>
                        <th className="px-4 py-3 text-left font-medium">Ad ID</th>
                        <th className="px-4 py-3 text-left font-medium">Script ID</th>
                        <th className="px-4 py-3 text-left font-medium">Concept</th>
                        <th className="px-6 py-3 text-left font-medium">Funnel</th>
                        <th className="px-4 py-3 text-left font-medium">Scene Selection</th>
                        <th className="px-8 py-3 text-left font-medium">CS</th>
                        <th className="px-4 py-3 text-left font-medium">Brand</th>
                        <th className="px-8 py-3 text-left font-medium">Product</th>
                        <th className="px-8 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-left font-medium">Push to Pipeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((group) => (
                        <React.Fragment key={group.generation_id}>
                          {/* Main summary row */}
                          <tr
                            className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => setExpandedGenId(prev => prev === group.generation_id ? null : group.generation_id)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-muted-foreground">{group.generation_id.slice(0, 8)}…</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(group.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const adId = group.records.find(r => r.ad_id && r.ad_id !== 'NULL')?.ad_id;
                                return adId
                                  ? <span className="text-xs font-mono">{adId}</span>
                                  : <span className="text-xs text-muted-foreground">—</span>;
                              })()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {group.ads_script_id
                                ? <span className="font-mono text-xs">{group.ads_script_id}</span>
                                : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {group.concept ?? <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {group.funnel ?? <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {group.scene_selection ?? <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{group.cs}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{group.brand}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{group.product_name}</td>
                            <td className="px-4 py-3"><StatusBadge status={group.overall_status} /></td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {group.final_video_url ? (() => {
                                const isPipelineDone = group.records.some(r => r.in_pipeline === 'completed');
                                const isPipelineProcessing = group.records.some(r => r.in_pipeline === 'processing');
                                const isPipelineRunning = pipelineJobs[group.generation_id]?.status === 'submitting';
                                if (isPipelineDone) {
                                  return <span className="text-xs text-green-600 font-medium">Pushed</span>;
                                }
                                if (isPipelineProcessing || isPipelineRunning) {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-xs text-blue-500 font-medium">
                                      <Loader2 className="h-3 w-3 animate-spin" /> Pushing…
                                    </span>
                                  );
                                }
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      const avatarMap = new Map<string, LogRecord[]>();
                                      for (const rec of group.records) {
                                        if (!avatarMap.has(rec.avatar_id)) avatarMap.set(rec.avatar_id, []);
                                        avatarMap.get(rec.avatar_id)!.push(rec);
                                      }
                                      const avatarsWithVideo = Array.from(avatarMap.entries())
                                        .filter(([, recs]) => recs.some(r => r.final_video_url))
                                        .map(([avatarId]) => avatarId);
                                      setPipelineSelectedAvatarIds(new Set(avatarsWithVideo));
                                      setPipelineDialogGroup(group);
                                    }}
                                  >
                                    Confirm
                                  </Button>
                                );
                              })() : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded accordion — per-avatar rows */}
                          {expandedGenId === group.generation_id && (() => {
                            // Group records by avatar_id
                            const avatarMap = new Map<string, LogRecord[]>();
                            for (const rec of group.records) {
                              if (!avatarMap.has(rec.avatar_id)) avatarMap.set(rec.avatar_id, []);
                              avatarMap.get(rec.avatar_id)!.push(rec);
                            }
                            return (
                              <tr>
                                <td colSpan={11} className="p-0 bg-muted/5 border-b">
                                  <div className="px-6 py-4">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b text-xs text-muted-foreground">
                                          <th className="px-10 py-2 text-left font-medium">Avatar</th>
                                          <th className="px-3 py-2 text-left font-medium">Caption Position</th>
                                          <th className="px-10 py-2 text-left font-medium">Status</th>
                                          <th className="px-3 py-2 text-left font-medium">Final Video</th>
                                          <th className="px-3 py-2 text-left font-medium">ClickUp</th>
                                          <th className="px-3 py-2 text-left font-medium">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {Array.from(avatarMap.entries()).map(([avatarId, records]) => {
                                          const avatarName = records[0].avatars?.name ?? 'Unknown';
                                          const avatarImage = records[0].avatars?.image_url ?? null;
                                          const finalVideoUrl = records.find(r => r.final_video_url)?.final_video_url ?? null;
                                          const avatarStatus =
                                            records.some(r => r.status === 'processing') ? 'processing'
                                            : records.some(r => r.status === 'merging')  ? 'merging'
                                            : records.some(r => r.status === 'pending')  ? 'pending'
                                            : records.every(r => r.status === 'completed') ? 'completed'
                                            : 'failed';
                                          const regenKey = `${group.generation_id}_${avatarId}`;
                                          const isRegenerating = !!regeneratingAvatars[regenKey];
                                          const isAvatarExpanded = expandedAvatarKey === regenKey;
                                          // Sort records: without-product first, with-product second
                                          const sortedRecords = [...records].sort((a, b) => {
                                            const aIsProduct = a.scenes?.is_product ?? true;
                                            const bIsProduct = b.scenes?.is_product ?? true;
                                            return aIsProduct === bIsProduct ? 0 : aIsProduct ? 1 : -1;
                                          });
                                          return (
                                            <React.Fragment key={avatarId}>
                                              <tr
                                                className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                                                onClick={() => setExpandedAvatarKey(prev => prev === regenKey ? null : regenKey)}
                                              >
                                                <td className="px-3 py-2.5">
                                                  <div className="flex items-center gap-2">
                                                    {avatarImage ? (
                                                      <img src={avatarImage} alt={avatarName} className="h-7 w-7 rounded-full object-cover shrink-0" />
                                                    ) : (
                                                      <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                                                        {avatarName.charAt(0)}
                                                      </div>
                                                    )}
                                                    <span className="font-medium whitespace-nowrap">{avatarName}</span>
                                                  </div>
                                                </td>
                                                <td className="px-3 py-2.5 whitespace-nowrap">
                                                  {(() => {
                                                    const val = records.find(r => r.caption_placement)?.caption_placement;
                                                    if (!val) return <span className="text-xs text-muted-foreground">—</span>;
                                                    const m = /^(top|bottom):(\d+(?:\.\d+)?)$/.exec(val.trim().toLowerCase());
                                                    if (m) return <span className="text-xs capitalize">From {m[1]}: {m[2]}%</span>;
                                                    return <span className="capitalize text-xs">{val}</span>;
                                                  })()}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                  <StatusBadge status={avatarStatus} />
                                                </td>
                                                <td className="px-3 py-2.5">
                                                  {finalVideoUrl ? (
                                                    <a
                                                      href={finalVideoUrl}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      onClick={e => e.stopPropagation()}
                                                      className="flex items-center gap-1 text-primary text-xs hover:underline"
                                                    >
                                                      <ExternalLink className="h-3 w-3" /> Open
                                                    </a>
                                                  ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                                  {(() => {
                                                    const url = records.find(r => r.clickup_url && r.clickup_url !== 'NULL' && r.clickup_url.startsWith('http'))?.clickup_url;
                                                    return url ? (
                                                      <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-primary text-xs hover:underline"
                                                      >
                                                        <ExternalLink className="h-3 w-3" /> Open
                                                      </a>
                                                    ) : (
                                                      <span className="text-xs text-muted-foreground">—</span>
                                                    );
                                                  })()}
                                                </td>
                                                <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                                  <button
                                                    type="button"
                                                    disabled={isRegenerating || group.records.some(r => r.in_pipeline === 'completed')}
                                                    onClick={() => handleRegenerateAvatar(group.generation_id, records)}
                                                    title={group.records.some(r => r.in_pipeline === 'completed') ? 'Cannot regenerate after pipeline push' : 'Regenerate video'}
                                                    className="rounded p-1.5 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                    <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', isRegenerating && 'animate-spin')} />
                                                  </button>
                                                </td>
                                              </tr>

                                              {/* Nested record detail — per with/without product */}
                                              {isAvatarExpanded && (
                                                <tr>
                                                  <td colSpan={6} className="p-0 bg-muted/10 border-b">
                                                    <div className="px-6 py-3">
                                                      <table className="w-full text-xs">
                                                        <thead>
                                                          <tr className="border-b text-muted-foreground">
                                                            <th className="px-8 py-1.5 text-left font-medium">Type</th>
                                                            <th className="px-8 py-1.5 text-left font-medium">Scene</th>
                                                            <th className="px-10 py-1.5 text-left font-medium">Script</th>
                                                            <th className="px-2 py-1.5 text-left font-medium">Script Video</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {sortedRecords.map(rec => (
                                                            <tr key={rec.id} className="border-b last:border-0">
                                                              <td className="px-2 py-2 whitespace-nowrap">
                                                                <span className={cn(
                                                                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                                                  rec.scenes?.is_product
                                                                    ? 'bg-blue-500/10 text-blue-600'
                                                                    : 'bg-orange-500/10 text-orange-600'
                                                                )}>
                                                                  {rec.scenes?.is_product ? 'With Product' : 'Without Product'}
                                                                </span>
                                                              </td>
                                                              <td className="px-2 py-2">
                                                                <div className="flex items-center gap-1.5">
                                                                  {rec.scenes?.image_url ? (
                                                                    <img src={rec.scenes.image_url} alt={rec.scenes.name} className="h-7 w-7 rounded object-cover shrink-0" />
                                                                  ) : (
                                                                    <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0">
                                                                      <Video className="h-3 w-3 text-muted-foreground" />
                                                                    </div>
                                                                  )}
                                                                  <span className="whitespace-nowrap">{rec.scenes?.name ?? '—'}</span>
                                                                </div>
                                                              </td>
                                                              <td className="px-2 py-2 max-w-[200px]">
                                                                <div className="flex items-start gap-1">
                                                                  <p className="text-muted-foreground line-clamp-2 flex-1">{rec.script}</p>
                                                                  <button
                                                                    type="button"
                                                                    onClick={() => { navigator.clipboard.writeText(rec.script); toast.success('Script copied!'); }}
                                                                    className="shrink-0 rounded p-0.5 hover:bg-accent"
                                                                    title="Copy script"
                                                                  >
                                                                    <Copy className="h-3 w-3 text-muted-foreground" />
                                                                  </button>
                                                                </div>
                                                              </td>
                                                              <td className="px-2 py-2">
                                                                {rec.generated_video_url ? (
                                                                  <a
                                                                    href={rec.generated_video_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1 text-primary hover:underline"
                                                                  >
                                                                    <ExternalLink className="h-3 w-3" /> View
                                                                  </a>
                                                                ) : (
                                                                  <span className="text-muted-foreground">—</span>
                                                                )}
                                                              </td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
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
        </TabsContent>
      </Tabs>

      {/* Push to Pipeline dialog */}
      <Dialog open={!!pipelineDialogGroup} onOpenChange={(open) => { if (!open) { setPipelineDialogGroup(null); setPipelineIntendedPlatform('Both'); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Push to Pipeline</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2 mb-3">
            Select the avatars whose videos you want to push to the pipeline.
          </p>
          {pipelineDialogGroup && (() => {
            const avatarMap = new Map<string, LogRecord[]>();
            for (const rec of pipelineDialogGroup.records) {
              if (!avatarMap.has(rec.avatar_id)) avatarMap.set(rec.avatar_id, []);
              avatarMap.get(rec.avatar_id)!.push(rec);
            }
            const avatarEntries = Array.from(avatarMap.entries())
              .map(([avatarId, records]) => ({
                avatarId,
                avatarName: records[0].avatars?.name ?? 'Unknown',
                avatarImage: records[0].avatars?.image_url ?? null,
                finalVideoUrl: records.find(r => r.final_video_url)?.final_video_url ?? null,
              }))
              .filter(a => a.finalVideoUrl);

            return (
              <>
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  {avatarEntries.map(({ avatarId, avatarName, avatarImage, finalVideoUrl }) => {
                    const isSelected = pipelineSelectedAvatarIds.has(avatarId);
                    return (
                      <div
                        key={avatarId}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors select-none',
                          isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                        )}
                        onClick={() => setPipelineSelectedAvatarIds(prev => {
                          const next = new Set(prev);
                          if (next.has(avatarId)) next.delete(avatarId); else next.add(avatarId);
                          return next;
                        })}
                      >
                        <div className={cn(
                          'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                        )}>
                          {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </div>
                        {avatarImage ? (
                          <img src={avatarImage} alt={avatarName} className="h-9 w-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold shrink-0">
                            {avatarName.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{avatarName}</p>
                          {finalVideoUrl && (
                            <a
                              href={finalVideoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-primary hover:underline flex items-center gap-0.5 w-fit"
                            >
                              <ExternalLink className="h-2.5 w-2.5" /> View Video
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t pt-3 mt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Intended Platform</p>
                  <div className="flex items-center gap-4">
                    {(['Meta', 'Applovin', 'Both'] as const).map(platform => (
                      <label key={platform} className="flex items-center gap-1.5 cursor-pointer text-sm select-none">
                        <input
                          type="radio"
                          name="intendedPlatform"
                          value={platform}
                          checked={pipelineIntendedPlatform === platform}
                          onChange={() => setPipelineIntendedPlatform(platform)}
                          className="accent-primary"
                        />
                        {platform}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    disabled={pipelineSelectedAvatarIds.size === 0}
                    onClick={() => handlePushToPipeline(pipelineDialogGroup, pipelineSelectedAvatarIds, pipelineIntendedPlatform)}
                  >
                    Add to Pipeline
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
