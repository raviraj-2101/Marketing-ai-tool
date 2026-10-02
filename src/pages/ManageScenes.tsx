import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';

import { useNavigate, useParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Loader2,
  Film,
  ArrowLeft,
  Plus,
  Upload,
  Wand2,
  Check,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  X,
  Pencil,
  Sparkles
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { Badge } from '@/components/ui/badge';

interface Avatar {
  id: string;
  name: string;
  image_url: string | null;
}

interface Scene {
  id: string;
  name: string;
  image_url: string | null;
  prompt: string | null;
  updated_at: string;
  is_product: boolean;
}

interface GeneratedScene {
  url: string;
  selected: boolean;
}

interface SceneLog {
  id: string;
  avatar_id: string;
  avatar_name?: string;
  avatar_image_url?: string;
  name: string;
  image_url: string;
  prompt: string | null;
  created_at: string;
}

export default function ManageScenes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { avatarId } = useParams<{ avatarId: string }>();
  
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selected avatar for scene management
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
  
  // Scene creation state
  const [creatingScene, setCreatingScene] = useState(false);
  const [inspirationImage, setInspirationImage] = useState<File | null>(null);
  const [inspirationPreview, setInspirationPreview] = useState<string | null>(null);
  const [scenePrompt, setScenePrompt] = useState('');
  const [sceneNameInput, setSceneNameInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedScenes, setGeneratedScenes] = useState<GeneratedScene[]>([]);
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  // Scene Preview panel state (mirrors Avatar Generator variations panel)
  const [scenePreviewImages, setScenePreviewImages] = useState<string[]>([]);
  const [sceneFileIds, setSceneFileIds] = useState<string[]>([]);
  const [showSceneSkeletons, setShowSceneSkeletons] = useState(false);
  const [loadingSceneInspirationUrl, setLoadingSceneInspirationUrl] = useState<string | null>(null);
  const [selectedSceneWithout, setSelectedSceneWithout] = useState<string | null>(null);
  const [selectedSceneWith, setSelectedSceneWith] = useState<string | null>(null);
  const [scenePreviewConfirmOpen, setScenePreviewConfirmOpen] = useState(false);
  const [scenePreviewName, setScenePreviewName] = useState('');
  const [scenePreviewSaving, setScenePreviewSaving] = useState(false);
  const sceneSkeletonTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Avatar selection in scene form
  const [formAvatarId, setFormAvatarId] = useState<string>('');

  // Save dialog (legacy - used when approving inline generated scenes)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit scene name state
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState('');

  // Variant mode
  const [variantSourceScene, setVariantSourceScene] = useState<Scene | null>(null);

  // Product data inputs
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [productPrompt, setProductPrompt] = useState('');

  // With-product preview panel state
  const [scenePreviewImagesWithProduct, setScenePreviewImagesWithProduct] = useState<string[]>([]);
  const [sceneFileIdsWithProduct, setSceneFileIdsWithProduct] = useState<string[]>([]);

  // Fullscreen image modal
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<{
    sceneName?: string;
    input?: string;
    productInput?: string;
  }>({});

  // Scene Logs state
  const [sceneLogs, setSceneLogs] = useState<SceneLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [maximizedImage, setMaximizedImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('scenes');

  const fetchAvatars = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('avatars')
        .select('id, name, image_url')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvatars(data || []);

      if (avatarId && data) {
        const avatar = data.find(a => a.id === avatarId);
        if (avatar) {
          setSelectedAvatar(avatar);
        }
      }
    } catch (error) {
      console.error('Error fetching avatars:', error);
      toast.error('Failed to fetch avatars');
    } finally {
      setLoading(false);
    }
  };

  const fetchScenes = async () => {
    if (!selectedAvatar) return;

    try {
      const { data, error } = await supabase
        .from('scenes')
        .select('id, name, image_url, prompt, updated_at, is_product')
        .eq('avatar_id', selectedAvatar.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setScenes(data || []);
    } catch (error) {
      console.error('Error fetching scenes:', error);
      toast.error('Failed to fetch scenes');
    }
  };

  // Fetch scene logs from the scenes table
  const fetchSceneLogs = async (showToastOnError = false) => {
    try {
      const { data: scenesData, error: scenesError } = await supabase
        .from('scenes')
        .select('id, avatar_id, name, image_url, prompt, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (scenesError) throw scenesError;

      const avatarIds = [...new Set((scenesData || []).map(s => s.avatar_id))];
      const { data: avatarsData } = await supabase
        .from('avatars')
        .select('id, name, image_url')
        .in('id', avatarIds);

      const avatarMap = new Map(avatarsData?.map(a => [a.id, a]) || []);

      const processedLogs: SceneLog[] = (scenesData || []).map(scene => ({
        ...scene,
        avatar_name: avatarMap.get(scene.avatar_id)?.name || 'Unknown',
        avatar_image_url: avatarMap.get(scene.avatar_id)?.image_url || null,
      }));

      setSceneLogs(processedLogs);
    } catch (error) {
      console.error('Error fetching scene logs:', error);
      if (showToastOnError) {
        toast.error('Failed to fetch scene logs');
      }
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchAvatars();
    fetchSceneLogs(true);

    return () => {
      if (sceneSkeletonTimerRef.current) {
        clearTimeout(sceneSkeletonTimerRef.current);
      }
      scenePreviewImages.forEach((url) => URL.revokeObjectURL(url));
      scenePreviewImagesWithProduct.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [user]);

  useEffect(() => {
    if (selectedAvatar) {
      fetchScenes();
    }
  }, [selectedAvatar]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setInspirationImage(file);
      const reader = new FileReader();
      reader.onload = () => {
        setInspirationPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      // Clear validation error when image is added
      if (validationErrors.input) {
        setValidationErrors(prev => ({ ...prev, input: undefined }));
      }
    }
  }, [validationErrors.input]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
  });

  const onProductDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setProductImage(file);
      const reader = new FileReader();
      reader.onload = () => setProductImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      if (validationErrors.productInput) {
        setValidationErrors(prev => ({ ...prev, productInput: undefined }));
      }
    }
  }, [validationErrors.productInput]);

  const { getRootProps: getProductRootProps, getInputProps: getProductInputProps, isDragActive: isProductDragActive } = useDropzone({
    onDrop: onProductDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
  });

  const handleManageScenes = (avatar: Avatar) => {
    navigate(`/video-builder/manage-scenes/${avatar.id}`);
    setSelectedAvatar(avatar);
  };

  const handleBack = () => {
    if (creatingScene) {
      setCreatingScene(false);
      resetSceneForm();
    } else {
      setSelectedAvatar(null);
      navigate('/video-builder/manage-scenes');
    }
  };

  const resetSceneForm = () => {
    setInspirationImage(null);
    setInspirationPreview(null);
    setScenePrompt('');
    setSceneNameInput('');
    setProductImage(null);
    setProductImagePreview(null);
    setProductPrompt('');
    setGeneratedScenes([]);
    setSelectedScene(null);
    setValidationErrors({});
    setVariantSourceScene(null);
    scenePreviewImages.forEach((url) => URL.revokeObjectURL(url));
    setScenePreviewImages([]);
    setSceneFileIds([]);
    scenePreviewImagesWithProduct.forEach((url) => URL.revokeObjectURL(url));
    setScenePreviewImagesWithProduct([]);
    setSceneFileIdsWithProduct([]);
    setShowSceneSkeletons(false);
    setLoadingSceneInspirationUrl(null);
    setSelectedSceneWithout(null);
    setSelectedSceneWith(null);
    if (sceneSkeletonTimerRef.current) {
      clearTimeout(sceneSkeletonTimerRef.current);
      sceneSkeletonTimerRef.current = null;
    }
  };

  const validateForm = (): boolean => {
    const errors: { sceneName?: string; input?: string; productInput?: string } = {};

    if (!sceneNameInput.trim()) {
      errors.sceneName = 'Scene name is required';
    }

    if (!inspirationImage && !scenePrompt.trim()) {
      errors.input = 'Please provide either a reference image or a scene prompt';
    }

    if (!productImage && !productPrompt.trim()) {
      errors.productInput = 'Please provide either a product image or a product prompt';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const fetchDriveImageBlob = async (fileId: string): Promise<Blob> => {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-drive-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ fileId }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Failed to fetch image: ${res.status}`);
    }
    return res.blob();
  };

  const handleGenerateScene = async () => {
    if (!validateForm()) {
      if (validationErrors.sceneName) toast.error(validationErrors.sceneName);
      else if (validationErrors.input) toast.error(validationErrors.input);
      else if (validationErrors.productInput) toast.error(validationErrors.productInput);
      return;
    }

    const workingAvatarId = formAvatarId || selectedAvatar?.id;
    const workingAvatar = workingAvatarId ? avatars.find(a => a.id === workingAvatarId) : selectedAvatar;

    if (!workingAvatar || !user) {
      toast.error('Please select an avatar');
      return;
    }
    if (!variantSourceScene && !workingAvatar.image_url) {
      toast.error('Selected avatar does not have a confirmed image.');
      return;
    }

    setGenerating(true);
    setScenePreviewImages([]);
    setSceneFileIds([]);
    setSelectedSceneWithout(null);
    setSelectedSceneWith(null);
    setShowSceneSkeletons(true);
    setLoadingSceneInspirationUrl(inspirationPreview);

    try {
      const formData = new FormData();
      formData.append('isPromptProvided', String(!!scenePrompt.trim()));
      if (scenePrompt.trim()) formData.append('scene_prompt', scenePrompt.trim());
      if (productPrompt.trim()) formData.append('product_prompt', productPrompt.trim());
      if (productImage) formData.append('productImage', productImage);

      const avatarImageUrl = variantSourceScene?.image_url || workingAvatar.image_url;
      if (avatarImageUrl) {
        const imgRes = await fetch(avatarImageUrl);
        const imgBlob = await imgRes.blob();
        formData.append('avatarImage', new File([imgBlob], 'avatar.png', { type: imgBlob.type || 'image/png' }));
      }
      if (inspirationImage) formData.append('referenceImage', inspirationImage);

      const apiResponse = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/generate-scene`, {
        method: 'POST',
        body: formData,
      });

      if (!apiResponse.ok) throw new Error(`API request failed: ${apiResponse.statusText}`);

      const result = await apiResponse.json();
      if (!result.success) throw new Error(result.message || 'Generation failed');

      const { sceneImages, productImages } = result.data as {
        sceneImages: { fileId: string; fileName: string; index: number }[];
        productImages: { fileId: string; fileName: string; index: number }[];
      };

      const [sceneBlobs, productBlobs] = await Promise.all([
        Promise.all(sceneImages.map(img => fetchDriveImageBlob(img.fileId))),
        Promise.all(productImages.map(img => fetchDriveImageBlob(img.fileId))),
      ]);

      setSceneFileIds(sceneImages.map(img => img.fileId));
      setScenePreviewImages(sceneBlobs.map(blob => URL.createObjectURL(blob)));
      setSceneFileIdsWithProduct(productImages.map(img => img.fileId));
      setScenePreviewImagesWithProduct(productBlobs.map(blob => URL.createObjectURL(blob)));

      const totalCount = sceneBlobs.length + productBlobs.length;

      setSceneNameInput('');
      setScenePrompt('');
      setInspirationImage(null);
      setInspirationPreview(null);
      setProductImage(null);
      setProductImagePreview(null);
      setProductPrompt('');
      setValidationErrors({});

      toast.success(`Generated ${totalCount} scene variation${totalCount !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error generating scene:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate scene');
    } finally {
      setGenerating(false);
      setShowSceneSkeletons(false);
      setLoadingSceneInspirationUrl(null);
    }
  };

  const handleSelectScene = (url: string) => {
    setSelectedScene(url);
    setGeneratedScenes(prev => 
      prev.map(scene => ({ ...scene, selected: scene.url === url }))
    );
  };

  const handleApproveScene = () => {
    if (!selectedScene) {
      toast.error('Please select a scene first');
      return;
    }
    // Pre-fill with the scene name from the form
    setSceneName(sceneNameInput.trim());
    setSaveDialogOpen(true);
  };

  // Scene Preview panel: save scene
  const handleScenePreviewSave = async () => {
    if (!scenePreviewName.trim()) {
      toast.error('Please enter a scene name');
      return;
    }
    if (!selectedSceneWithout || !selectedSceneWith || !selectedAvatar || !user) return;

    setScenePreviewSaving(true);
    try {
      const safeAvatarName = selectedAvatar.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const ts = Date.now();
      const sceneGroupId = crypto.randomUUID();

      const uploadImage = async (fileId: string | undefined, fallbackUrl: string, suffix: string): Promise<string> => {
        if (!fileId) return fallbackUrl;
        const blob = await fetchDriveImageBlob(fileId);
        const fileName = `${user.id}/${safeAvatarName}_${suffix}_${fileId}_${ts}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('scene-images')
          .upload(fileName, blob, { contentType: 'image/png', upsert: false });
        if (uploadError) throw new Error(`Failed to upload ${suffix} image`);
        return supabase.storage.from('scene-images').getPublicUrl(uploadData.path).data.publicUrl;
      };

      const withoutFileId = sceneFileIds[scenePreviewImages.indexOf(selectedSceneWithout)];
      const withFileId = sceneFileIdsWithProduct[scenePreviewImagesWithProduct.indexOf(selectedSceneWith)];

      const [withoutImageUrl, withImageUrl] = await Promise.all([
        uploadImage(withoutFileId, selectedSceneWithout, 'scene'),
        uploadImage(withFileId, selectedSceneWith, 'scene_product'),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: insertedRows, error } = await (supabase
        .from('scenes')
        .insert([
          { avatar_id: selectedAvatar.id, name: scenePreviewName.trim(), image_url: withoutImageUrl, scene_group_id: sceneGroupId, is_product: false },
          { avatar_id: selectedAvatar.id, name: scenePreviewName.trim(), image_url: withImageUrl,    scene_group_id: sceneGroupId, is_product: true  },
        ] as any)
        .select('id, is_product') as any);

      if (error) throw error;

      // HeyGen fire-and-forget for both rows
      const rowImageMap: Record<string, { image_url: string; is_product: boolean }> = {};
      if (insertedRows) {
        for (const r of insertedRows as { id: string; is_product: boolean }[]) {
          rowImageMap[r.id] = { image_url: r.is_product ? withImageUrl : withoutImageUrl, is_product: r.is_product };
        }
        for (const [rowId, { image_url: imgUrl, is_product }] of Object.entries(rowImageMap)) {
          fetch(`${import.meta.env.VITE_SERVER_URL}/api/upload-to-heygen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scene_id: rowId,
              image_url: imgUrl,
              scene_name: scenePreviewName.trim(),
              is_product,
            }),
          })
            .then(res => res.json())
            .then(data => {
              if (!data.success) console.error('HeyGen avatar creation failed:', data);
            })
            .catch(err => console.error('HeyGen avatar creation failed:', err));
        }
      }

      toast.success('Scene saved successfully!');
      setScenePreviewConfirmOpen(false);
      scenePreviewImages.forEach((url) => URL.revokeObjectURL(url));
      setScenePreviewImages([]);
      setSceneFileIds([]);
      scenePreviewImagesWithProduct.forEach((url) => URL.revokeObjectURL(url));
      setScenePreviewImagesWithProduct([]);
      setSceneFileIdsWithProduct([]);
      setSelectedSceneWithout(null);
      setSelectedSceneWith(null);
      setScenePreviewName('');
      setActiveTab('scenes');
      fetchScenes();
    } catch (error) {
      console.error('Error saving scene:', error);
      toast.error('Failed to save scene');
    } finally {
      setScenePreviewSaving(false);
    }
  };

  const handleSaveScene = async () => {
    if (!sceneName.trim()) {
      toast.error('Please enter a scene name');
      return;
    }

    if (!selectedAvatar || !user || !selectedScene) return;

    setSaving(true);

    try {
      let sceneImageUrl = selectedScene;

      // If the selected scene is base64, upload it to storage to get a URL
      if (selectedScene.startsWith('data:')) {
        // Convert base64 to blob
        const response = await fetch(selectedScene);
        const blob = await response.blob();
        
        // Generate unique filename using avatar name
        const safeAvatarName = selectedAvatar.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileName = `${user.id}/${safeAvatarName}_scene_${Date.now()}.png`;
        
        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('scene-images')
          .upload(fileName, blob, {
            contentType: 'image/png',
            upsert: false,
          });

        if (uploadError) {
          console.error('Error uploading scene image:', uploadError);
          throw new Error('Failed to upload scene image');
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('scene-images')
          .getPublicUrl(uploadData.path);

        sceneImageUrl = publicUrl;
        console.log('Scene image uploaded, URL:', sceneImageUrl);
      }

      const { error } = await supabase
        .from('scenes')
        .insert({
          avatar_id: selectedAvatar.id,
          name: sceneName.trim(),
          prompt: scenePrompt || null,
          image_url: sceneImageUrl,
        });

      if (error) throw error;

      toast.success('Scene saved successfully!');
      setSaveDialogOpen(false);
      setCreatingScene(false);
      resetSceneForm();
      fetchScenes();
    } catch (error) {
      console.error('Error saving scene:', error);
      toast.error('Failed to save scene');
    } finally {
      setSaving(false);
    }
  };

  // Handle fullscreen image modal close with ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenImage) {
        setFullscreenImage(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenImage]);

  const handleDoubleClickImage = (url: string) => {
    setFullscreenImage(url);
  };

  const handleDeleteScene = async (id: string) => {
    try {
      const { error } = await supabase
        .from('scenes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Scene deleted');
      fetchScenes();
    } catch (error) {
      console.error('Error deleting scene:', error);
      toast.error('Failed to delete scene');
    }
  };

  const handleEditSceneName = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setEditingSceneName(scene.name);
  };

  const handleSaveSceneName = async (sceneId: string) => {
    if (!editingSceneName.trim()) {
      toast.error('Scene name cannot be empty');
      return;
    }

    try {
      const { error } = await supabase
        .from('scenes')
        .update({ name: editingSceneName.trim() })
        .eq('id', sceneId);

      if (error) throw error;
      
      toast.success('Scene name updated');
      setEditingSceneId(null);
      setEditingSceneName('');
      fetchScenes();
    } catch (error) {
      console.error('Error updating scene name:', error);
      toast.error('Failed to update scene name');
    }
  };

  const handleCancelEditSceneName = () => {
    setEditingSceneId(null);
    setEditingSceneName('');
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Scene Creation View
  if (selectedAvatar && creatingScene) {
    return (
      <DashboardLayout>
      <div className="h-full overflow-y-auto space-y-6 p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Create New Scene — {selectedAvatar.name}
            </h1>
            <p className="text-muted-foreground">Generate a new scene for this avatar</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Scene Configuration */}
          <Card className="border-border bg-card flex flex-col h-full">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-foreground">Scene Configuration</CardTitle>
              {variantSourceScene && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />
                    Generating variant of: {variantSourceScene.name}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setVariantSourceScene(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6 overflow-y-auto flex-1 min-h-0">
              {/* Avatar Selection */}
              <div className="space-y-2">
                <Label htmlFor="formAvatarId" className="text-foreground">
                  Avatar <span className="text-destructive">*</span>
                </Label>
                <select
                  id="formAvatarId"
                  value={formAvatarId}
                  onChange={(e) => setFormAvatarId(e.target.value)}
                  className="w-full h-10 px-3 py-2 bg-secondary border border-border rounded-md text-foreground text-sm"
                >
                  <option value="">Select an avatar</option>
                  {avatars.map((avatar) => (
                    <option key={avatar.id} value={avatar.id}>
                      {avatar.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scene Name Input */}
              <div className="space-y-2">
                <Label htmlFor="sceneNameInput" className="text-foreground">
                  Scene Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sceneNameInput"
                  value={sceneNameInput}
                  onChange={(e) => {
                    setSceneNameInput(e.target.value);
                    if (validationErrors.sceneName && e.target.value.trim()) {
                      setValidationErrors(prev => ({ ...prev, sceneName: undefined }));
                    }
                  }}
                  placeholder="Enter a name for this scene"
                  className={`bg-secondary border-border w-full ${validationErrors.sceneName ? 'border-destructive' : ''}`}
                />
                {validationErrors.sceneName && (
                  <p className="text-sm text-destructive">{validationErrors.sceneName}</p>
                )}
              </div>

              {/* Reference Data Card */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                <p className="text-sm font-semibold text-foreground">Reference Data</p>

                <div className="space-y-2">
                  <Label className="text-foreground">Inspirational Image</Label>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors w-full ${
                      isDragActive
                        ? 'border-primary bg-primary/5'
                        : validationErrors.input && !inspirationImage
                          ? 'border-destructive'
                          : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <input {...getInputProps()} />
                    {inspirationPreview ? (
                      <div className="space-y-2">
                        <img
                          src={inspirationPreview}
                          alt="Inspiration"
                          className="max-h-40 mx-auto rounded-lg"
                        />
                        <p className="text-sm text-muted-foreground">Click or drag to replace</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">Drag & drop or click to upload</p>
                        <p className="text-xs text-muted-foreground">PNG, JPG, JPEG, WebP</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scenePrompt" className="text-foreground">Scene Prompt</Label>
                  <Textarea
                    id="scenePrompt"
                    value={scenePrompt}
                    onChange={(e) => {
                      setScenePrompt(e.target.value);
                      if (validationErrors.input && e.target.value.trim()) {
                        setValidationErrors(prev => ({ ...prev, input: undefined }));
                      }
                    }}
                    placeholder="Describe the scene you want to generate..."
                    className={`min-h-24 w-full bg-secondary border-border ${validationErrors.input && !scenePrompt.trim() ? 'border-destructive' : ''}`}
                  />
                </div>

                {validationErrors.input && (
                  <p className="text-sm text-destructive">{validationErrors.input}</p>
                )}
              </div>

              {/* Product Data Card */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                <p className="text-sm font-semibold text-foreground">Product Data</p>

                <div className="space-y-2">
                  <Label className="text-foreground">Product Image</Label>
                  <div
                    {...getProductRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors w-full ${
                      isProductDragActive
                        ? 'border-primary bg-primary/5'
                        : validationErrors.productInput && !productImage
                          ? 'border-destructive'
                          : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <input {...getProductInputProps()} />
                    {productImagePreview ? (
                      <div className="space-y-2">
                        <img
                          src={productImagePreview}
                          alt="Product"
                          className="max-h-40 mx-auto rounded-lg"
                        />
                        <p className="text-sm text-muted-foreground">Click or drag to replace</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">Drag & drop or click to upload</p>
                        <p className="text-xs text-muted-foreground">PNG, JPG, JPEG, WebP</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="productPrompt" className="text-foreground">Product Prompt</Label>
                  <Textarea
                    id="productPrompt"
                    value={productPrompt}
                    onChange={(e) => {
                      setProductPrompt(e.target.value);
                      if (validationErrors.productInput && e.target.value.trim()) {
                        setValidationErrors(prev => ({ ...prev, productInput: undefined }));
                      }
                    }}
                    placeholder="Describe the product in this scene..."
                    className={`min-h-24 w-full bg-secondary border-border ${validationErrors.productInput && !productPrompt.trim() ? 'border-destructive' : ''}`}
                  />
                </div>

                {validationErrors.productInput && (
                  <p className="text-sm text-destructive">{validationErrors.productInput}</p>
                )}
              </div>

              {/* Generate Button */}
              <div className="flex justify-center pt-4">
                <Button
                  onClick={handleGenerateScene}
                  disabled={generating}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-8"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-4 w-4" />
                      Generate Preview
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: Scene Preview */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Scene Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col h-[calc(100vh-5rem)] min-h-0">
              {(scenePreviewImages.length > 0 || scenePreviewImagesWithProduct.length > 0) ? (
                <div className="flex flex-col h-full min-h-0">
                  {/* Without Product — top half, independent scroll */}
                  <div className="flex-1 min-h-0 flex flex-col border-b border-border pb-3">
                    <p className="text-sm font-semibold text-foreground mb-2 flex-shrink-0">Without Product Images</p>
                    {scenePreviewImages.length > 0 ? (
                      <div className="flex gap-3 flex-1 min-h-0">
                        {scenePreviewImages.map((url, index) => (
                          <div
                            key={index}
                            className={`flex-1 relative rounded-lg overflow-hidden cursor-pointer transition-all animate-fade-in ${
                              selectedSceneWithout === url
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                                : 'hover:opacity-80'
                            }`}
                            onClick={() => setSelectedSceneWithout(url)}
                            onDoubleClick={() => handleDoubleClickImage(url)}
                          >
                            <img
                              src={url}
                              alt={`Scene ${index + 1}`}
                              className="w-full h-full object-contain"
                            />
                            {selectedSceneWithout === url && (
                              <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
                                <Check className="h-4 w-4 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No images generated</p>
                    )}
                  </div>

                  {/* With Product Images — bottom half, independent scroll */}
                  <div className="flex-1 min-h-0 flex flex-col pt-3">
                    <p className="text-sm font-semibold text-foreground mb-2 flex-shrink-0">With Product Images</p>
                    {scenePreviewImagesWithProduct.length > 0 ? (
                      <div className="flex gap-3 flex-1 min-h-5">
                        {scenePreviewImagesWithProduct.map((url, index) => (
                          <div
                            key={index}
                            className={`flex-1 relative rounded-lg overflow-hidden cursor-pointer transition-all animate-fade-in ${
                              selectedSceneWith === url
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                                : 'hover:opacity-80'
                            }`}
                            onClick={() => setSelectedSceneWith(url)}
                            onDoubleClick={() => handleDoubleClickImage(url)}
                          >
                            <img
                              src={url}
                              alt={`Scene with product ${index + 1}`}
                              className="w-full h-full object-contain"
                            />
                            {selectedSceneWith === url && (
                              <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
                                <Check className="h-4 w-4 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No images generated</p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-4 flex-shrink-0">
                    <Button
                      variant="outline"
                      className="border-border"
                      onClick={() => {
                        scenePreviewImages.forEach((url) => URL.revokeObjectURL(url));
                        scenePreviewImagesWithProduct.forEach((url) => URL.revokeObjectURL(url));
                        setScenePreviewImages([]);
                        setSceneFileIds([]);
                        setScenePreviewImagesWithProduct([]);
                        setSceneFileIdsWithProduct([]);
                        setSelectedSceneWithout(null);
                        setSelectedSceneWith(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!selectedSceneWithout || !selectedSceneWith}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => {
                        setScenePreviewName('');
                        setScenePreviewConfirmOpen(true);
                      }}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Confirm Scene
                    </Button>
                  </div>
                </div>
              ) : showSceneSkeletons ? (
                <div className="flex flex-col h-full min-h-0">
                  {/* Skeleton: Without Product — top half */}
                  <div className="flex-1 min-h-0 flex flex-col border-b border-border pb-3">
                    <p className="text-sm font-semibold text-foreground mb-2 flex-shrink-0">Without Product</p>
                    <div className="flex gap-3 flex-1 min-h-0">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex-1 relative rounded-lg overflow-hidden">
                          {loadingSceneInspirationUrl ? (
                            <img
                              src={loadingSceneInspirationUrl}
                              alt="Loading placeholder"
                              className="w-full h-full object-cover blur-lg scale-110"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted animate-pulse" />
                          )}
                          <div className="absolute inset-0 bg-background/40" />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-shimmer" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-background/60 backdrop-blur-sm rounded-full p-3">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Skeleton: With Product Images — bottom half */}
                  <div className="flex-1 min-h-0 flex flex-col pt-3">
                    <p className="text-sm font-semibold text-foreground mb-2 flex-shrink-0">With Product Images</p>
                    <div className="flex gap-3 flex-1 min-h-0">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex-1 relative rounded-lg overflow-hidden">
                          <div className="w-full h-full bg-muted animate-pulse" />
                          <div className="absolute inset-0 bg-background/40" />
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-shimmer" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-background/60 backdrop-blur-sm rounded-full p-3">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center flex-1">
                  <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Generated scene previews will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Scene Preview Confirm Modal */}
        <Dialog open={scenePreviewConfirmOpen} onOpenChange={setScenePreviewConfirmOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Save Scene</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-lg overflow-hidden" style={{ aspectRatio: '3/4' }}>
                    {selectedSceneWithout && (
                      <img
                        src={selectedSceneWithout}
                        alt="Without product"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Without Product</p>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-lg overflow-hidden" style={{ aspectRatio: '3/4' }}>
                    {selectedSceneWith && (
                      <img
                        src={selectedSceneWith}
                        alt="With product"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">With Product</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scenePreviewName" className="text-foreground">Scene Name</Label>
                <Input
                  id="scenePreviewName"
                  value={scenePreviewName}
                  onChange={(e) => setScenePreviewName(e.target.value)}
                  placeholder="Enter a name for this scene"
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setScenePreviewConfirmOpen(false)}
                className="border-border"
              >
                Cancel
              </Button>
              <Button
                onClick={handleScenePreviewSave}
                disabled={scenePreviewSaving || !scenePreviewName.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {scenePreviewSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Scene'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Save Scene Dialog (legacy from old inline generated scenes) */}
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Save Scene</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedScene && (
                <div className="aspect-video max-w-sm mx-auto rounded-lg overflow-hidden">
                  <img
                    src={selectedScene}
                    alt="Selected scene"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="sceneName" className="text-foreground">Scene Name</Label>
                <Input
                  id="sceneName"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  placeholder="Enter a name for this scene"
                  className="bg-secondary border-border"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSaveDialogOpen(false)}
                className="border-border"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveScene}
                disabled={saving || !sceneName.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Scene'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Fullscreen Image Modal */}
        <ImagePreviewModal imageUrl={fullscreenImage} onClose={() => setFullscreenImage(null)} />
      </div>
      </DashboardLayout>
    );
  }

  // Scenes List View (for selected avatar) with Scene Logs tab
  if (selectedAvatar) {
    return (
      <DashboardLayout>
      <div className="h-full overflow-y-auto space-y-6 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Manage Scenes — {selectedAvatar.name}
              </h1>
              <p className="text-muted-foreground">Create and manage scenes for this avatar</p>
            </div>
          </div>
          <Button
            onClick={() => {
              setFormAvatarId(selectedAvatar?.id ?? '');
              setCreatingScene(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create New Scene
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-secondary border border-border">
            <TabsTrigger value="scenes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Scenes
            </TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Scene Logs
            </TabsTrigger>
          </TabsList>

          {/* Scenes Tab */}
          <TabsContent value="scenes">
            {scenes.length === 0 ? (
              <Card className="border-border bg-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Film className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    No scenes yet. Create your first scene for this avatar.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border bg-card">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">Preview</TableHead>
                        <TableHead className="text-muted-foreground">Name</TableHead>
                        <TableHead className="text-muted-foreground">Type</TableHead>
                        <TableHead className="text-muted-foreground">Last Updated</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scenes.map((scene) => (
                        <TableRow key={scene.id} className="border-border">
                          <TableCell>
                            {scene.image_url ? (
                              <img
                                src={scene.image_url}
                                alt={scene.name}
                                className="h-12 w-20 rounded object-cover cursor-pointer"
                                onDoubleClick={() => setFullscreenImage(scene.image_url)}
                              />
                            ) : (
                              <div className="h-12 w-20 rounded bg-secondary flex items-center justify-center">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {editingSceneId === scene.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingSceneName}
                                  onChange={(e) => setEditingSceneName(e.target.value)}
                                  className="bg-secondary border-border h-8 w-40"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveSceneName(scene.id);
                                    } else if (e.key === 'Escape') {
                                      handleCancelEditSceneName();
                                    }
                                  }}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleSaveSceneName(scene.id)}
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={handleCancelEditSceneName}
                                  className="h-8 w-8 text-muted-foreground hover:bg-muted"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              scene.name
                            )}
                          </TableCell>
                          <TableCell>
                            {scene.is_product ? (
                              <Badge variant="secondary" className="text-xs">With Product</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Without Product</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(scene.updated_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setFormAvatarId(selectedAvatar?.id ?? '');
                                  setVariantSourceScene(scene);
                                  setSceneNameInput(`${scene.name} - Variant`);
                                  setScenePrompt(scene.prompt || '');
                                  setCreatingScene(true);
                                }}
                                className="h-8 w-8 text-primary hover:bg-primary/10"
                                title="Generate Variant"
                              >
                                <Sparkles className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditSceneName(scene)}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteScene(scene.id)}
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Scene Logs Tab */}
          <TabsContent value="logs">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Scene History</CardTitle>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : sceneLogs.filter(log => log.avatar_id === selectedAvatar.id).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-muted-foreground">
                      No scenes yet. Create a new scene to get started.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border">
                          <TableHead className="text-muted-foreground">Scene Image</TableHead>
                          <TableHead className="text-muted-foreground">Name</TableHead>
                          <TableHead className="text-muted-foreground">Prompt</TableHead>
                          <TableHead className="text-muted-foreground">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sceneLogs
                          .filter(log => log.avatar_id === selectedAvatar.id)
                          .map((log) => (
                            <TableRow key={log.id} className="border-border">
                              <TableCell>
                                {log.image_url ? (
                                  <img
                                    src={log.image_url}
                                    alt={log.name}
                                    className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80"
                                    onClick={() => setFullscreenImage(log.image_url)}
                                  />
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-foreground font-medium">
                                {log.name}
                              </TableCell>
                              <TableCell className="max-w-48">
                                <p className="text-sm text-foreground truncate" title={log.prompt || ''}>
                                  {log.prompt || '-'}
                                </p>
                              </TableCell>
                              <TableCell className="text-sm text-foreground">
                                {formatDateTime(log.created_at).split(',')[0]}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>


        {/* Fullscreen Image Modal */}
        <ImagePreviewModal imageUrl={fullscreenImage} onClose={() => setFullscreenImage(null)} />
      </div>
      </DashboardLayout>
    );
  }

  // Avatar Selection View
  return (
    <DashboardLayout>
    <div className="h-full overflow-y-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manage Scenes</h1>
        <p className="text-muted-foreground">Select an avatar to manage its scenes</p>
      </div>

      {avatars.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No avatars found. Create an avatar first to manage scenes.
            </p>
            <Button
              onClick={() => navigate('/video-builder/avatar-generation')}
              className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Go to Avatar Generation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Avatar</TableHead>
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avatars.map((avatar) => (
                  <TableRow key={avatar.id} className="border-border">
                    <TableCell>
                      {avatar.image_url ? (
                        <img
                          src={avatar.image_url}
                          alt={avatar.name}
                          className="h-10 w-10 rounded-full object-cover cursor-pointer"
                          onDoubleClick={() => setFullscreenImage(avatar.image_url)}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {avatar.name}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleManageScenes(avatar)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Film className="mr-2 h-4 w-4" />
                        Manage Scenes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <ImagePreviewModal imageUrl={fullscreenImage} onClose={() => setFullscreenImage(null)} />
    </div>
    </DashboardLayout>
  );
}
