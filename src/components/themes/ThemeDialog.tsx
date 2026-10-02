import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Theme, ThemeFormData } from "@/hooks/useThemes";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme?: Theme | null;
  onSubmit: (data: ThemeFormData) => void;
  isLoading: boolean;
}

export const ThemeDialog = ({ open, onOpenChange, theme, onSubmit, isLoading }: ThemeDialogProps) => {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (theme) {
      setName(theme.name);
      setContent(theme.content || "");
    } else {
      setName("");
      setContent("");
    }
  }, [theme, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, content });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{theme ? "Edit Theme" : "Add Theme"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Theme Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter theme name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Enter theme content..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? "Saving..." : theme ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
