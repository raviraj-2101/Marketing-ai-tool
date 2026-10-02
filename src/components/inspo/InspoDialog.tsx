import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useInspos, Inspo } from "@/hooks/useInspos";
import { toast } from "sonner";
import { ExternalLink, FolderPlus, Upload, X, Loader2 } from "lucide-react";

interface InspoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspo?: Inspo | null;
}

const FUNNEL_OPTIONS = [
  { value: "onbrand", label: "Onbrand" },
  { value: "comparison", label: "Comparison" },
  { value: "adv", label: "Adv" },
  { value: "tsl", label: "TSL" },
];

const FUNNEL_OPTIONS_NEW = [
  { value: "onbrand", label: "Onbrand" },
  { value: "comparison", label: "Comparison" },
  { value: "tsl", label: "TSL" },
  { value: "adv", label: "ADV" },
];

type Mode = "existing" | "new";

export const InspoDialog = ({ open, onOpenChange, inspo }: InspoDialogProps) => {
  // Existing flow state
  const [name, setName] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const [funnelTypes, setFunnelTypes] = useState<string[]>(["onbrand"]);

  // New folder flow state
  const [mode, setMode] = useState<Mode>("existing");
  const [newFunnelType, setNewFunnelType] = useState("onbrand");
  const [folderName, setFolderName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = uploadedFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [uploadedFiles]);

  const { createInspo, updateInspo } = useInspos();
  const isEditing = !!inspo;

  useEffect(() => {
    if (inspo) {
      setName(inspo.name);
      setDriveLink(inspo.drive_link);
      setFunnelTypes(inspo.funnel_type?.length ? inspo.funnel_type : ["onbrand"]);
    } else {
      setName("");
      setDriveLink("");
      setFunnelTypes(["onbrand"]);
    }
    setMode("existing");
    setNewFunnelType("onbrand");
    setFolderName("");
    setUploadedFiles([]);
  }, [inspo, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !driveLink.trim() || funnelTypes.length === 0) return;
    try {
      if (isEditing) {
        await updateInspo.mutateAsync({ id: inspo.id, name, drive_link: driveLink, funnel_type: funnelTypes });
      } else {
        await createInspo.mutateAsync({ name, drive_link: driveLink, funnel_type: funnelTypes });
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  const openLink = () => {
    if (driveLink) window.open(driveLink, "_blank", "noopener,noreferrer");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setUploadedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        return [...prev, ...newFiles.filter((f) => !existingNames.has(f.name))];
      });
      e.target.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim() || uploadedFiles.length === 0) return;
    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append("folder_name", folderName);
      formData.append("funnel", newFunnelType);
      uploadedFiles.forEach((file) => formData.append("images", file));

      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/create-inspo-folder`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const { folder_url } = await res.json();

      // Switch to "Use Existing" and pre-fill with the created folder details
      setName(folderName);
      setDriveLink(folder_url);
      setFunnelTypes([newFunnelType]);
      setMode("existing");
      toast.success("Folder created! Review details and click Add Inspo to save.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create folder";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Inspo" : "Add Inspo"}</DialogTitle>
        </DialogHeader>

        {/* Mode toggle — only shown when adding */}
        {!isEditing && (
          <div className="flex rounded-lg border border-border bg-muted/40 p-1 gap-1">
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "new"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create New Inspo Folder
            </button>
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "existing"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Use Existing Inspo Folder
            </button>
          </div>
        )}

        {/* Use Existing flow — unchanged */}
        {(isEditing || mode === "existing") && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Inspo Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter inspo name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Funnel Type</Label>
              <div className="flex flex-col gap-2">
                {FUNNEL_OPTIONS.map((opt) => {
                  const checked = funnelTypes.includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          if (c) {
                            setFunnelTypes((prev) => [...prev, opt.value]);
                          } else {
                            setFunnelTypes((prev) => prev.filter((v) => v !== opt.value));
                          }
                        }}
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="driveLink">Link to Drive</Label>
              <div className="flex gap-2">
                <Input
                  id="driveLink"
                  value={driveLink}
                  onChange={(e) => setDriveLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={openLink}
                  disabled={!driveLink}
                  title="Open link in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInspo.isPending || updateInspo.isPending}>
                {isEditing ? "Update" : "Add"} Inspo
              </Button>
            </div>
          </form>
        )}

        {/* Create New Inspo Folder flow */}
        {!isEditing && mode === "new" && (
          <div className="space-y-4">
            {/* Funnel Type */}
            <div className="space-y-2">
              <Label>Funnel Type</Label>
              <div className="flex flex-wrap gap-2">
                {FUNNEL_OPTIONS_NEW.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewFunnelType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      newFunnelType === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Google Folder Name */}
            <div className="space-y-2">
              <Label htmlFor="folderName">Google Folder Name</Label>
              <Input
                id="folderName"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Enter folder name"
              />
            </div>

            {/* Upload Inspo Images */}
            <div className="space-y-2">
              <Label>Upload Inspo Images</Label>
              <div
                className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  {uploadedFiles.length > 0
                    ? `${uploadedFiles.length} image${uploadedFiles.length !== 1 ? "s" : ""} selected · Click to add more`
                    : "Click to upload images"}
                </p>
              </div>
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {previewUrls.map((url, i) => (
                    <div
                      key={i}
                      className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group"
                    >
                      <img
                        src={url}
                        alt={uploadedFiles[i].name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleRemoveFile(i); }}
                        className="absolute top-0.5 right-0.5 z-10 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateFolder}
                disabled={!folderName.trim() || uploadedFiles.length === 0 || isCreating}
              >
                {isCreating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
                  : <><FolderPlus className="w-4 h-4 mr-2" />Create Folder</>
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
