import { useState, useCallback, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Upload, Wand2, Loader2, Check, Trash2, Image as ImageIcon, X, Pencil, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';

interface Avatar {
  id: string;
  name: string;
  image_url: string;
  description: string | null;
  created_at: string;
  is_configure: boolean;
}

interface GeneratedImageForModal {
  url: string;
  selected: boolean;
}

export default function AvatarGeneration() {
  const { user } = useAuth();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Generator state
  const [inspirationImage, setInspirationImage] = useState<File | null>(null);
  const [inspirationPreview, setInspirationPreview] = useState<string | null>(null);
  const [visualPrompt, setVisualPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  
  // Image preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewImages, setPreviewImages] = useState<GeneratedImageForModal[]>([]);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [maximizedImage, setMaximizedImage] = useState<string | null>(null);
  // Confirm avatar dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [avatarName, setAvatarName] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedImageForSave, setSelectedImageForSave] = useState<string | null>(null);

  // Edit avatar name state
  const [editingAvatarId, setEditingAvatarId] = useState<string | null>(null);
  const [editingAvatarName, setEditingAvatarName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Generated Variations panel state
  const [generatorImages, setGeneratorImages] = useState<string[]>([]);
  const [showSkeletons, setShowSkeletons] = useState(false);
  const [loadingInspirationUrl, setLoadingInspirationUrl] = useState<string | null>(null);
  const [selectedGeneratorImage, setSelectedGeneratorImage] = useState<string | null>(null);
  const [generatorConfirmOpen, setGeneratorConfirmOpen] = useState(false);
  const [generatorAvatarName, setGeneratorAvatarName] = useState('');
  const [generatorSaving, setGeneratorSaving] = useState(false);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationIdRef = useRef<string | null>(null);
  const activeTabRef = useRef<string>('avatars');
  const previewModalWasOpenRef = useRef(false);

  // Store fileIds parallel to generatorImages for save operation
  const [generatorFileIds, setGeneratorFileIds] = useState<string[]>([]);

  const fetchAvatars = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('avatars')
        .select('id, name, image_url, description, created_at, is_configure')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvatars((data as Avatar[]) || []);
    } catch (error) {
      console.error('Error fetching avatars:', error);
      toast.error('Failed to fetch avatars');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    fetchAvatars();

    return () => {
      if (skeletonTimerRef.current) {
        clearTimeout(skeletonTimerRef.current);
      }
      generatorImages.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [user]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setInspirationImage(file);
      const reader = new FileReader();
      reader.onload = () => {
        setInspirationPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
  });

  const uploadImageToStorage = async (file: File | Blob, filename: string): Promise<string> => {
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatar-images')
      .upload(filename, file, {
        contentType: file instanceof File ? file.type : 'image/png',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      throw new Error('Failed to upload image');
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatar-images')
      .getPublicUrl(uploadData.path);

    return publicUrl;
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

  const handleGenerate = async () => {
    if (!inspirationImage && !visualPrompt) {
      toast.error('Please provide an inspiration image or visual prompt');
      return;
    }

    setGenerating(true);
    setGeneratorImages([]);
    setSelectedGeneratorImage(null);
    setLoadingInspirationUrl(inspirationPreview);
    setShowSkeletons(true);

    try {
      // Build FormData payload
      const formData = new FormData();
      if (inspirationImage) {
        formData.append('referenceImage', inspirationImage);
      }
      formData.append('prompt', visualPrompt);
      formData.append('isPromptProvided', String(!!visualPrompt.trim()));

      // Call the generate-avatar API
      const apiResponse = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/generate-avatar`, {
        method: 'POST',
        body: formData,
      });

      if (!apiResponse.ok) {
        throw new Error(`API request failed: ${apiResponse.statusText}`);
      }

      const result = await apiResponse.json();

      if (!result.success) {
        throw new Error(result.message || 'Generation failed');
      }

      const { images } = result.data as {
        images: { fileId: string; fileName: string; index: number }[];
      };

      // Fetch each image blob from Google Drive using OAuth credentials, create object URLs
      const fileIds = images.map((img) => img.fileId);
      const blobs = await Promise.all(fileIds.map((id) => fetchDriveImageBlob(id)));
      const imageUrls = blobs.map((blob) => URL.createObjectURL(blob));

      setGeneratorFileIds(fileIds);
      setGeneratorImages(imageUrls);
      setInspirationImage(null);
      setInspirationPreview(null);
      setVisualPrompt('');
      toast.success(`Generated ${imageUrls.length} avatar variation${imageUrls.length !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error generating avatar:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate avatar variations');
    } finally {
      setGenerating(false);
      setShowSkeletons(false);
      setLoadingInspirationUrl(null);
    }
  };

  const handleSelectPreviewImage = (url: string) => {
    setSelectedPreviewImage(url);
    setPreviewImages(prev => 
      prev.map(img => ({ ...img, selected: img.url === url }))
    );
  };

  const handleDoubleClickImage = (url: string) => {
    previewModalWasOpenRef.current = previewModalOpen;
    if (previewModalOpen) setPreviewModalOpen(false);
    setMaximizedImage(url);
  };

  const handleConfirmAvatar = () => {
    if (!selectedPreviewImage) {
      toast.error('Please select an image first');
      return;
    }
    setSelectedImageForSave(selectedPreviewImage);
    setAvatarName('');
    setPreviewModalOpen(false);
    setConfirmDialogOpen(true);
  };

  // Generator panel: save avatar
  const handleGeneratorSaveAvatar = async () => {
    if (!generatorAvatarName.trim()) {
      toast.error('Please enter an avatar name');
      return;
    }
    if (!selectedGeneratorImage) {
      toast.error('No image selected');
      return;
    }

    setGeneratorSaving(true);
    try {
      // Find the fileId for the selected image
      const selectedIndex = generatorImages.indexOf(selectedGeneratorImage);
      const fileId = generatorFileIds[selectedIndex] ?? Date.now().toString();

      // Fetch image blob from Drive
      const blob = await fetchDriveImageBlob(fileId);

      // Upload to Supabase Storage for a stable permanent URL
      const filename = `generated-avatars/${fileId}-${Date.now()}.png`;
      const storageUrl = await uploadImageToStorage(blob, filename);

      const { data: newAvatar, error } = await supabase
        .from('avatars')
        .insert({
          name: generatorAvatarName.trim(),
          image_url: storageUrl,
          is_configure: false,
        })
        .select()
        .single();

      if (error) throw error;

      await fetch(`${import.meta.env.VITE_SERVER_URL}/api/upload-avatar-to-heygen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_id: newAvatar.id,
          avatar_image_url: storageUrl,
          avatar_name: generatorAvatarName.trim(),
        }),
      });

      toast.success('Avatar saved successfully!');
      setGeneratorConfirmOpen(false);
      generatorImages.forEach((url) => URL.revokeObjectURL(url));
      setGeneratorImages([]);
      setGeneratorFileIds([]);
      setSelectedGeneratorImage(null);
      setGeneratorAvatarName('');
      fetchAvatars();
    } catch (error) {
      console.error('Error saving avatar:', error);
      toast.error('Failed to save avatar');
    } finally {
      setGeneratorSaving(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!avatarName.trim()) {
      toast.error('Please enter an avatar name');
      return;
    }

    if (!selectedImageForSave) {
      toast.error('No image selected');
      return;
    }

    setSaving(true);

    try {
      const { data: newAvatar, error } = await supabase
        .from('avatars')
        .insert({
          name: avatarName.trim(),
          image_url: selectedImageForSave,
          is_configure: false,
        })
        .select()
        .single();

      if (error) throw error;

      await fetch(`${import.meta.env.VITE_SERVER_URL}/api/upload-avatar-to-heygen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_id: newAvatar.id,
          avatar_image_url: selectedImageForSave,
          avatar_name: avatarName.trim(),
        }),
      });

      toast.success('Avatar saved successfully!');
      setConfirmDialogOpen(false);
      setSelectedImageForSave(null);

      // Refresh avatars list
      fetchAvatars();
    } catch (error) {
      console.error('Error saving avatar:', error);
      toast.error('Failed to save avatar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAvatar = async (id: string) => {
    try {
      const { error } = await supabase
        .from('avatars')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Avatar deleted');
      fetchAvatars();
    } catch (error) {
      console.error('Error deleting avatar:', error);
      toast.error('Failed to delete avatar');
    }
  };

  const handleEditAvatarName = (avatar: Avatar) => {
    setEditingAvatarId(avatar.id);
    setEditingAvatarName(avatar.name);
  };

  const handleSaveAvatarName = async () => {
    if (!editingAvatarId || !editingAvatarName.trim()) {
      toast.error('Please enter a valid name');
      return;
    }

    setSavingEdit(true);

    try {
      const { error } = await supabase
        .from('avatars')
        .update({ name: editingAvatarName.trim() })
        .eq('id', editingAvatarId);

      if (error) throw error;

      toast.success('Avatar name updated');
      setEditingAvatarId(null);
      setEditingAvatarName('');
      fetchAvatars();
    } catch (error) {
      console.error('Error updating avatar name:', error);
      toast.error('Failed to update avatar name');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingAvatarId(null);
    setEditingAvatarName('');
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <Badge className="bg-green-600 text-white">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-600 text-white">Processing</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-600 text-white">Cancelled</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString();
  };

  return (
    <DashboardLayout>
    <div className="h-full overflow-y-auto space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Avatar Generation</h1>
        <p className="text-muted-foreground">Create and manage your AI influencer avatars</p>
      </div>

      <Tabs defaultValue="avatars" className="space-y-4" onValueChange={(v) => {
        activeTabRef.current = v;
        // Cancel skeleton timer if user leaves generator tab
        if (v !== 'generator' && skeletonTimerRef.current) {
          clearTimeout(skeletonTimerRef.current);
          skeletonTimerRef.current = null;
          setShowSkeletons(false);
          setLoadingInspirationUrl(null);
        }
      }}>
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="avatars" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Avatars
          </TabsTrigger>
          <TabsTrigger value="generator" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Generator
          </TabsTrigger>
        </TabsList>

        {/* Avatars Tab */}
        <TabsContent value="avatars">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : avatars.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  No avatars yet. Go to the Generator tab to create your first avatar.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {avatars.map((avatar) => (
                <Card key={avatar.id} className="border-border bg-card overflow-hidden">
                  <div className="aspect-square bg-secondary">
                    {avatar.image_url ? (
                      <img
                        src={avatar.image_url}
                        alt={avatar.name}
                        className="w-full h-full object-cover cursor-pointer"
                        onDoubleClick={() => setMaximizedImage(avatar.image_url)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        {editingAvatarId === avatar.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingAvatarName}
                              onChange={(e) => setEditingAvatarName(e.target.value)}
                              className="h-8 text-sm bg-secondary border-border"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveAvatarName();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleSaveAvatarName}
                              disabled={savingEdit}
                              className="h-8 w-8 text-success hover:text-success/80"
                            >
                              {savingEdit ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleCancelEdit}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-semibold text-foreground truncate">{avatar.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {new Date(avatar.created_at).toLocaleDateString()}
                            </p>
                          </>
                        )}
                      </div>
                      {editingAvatarId !== avatar.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditAvatarName(avatar)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAvatar(avatar.id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Generator Tab */}
        <TabsContent value="generator">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Input Configuration */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Input Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Inspiration Image Upload */}
                <div className="space-y-2">
                  <Label className="text-foreground">Inspiration Image</Label>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDragActive
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <input {...getInputProps()} />
                    {inspirationPreview ? (
                      <div className="space-y-2">
                        <img
                          src={inspirationPreview}
                          alt="Inspiration"
                          className="max-h-48 mx-auto rounded-lg"
                        />
                        <p className="text-sm text-muted-foreground">
                          Click or drag to replace
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                        <p className="text-muted-foreground">
                          Drag & drop an image here, or click to select
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG, JPEG, WebP
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Visual Prompt */}
                <div className="space-y-2">
                  <Label htmlFor="visualPrompt" className="text-foreground">
                    Free Form Visual Prompt
                  </Label>
                  <Textarea
                    id="visualPrompt"
                    value={visualPrompt}
                    onChange={(e) => setVisualPrompt(e.target.value)}
                    placeholder="Describe the avatar you want to generate..."
                    className="min-h-32 w-full bg-secondary border-border"
                  />
                </div>

                {/* Generate Button */}
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={generating || (!inspirationImage && !visualPrompt)}
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
                        Generate Avatar Variations
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Right: Generated Variations */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Generated Variations</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col h-[calc(100%-4rem)]">
                {generatorImages.length > 0 ? (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="flex-1 overflow-y-auto min-h-0">
                      <div className="grid grid-cols-3 gap-3">
                        {generatorImages.slice(0, 5).map((url, index) => (
                          <div
                            key={index}
                            className={`relative rounded-lg overflow-hidden cursor-pointer transition-all animate-fade-in ${
                              selectedGeneratorImage === url
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                                : 'hover:opacity-80'
                            }`}
                            style={{ aspectRatio: '9/16' }}
                            onClick={() => setSelectedGeneratorImage(url)}
                            onDoubleClick={() => setMaximizedImage(url)}
                          >
                            <img
                              src={url}
                              alt={`Variation ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {selectedGeneratorImage === url && (
                              <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
                                <Check className="h-4 w-4 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 flex-shrink-0">
                      <Button
                        variant="outline"
                        className="border-border"
                        onClick={() => {
                          generatorImages.forEach((url) => URL.revokeObjectURL(url));
                          setGeneratorImages([]);
                          setGeneratorFileIds([]);
                          setSelectedGeneratorImage(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={!selectedGeneratorImage}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => {
                          setGeneratorAvatarName('');
                          setGeneratorConfirmOpen(true);
                        }}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Confirm Avatar
                      </Button>
                    </div>
                  </div>
                ) : showSkeletons ? (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="overflow-y-auto flex-1 min-h-0">
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '9/16' }}>
                            {loadingInspirationUrl ? (
                              <img
                                src={loadingInspirationUrl}
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
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Generated avatars will appear here
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      {/* Image Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={(open) => { if (!maximizedImage) setPreviewModalOpen(open); }}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Generated Avatar Images</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Double-click to maximize. Click to select an image for your avatar.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {previewImages.map((img, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectPreviewImage(img.url)}
                  onDoubleClick={() => handleDoubleClickImage(img.url)}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all ${
                    img.selected
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'hover:opacity-80'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={`Generated ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {img.selected && (
                    <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 bg-black/50 rounded px-2 py-1">
                    <span className="text-xs text-white">Image {index + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewModalOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAvatar}
              disabled={!selectedPreviewImage}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Check className="mr-2 h-4 w-4" />
              Confirm Avatar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maximized Image Modal */}
      {maximizedImage && (
        <ImagePreviewModal imageUrl={maximizedImage} onClose={() => {
          setMaximizedImage(null);
          if (previewModalWasOpenRef.current) {
            setPreviewModalOpen(true);
          }
          previewModalWasOpenRef.current = false;
        }} />
      )}

      {/* Confirm Avatar Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Save Avatar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedImageForSave && (
              <div className="aspect-square max-w-48 mx-auto rounded-lg overflow-hidden">
                <img
                  src={selectedImageForSave}
                  alt="Selected avatar"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="avatarName" className="text-foreground">Avatar Name</Label>
              <Input
                id="avatarName"
                value={avatarName}
                onChange={(e) => setAvatarName(e.target.value)}
                placeholder="Enter a unique name for this avatar"
                className="bg-secondary border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAvatar}
              disabled={saving || !avatarName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Avatar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generator Confirm Avatar Dialog */}
      <Dialog open={generatorConfirmOpen} onOpenChange={setGeneratorConfirmOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Save Avatar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedGeneratorImage && (
              <div className="aspect-square max-w-48 mx-auto rounded-lg overflow-hidden">
                <img
                  src={selectedGeneratorImage}
                  alt="Selected avatar"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="generatorAvatarName" className="text-foreground">Avatar Name</Label>
              <Input
                id="generatorAvatarName"
                value={generatorAvatarName}
                onChange={(e) => setGeneratorAvatarName(e.target.value)}
                placeholder="Enter a unique name for this avatar"
                className="bg-secondary border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGeneratorConfirmOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGeneratorSaveAvatar}
              disabled={generatorSaving || !generatorAvatarName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {generatorSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Avatar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
