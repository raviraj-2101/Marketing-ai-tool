import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ImageSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  images: string[];
  isLoading: boolean;
  expectedCount: number;
  onSave: (selectedImage: string, name: string) => Promise<void>;
  nameLabel?: string;
  namePlaceholder?: string;
}

export function ImageSelectionDialog({
  open,
  onOpenChange,
  title,
  images,
  isLoading,
  expectedCount,
  onSave,
  nameLabel = "Name",
  namePlaceholder = "Enter a unique name",
}: ImageSelectionDialogProps) {
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedImage || !name.trim()) return;

    setIsSaving(true);
    try {
      await onSave(selectedImage, name.trim());
      handleReset();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedImage("");
    setName("");
  };

  const skeletonCount = isLoading ? expectedCount : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Image Grid */}
          <div className="space-y-2">
            <Label>Select an Image</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Show skeletons while loading */}
              {Array.from({ length: skeletonCount }).map((_, index) => (
                <Skeleton
                  key={`skeleton-${index}`}
                  className="aspect-square rounded-lg"
                />
              ))}

              {/* Show actual images */}
              {images.map((image, index) => (
                <div
                  key={index}
                  className={cn(
                    "relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                    selectedImage === image
                      ? "border-primary ring-2 ring-primary"
                      : "border-transparent hover:border-muted-foreground/50"
                  )}
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image}
                    alt={`Generated ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === image && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Name Input - only show when image is selected */}
          {selectedImage && (
            <div className="space-y-2">
              <Label htmlFor="name">{nameLabel} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={namePlaceholder}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedImage || !name.trim() || isSaving || isLoading}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
