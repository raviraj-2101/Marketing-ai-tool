import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pipelineApiRequest as apiRequest } from "@/lib/queryClient";
import { Loader2, Link2, UploadCloud, AlertTriangle } from "lucide-react";
import type { GeneratedImage } from "@/lib/approvedTray";

const MAX_BYTES = 25 * 1024 * 1024; // keep in step with the server cap

// pipelineApiRequest throws `"<status>: <body>"`; pull out the server's {error}.
function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /\{.*"error"\s*:\s*"([^"]+)"/.exec(raw);
  return m ? m[1] : raw.replace(/^\d+:\s*/, "");
}

export function AddImageDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (image: GeneratedImage) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setUrl("");
    setError(null);
    setBusy(false);
    setDragActive(false);
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };

  const submit = async (body: { url: string } | { dataUrl: string; filename: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/tsl/add-image", body);
      const data = (await res.json()) as GeneratedImage;
      onAdded(data);
      close();
    } catch (err) {
      setError(cleanError(err));
      setBusy(false);
    }
  };

  const addFromUrl = () => {
    const v = url.trim();
    if (!v || busy) return;
    void submit({ url: v });
  };

  const addFile = (file: File) => {
    if (busy) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image too large (max 25 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => void submit({ dataUrl: String(reader.result), filename: file.name });
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md" data-testid="add-image-dialog">
        <DialogHeader>
          <DialogTitle>Add an image</DialogTitle>
          <DialogDescription>
            Paste a link or upload a file. We save our own copy, so it lands in the tray
            just like a generated image — and the original link can't break it later.
          </DialogDescription>
        </DialogHeader>

        {/* Paste a link */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
            <Link2 className="size-3.5" /> From a link
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFromUrl();
                }
              }}
              placeholder="https://…/image.jpg"
              disabled={busy}
              data-testid="add-image-url"
            />
            <Button type="button" size="sm" onClick={addFromUrl} disabled={busy || !url.trim()} data-testid="add-image-url-submit">
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        {/* Upload / drop a file */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) addFile(file);
          }}
          disabled={busy}
          className={
            "w-full rounded-lg border border-dashed p-6 flex flex-col items-center justify-center gap-1.5 text-center transition-colors disabled:opacity-60 " +
            (dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30")
          }
          data-testid="add-image-dropzone"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <UploadCloud className="size-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Click to upload, or drag &amp; drop</span>
          <span className="text-[11px] text-muted-foreground">PNG, JPG, WebP — up to 25 MB</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) addFile(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive" data-testid="add-image-error">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
