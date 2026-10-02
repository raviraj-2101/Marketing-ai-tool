import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Download, Trash2, RefreshCw } from "lucide-react";
import { StaticsLog } from "@/hooks/useStaticsLogs";

interface DriveImage {
  id: string;
  name: string;
  thumbnailLink: string | null;
  webContentLink: string | null;
  mimeType: string;
}

interface EditImagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: StaticsLog | null;
  onRegenerate: (log: StaticsLog) => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const proxyThumb = (fileId: string) =>
  `${SUPABASE_URL}/functions/v1/drive-proxy-image?fileId=${encodeURIComponent(fileId)}`;

const EditImagesDialog = ({ open, onOpenChange, log, onRegenerate }: EditImagesDialogProps) => {
  const { getToken } = useAuth();
  const [images, setImages] = useState<DriveImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<DriveImage | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open && (log?.images_folder_link || log?.image_generation_drive_link)) {
      fetchImages();
    }
    if (!open) {
      setImages([]);
      setSelectedIds(new Set());
    }
  }, [open, log?.images_folder_link, log?.image_generation_drive_link]);

  const fetchImages = async () => {
    const driveLink = log?.images_folder_link || log?.image_generation_drive_link;
    if (!driveLink) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("drive-list-images", {
        body: { drive_link: driveLink },
      });
      if (error) throw error;
      setImages(data?.images || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to load images", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === images.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(images.map((i) => i.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "No images selected", description: "Select images to delete", variant: "destructive" });
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("drive-delete-images", {
        body: { file_ids: Array.from(selectedIds) },
      });
      if (error) throw error;
      const failed = data?.results?.filter((r: any) => !r.success) || [];
      if (failed.length > 0) {
        toast({ title: "Partial delete", description: `${failed.length} file(s) failed to delete` });
      } else {
        toast({ title: "Deleted", description: `${selectedIds.size} image(s) deleted successfully` });
      }
      setSelectedIds(new Set());
      await fetchImages();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete images", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async () => {
    const ids = Array.from(selectedIds);
    const names = images.filter((i) => selectedIds.has(i.id)).map((i) => i.name);

    setDownloading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/drive-download-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({ file_ids: ids, file_names: names }),
      });

      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `images_${String(log?.ad_id || 0).padStart(6, "0")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "ZIP file downloaded successfully" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to download images", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerate = () => {
    if (log) {
      onRegenerate(log);
      onOpenChange(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Images — Ad #{String(log?.ad_id || 0).padStart(6, "0")}</DialogTitle>
            <DialogDescription>View, select, and manage generated images from Google Drive</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : images.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No images found in this Drive folder.</div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Checkbox
                    checked={selectedIds.size === images.length && images.length > 0}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} of ${images.length} selected` : "Select all"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className={`relative border rounded-lg overflow-hidden cursor-pointer transition-all ${
                        selectedIds.has(img.id) ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
                      }`}
                      onClick={() => toggleSelect(img.id)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setPreviewLoading(true);
                        setPreviewImage(img);
                      }}
                    >
                      <div className="absolute top-2 left-2 z-10">
                        <Checkbox
                          checked={selectedIds.has(img.id)}
                          onCheckedChange={() => toggleSelect(img.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <img
                        src={proxyThumb(img.id)}
                        alt={img.name}
                        className="w-full aspect-square object-cover"
                        loading="lazy"
                      />
                      <div className="p-1.5">
                        <p className="text-xs truncate text-muted-foreground">{img.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 flex flex-row gap-2 justify-between sm:justify-between">
            <div className="flex gap-2">
              {/* <Button variant="outline" size="sm" onClick={handleRegenerate}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Regenerate
              </Button> */}
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={selectedIds.size === 0 || deleting}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Delete ({selectedIds.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={downloading || selectedIds.size === 0}
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Download className="w-4 h-4 mr-1" />
                )}
                Download ({selectedIds.size})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* <Dialog open={!!previewImage} onOpenChange={(o) => { if (!o) setPreviewImage(null); }}>
      <DialogContent className="w-auto max-w-[95vw] max-h-[95vh] p-2">
        <DialogDescription className="sr-only">Full size image preview</DialogDescription>
        <div className="flex items-center justify-center overflow-hidden min-h-[200px] relative">
          {previewLoading && <Loader2 className="w-8 h-8 animate-spin text-muted-foreground absolute" />}
          <img
            src={previewImage?.thumbnailLink?.replace("=s220", "=s1600") || ""}
            alt={previewImage?.name}
            className={`max-w-full max-h-[75vh] object-contain transition-opacity ${previewLoading ? "opacity-0" : "opacity-100"}`}
            onLoad={() => setPreviewLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog> */}
      <Dialog
        open={!!previewImage}
        onOpenChange={(o) => {
          if (!o) setPreviewImage(null);
        }}
      >
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[80vh] p-2 [&>button]:bg-white [&>button]:rounded-full [&>button]:shadow-md [&>button]:hover:bg-slate-100">
          <DialogDescription className="sr-only">Full size image preview</DialogDescription>
          {/* 1:1 square container — width matches height so aspect ratio is preserved */}
          <div className="relative w-full aspect-square flex items-center justify-center bg-slate-100 rounded-lg overflow-hidden">
            {previewLoading && <Loader2 className="w-8 h-8 animate-spin text-muted-foreground absolute" />}
            <img
              src={previewImage?.thumbnailLink?.replace("=s220", "=s1600") || ""}
              alt={previewImage?.name}
              className={`max-w-full max-h-full object-contain transition-opacity duration-200 ${previewLoading ? "opacity-0" : "opacity-100"}`}
              onLoad={() => setPreviewLoading(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditImagesDialog;
