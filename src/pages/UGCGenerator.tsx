import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ImagePlus, Clapperboard, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import {
  useAvatars,
  useCreateAvatar,
  useDeleteAvatar,
  Avatar,
} from "@/hooks/useAvatars";
import {
  useScenes,
  useCreateScene,
  useDeleteScene,
} from "@/hooks/useScenes";

import { AvatarGenerationForm } from "@/components/ugc/AvatarGenerationForm";
import { SceneGenerationForm } from "@/components/ugc/SceneGenerationForm";
import { ImageSelectionDialog } from "@/components/ugc/ImageSelectionDialog";
import { AvatarGrid } from "@/components/ugc/AvatarGrid";
import { SceneGrid } from "@/components/ugc/SceneGrid";

interface PendingGeneration {
  id: string;
  type: "avatar" | "scene";
  variantCount: number;
  images: string[];
  avatarId?: string;
}

const UGCGenerator = () => {
  const [activeTab, setActiveTab] = useState<string>("avatars");
  const [showAvatarForm, setShowAvatarForm] = useState(false);
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [selectedAvatarForScene, setSelectedAvatarForScene] = useState<Avatar | null>(null);
  const [pendingGeneration, setPendingGeneration] = useState<PendingGeneration | null>(null);
  const [showSelectionDialog, setShowSelectionDialog] = useState(false);

  const { data: avatars = [], isLoading: avatarsLoading } = useAvatars();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const createAvatar = useCreateAvatar();
  const deleteAvatar = useDeleteAvatar();
  const createScene = useCreateScene();
  const deleteScene = useDeleteScene();

  // Subscribe to realtime updates for generations
  useEffect(() => {
    if (!pendingGeneration) return;

    const tableName = pendingGeneration.type === "avatar" ? "avatar_generations" : "scene_generations";

    const channel = supabase
      .channel(`${tableName}-${pendingGeneration.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: tableName,
          filter: `id=eq.${pendingGeneration.id}`,
        },
        (payload) => {
          const newData = payload.new as { status: string; result_images: string[] };
          if (newData.status === "completed" && newData.result_images?.length > 0) {
            setPendingGeneration((prev) =>
              prev ? { ...prev, images: newData.result_images } : null
            );
            setShowSelectionDialog(true);
          } else if (newData.status === "failed") {
            toast({
              title: "Generation failed",
              description: "The image generation failed. Please try again.",
              variant: "destructive",
            });
            setPendingGeneration(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pendingGeneration]);

  const handleAvatarGenerationStarted = (generationId: string, variantCount: number) => {
    setPendingGeneration({
      id: generationId,
      type: "avatar",
      variantCount,
      images: [],
    });
    setShowSelectionDialog(true);
  };

  const handleSceneGenerationStarted = (generationId: string, variantCount: number) => {
    if (!selectedAvatarForScene) return;
    setPendingGeneration({
      id: generationId,
      type: "scene",
      variantCount,
      images: [],
      avatarId: selectedAvatarForScene.id,
    });
    setShowSelectionDialog(true);
  };

  const handleSaveAvatar = async (selectedImage: string, name: string) => {
    // Upload base64 image to storage
    const base64Data = selectedImage.replace(/^data:image\/\w+;base64,/, "");
    const fileName = `${crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("avatar-images")
      .upload(fileName, decode(base64Data), {
        contentType: "image/png",
      });

    if (uploadError) {
      toast({
        title: "Upload failed",
        description: uploadError.message,
        variant: "destructive",
      });
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from("avatar-images")
      .getPublicUrl(fileName);

    await createAvatar.mutateAsync({
      name,
      image_url: urlData.publicUrl,
      reference_image_url: undefined,
      description: undefined,
    });

    setPendingGeneration(null);
  };

  const handleSaveScene = async (selectedImage: string, name: string) => {
    if (!pendingGeneration?.avatarId) return;

    // Upload base64 image to storage
    const base64Data = selectedImage.replace(/^data:image\/\w+;base64,/, "");
    const fileName = `${crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("scene-images")
      .upload(fileName, decode(base64Data), {
        contentType: "image/png",
      });

    if (uploadError) {
      toast({
        title: "Upload failed",
        description: uploadError.message,
        variant: "destructive",
      });
      throw uploadError;
    }

    const { data: urlData } = supabase.storage
      .from("scene-images")
      .getPublicUrl(fileName);

    await createScene.mutateAsync({
      avatar_id: pendingGeneration.avatarId,
      name,
      image_url: urlData.publicUrl,
    });

    setPendingGeneration(null);
    setSelectedAvatarForScene(null);
  };

  const handleCreateScene = (avatar: Avatar) => {
    setSelectedAvatarForScene(avatar);
    setShowSceneForm(true);
  };

  const handleDeleteAvatar = (id: string) => {
    if (confirm("Are you sure you want to delete this avatar? All associated scenes will also be deleted.")) {
      deleteAvatar.mutate(id);
    }
  };

  const handleDeleteScene = (id: string) => {
    if (confirm("Are you sure you want to delete this scene?")) {
      deleteScene.mutate(id);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">UGC Generator</h1>
            <p className="text-muted-foreground">
              Generate AI avatars and scenes for your content
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="avatars" className="gap-2">
              <Users className="w-4 h-4" />
              Avatar Generation
            </TabsTrigger>
            <TabsTrigger value="scenes" className="gap-2">
              <Clapperboard className="w-4 h-4" />
              Scene Generation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="avatars" className="space-y-6 mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Avatars</CardTitle>
                  <CardDescription>
                    Create and manage your AI-generated avatars
                  </CardDescription>
                </div>
                <Button onClick={() => setShowAvatarForm(true)}>
                  <ImagePlus className="w-4 h-4 mr-2" />
                  Create Avatar
                </Button>
              </CardHeader>
              <CardContent>
                <AvatarGrid
                  avatars={avatars}
                  isLoading={avatarsLoading}
                  onDelete={handleDeleteAvatar}
                  onCreateScene={handleCreateScene}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scenes" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Scenes</CardTitle>
                <CardDescription>
                  Create scenes using your saved avatars. Select an avatar from the Avatars tab to create a scene.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SceneGrid
                  scenes={scenes}
                  avatars={avatars}
                  isLoading={scenesLoading}
                  onDelete={handleDeleteScene}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Avatar Generation Form */}
      <AvatarGenerationForm
        open={showAvatarForm}
        onOpenChange={setShowAvatarForm}
        onGenerationStarted={handleAvatarGenerationStarted}
      />

      {/* Scene Generation Form */}
      {selectedAvatarForScene && (
        <SceneGenerationForm
          open={showSceneForm}
          onOpenChange={(open) => {
            setShowSceneForm(open);
            if (!open) setSelectedAvatarForScene(null);
          }}
          selectedAvatar={selectedAvatarForScene}
          onGenerationStarted={handleSceneGenerationStarted}
        />
      )}

      {/* Image Selection Dialog */}
      {pendingGeneration && (
        <ImageSelectionDialog
          open={showSelectionDialog}
          onOpenChange={(open) => {
            setShowSelectionDialog(open);
            if (!open) setPendingGeneration(null);
          }}
          title={
            pendingGeneration.type === "avatar"
              ? "Select Avatar Image"
              : "Select Scene Image"
          }
          images={pendingGeneration.images}
          isLoading={pendingGeneration.images.length === 0}
          expectedCount={pendingGeneration.variantCount}
          onSave={
            pendingGeneration.type === "avatar"
              ? handleSaveAvatar
              : handleSaveScene
          }
          nameLabel={
            pendingGeneration.type === "avatar" ? "Avatar Name" : "Scene Name"
          }
          namePlaceholder={
            pendingGeneration.type === "avatar"
              ? "Enter a unique avatar name"
              : "Enter a unique scene name"
          }
        />
      )}
    </DashboardLayout>
  );
};

// Helper function to decode base64
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export default UGCGenerator;
