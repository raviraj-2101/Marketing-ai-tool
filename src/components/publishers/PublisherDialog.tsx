import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePublishers, Publisher } from "@/hooks/usePublishers";
import { Image } from "lucide-react";

interface PublisherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publisher?: Publisher | null;
}

export const PublisherDialog = ({ open, onOpenChange, publisher }: PublisherDialogProps) => {
  const [name, setName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const { createPublisher, updatePublisher } = usePublishers();
  const isEditing = !!publisher;

  useEffect(() => {
    if (publisher) {
      setName(publisher.name);
      setImagePreview(publisher.image_url);
    } else {
      resetForm();
    }
  }, [publisher, open]);

  const resetForm = () => {
    setName("");
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageChange = (file: File | null) => {
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (isEditing) {
        await updatePublisher.mutateAsync({
          id: publisher.id,
          name,
          imageFile: imageFile || undefined,
          existingImageUrl: imageFile ? null : publisher.image_url,
        });
      } else {
        await createPublisher.mutateAsync({
          name,
          imageFile: imageFile || undefined,
        });
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Publisher" : "Add Publisher"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter publisher name"
              required
            />
          </div>

          {/* Image */}
          <div className="space-y-2">
            <Label>Image</Label>
            <div className="flex items-center gap-4">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="w-16 h-16 object-cover rounded-lg" />
              ) : (
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                  <Image className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageChange(e.target.files?.[0] || null)}
                className="flex-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createPublisher.isPending || updatePublisher.isPending}
            >
              {isEditing ? "Update" : "Add"} Publisher
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
