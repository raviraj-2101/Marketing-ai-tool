import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Upload, Clapperboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCreateSceneGeneration } from "@/hooks/useScenes";
import { Avatar } from "@/hooks/useAvatars";

interface SceneGenerationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAvatar: Avatar;
  onGenerationStarted: (generationId: string, variantCount: number) => void;
}

export function SceneGenerationForm({
  open,
  onOpenChange,
  selectedAvatar,
  onGenerationStarted,
}: SceneGenerationFormProps) {
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>("");
  const [variantCount, setVariantCount] = useState<number>(4);
  const [prompt, setPrompt] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createGeneration = useCreateSceneGeneration();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Missing prompt",
        description: "Please provide a prompt for the scene.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let referenceImageUrl: string | undefined;

      // Upload reference image if provided
      if (referenceImage) {
        const fileExt = referenceImage.name.split(".").pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `reference/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("scene-images")
          .upload(filePath, referenceImage);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("scene-images")
          .getPublicUrl(filePath);

        referenceImageUrl = urlData.publicUrl;
      }

      // Create generation record
      const generation = await createGeneration.mutateAsync({
        avatar_id: selectedAvatar.id,
        variant_count: variantCount,
        reference_image_url: referenceImageUrl,
        prompt: prompt,
      });

      // Trigger n8n workflow via edge function
      const { data, error } = await supabase.functions.invoke("execute-scene-generation", {
        body: {
          generation_id: generation.id,
          avatar_id: selectedAvatar.id,
          avatar_image_url: selectedAvatar.image_url,
          avatar_name: selectedAvatar.name,
          reference_image_url: referenceImageUrl,
          variant_count: variantCount,
          prompt: prompt,
        },
      });

      if (error) throw error;

      toast({
        title: "Generation started",
        description: data?.message || "Scene generation is in progress...",
      });

      onGenerationStarted(generation.id, variantCount);
      handleReset();
      onOpenChange(false);
    } catch (error) {
      console.error("Error starting generation:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start generation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setReferenceImage(null);
    setReferenceImagePreview("");
    setVariantCount(4);
    setPrompt("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="w-5 h-5" />
            Create Scene for "{selectedAvatar.name}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Avatar Preview */}
          <div className="space-y-2">
            <Label>Selected Avatar</Label>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <img
                src={selectedAvatar.image_url}
                alt={selectedAvatar.name}
                className="w-16 h-16 object-cover rounded-md"
              />
              <div>
                <p className="font-medium">{selectedAvatar.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedAvatar.description || "No description"}
                </p>
              </div>
            </div>
          </div>

          {/* Reference Image Upload */}
          <div className="space-y-2">
            <Label>Reference Image (Optional)</Label>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4">
              {referenceImagePreview ? (
                <div className="relative">
                  <img
                    src={referenceImagePreview}
                    alt="Reference"
                    className="w-full h-32 object-contain rounded-md"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setReferenceImage(null);
                      setReferenceImagePreview("");
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-24 cursor-pointer">
                  <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload reference image
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt *</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the scene you want to generate..."
              rows={4}
            />
          </div>

          {/* Number of Variants */}
          <div className="space-y-2">
            <Label htmlFor="variantCount">Number of Variants *</Label>
            <Input
              id="variantCount"
              type="number"
              min={1}
              max={10}
              value={variantCount}
              onChange={(e) => setVariantCount(parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Generate Scenes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
