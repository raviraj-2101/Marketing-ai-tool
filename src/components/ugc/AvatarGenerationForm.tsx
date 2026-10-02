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
import { Loader2, Upload, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCreateAvatarGeneration } from "@/hooks/useAvatars";

interface AvatarGenerationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerationStarted: (generationId: string, variantCount: number) => void;
}

export function AvatarGenerationForm({
  open,
  onOpenChange,
  onGenerationStarted,
}: AvatarGenerationFormProps) {
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>("");
  const [variantCount, setVariantCount] = useState<number>(4);
  const [description, setDescription] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createGeneration = useCreateAvatarGeneration();

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
    if (!referenceImage) {
      toast({
        title: "Missing reference image",
        description: "Please upload a reference image.",
        variant: "destructive",
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Missing description",
        description: "Please provide a text description.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload reference image to storage
      const fileExt = referenceImage.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `reference/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatar-images")
        .upload(filePath, referenceImage);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatar-images")
        .getPublicUrl(filePath);

      const referenceImageUrl = urlData.publicUrl;

      // Create generation record
      const generation = await createGeneration.mutateAsync({
        variant_count: variantCount,
        reference_image_url: referenceImageUrl,
        description: description,
      });

      // Trigger n8n workflow via edge function
      const { data, error } = await supabase.functions.invoke("execute-avatar-generation", {
        body: {
          generation_id: generation.id,
          reference_image_url: referenceImageUrl,
          variant_count: variantCount,
          description: description,
        },
      });

      if (error) throw error;

      toast({
        title: "Generation started",
        description: data?.message || "Avatar generation is in progress...",
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
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="w-5 h-5" />
            Create New Avatar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reference Image Upload */}
          <div className="space-y-2">
            <Label>Reference Image *</Label>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4">
              {referenceImagePreview ? (
                <div className="relative">
                  <img
                    src={referenceImagePreview}
                    alt="Reference"
                    className="w-full h-48 object-contain rounded-md"
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
                <label className="flex flex-col items-center justify-center h-32 cursor-pointer">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
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

          {/* Text Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Text Description *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the avatar you want to generate..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Generate Avatars
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
