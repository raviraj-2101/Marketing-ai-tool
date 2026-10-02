import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { UploadCloud, FileVideo, Loader2, ExternalLink, RefreshCcw } from "lucide-react";

type Category = { id: string; title: string; parent: string };

type Step = "form" | "processing" | "review" | "publishing" | "done" | "error";

type Draft = {
  duration_seconds: number;
  transcript: string;
  analysis: {
    visual_subject?: string;
    setting?: string;
    audio_role?: string;
    on_screen_text_role?: string;
    shot_sequence?: string[];
    opening_hook_first_5_seconds?: string;
    on_screen_caption_opening?: string;
    speaker?: string;
    voiceover_present?: boolean;
    closing_shot?: string;
    production_tier?: string;
    template_signature?: string;
    structural_pattern?: string;
    title?: string;
    category_fit_description?: string;
    suggested_ad_format?: string;
  };
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NEW_CATEGORY_VALUE = "__new__";

export function AddAdToBankDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { getToken } = useAuth();
  const pipelineBaseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL || import.meta.env.VITE_SERVER_URL;

  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [brand, setBrand] = useState("");
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [pageName, setPageName] = useState("");
  const [adId, setAdId] = useState("");
  const [notes, setNotes] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");

  const [jobId, setJobId] = useState<string>("");
  const [progress, setProgress] = useState<{ step: string; message: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [editedTranscript, setEditedTranscript] = useState("");
  const [editedHook, setEditedHook] = useState("");
  const [editedCaption, setEditedCaption] = useState("");
  const [editedSpeaker, setEditedSpeaker] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedCategoryFit, setEditedCategoryFit] = useState("");

  const [publishResult, setPublishResult] = useState<{ scriptPageUrl?: string; commitMessage?: string } | null>(null);

  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      resetDialog();
      return;
    }
    loadCategoriesAndBrands();
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetDialog() {
    stopPolling();
    setStep("form");
    setError("");
    setFile(null);
    setBrand("");
    setPageName("");
    setAdId("");
    setNotes("");
    setCategoryId("");
    setNewCategoryName("");
    setNewCategoryDesc("");
    setJobId("");
    setProgress(null);
    setDraft(null);
    setPublishResult(null);
  }

  function stopPolling() {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  async function loadCategoriesAndBrands() {
    try {
      const [catRes, brandRes] = await Promise.all([
        fetch(`${pipelineBaseUrl}/api/adbank/categories`, { headers: { Authorization: `Bearer ${getToken()}` } }),
        fetch(`${pipelineBaseUrl}/api/adbank/brands`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (brandRes.ok) setBrandSuggestions(await brandRes.json());
    } catch (err) {
      console.warn("[adbank dialog] failed to load categories/brands", err);
    }
  }

  function pickFile(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("video/") && !f.name.toLowerCase().endsWith(".mp4")) {
      toast({ title: "Wrong file type", description: "Please upload an MP4 video." });
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 200 MB. Try compressing first." });
      return;
    }
    setFile(f);
  }

  function validateForm(): string | null {
    if (!file) return "Pick a video file first.";
    if (!brand.trim()) return "Brand is required.";
    if (!categoryId) return "Choose a category (or pick 'New category').";
    if (categoryId === NEW_CATEGORY_VALUE && !newCategoryName.trim()) return "Type a name for the new category.";
    return null;
  }

  async function submitIngest() {
    const validationError = validateForm();
    if (validationError) {
      toast({ title: "Missing field", description: validationError });
      return;
    }
    setError("");
    setStep("processing");
    setProgress({ step: "uploading", message: "Uploading video…" });

    const fd = new FormData();
    fd.append("video", file!);
    fd.append("brand", brand.trim());
    if (pageName.trim()) fd.append("page_name", pageName.trim());
    if (adId.trim()) fd.append("ad_id", adId.trim());
    if (notes.trim()) fd.append("notes", notes.trim());
    if (categoryId === NEW_CATEGORY_VALUE) {
      fd.append("new_category_name", newCategoryName.trim());
      if (newCategoryDesc.trim()) fd.append("new_category_desc", newCategoryDesc.trim());
    } else {
      fd.append("category_id", categoryId);
    }

    try {
      const res = await fetch(`${pipelineBaseUrl}/api/adbank/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      setJobId(json.jobId);
      pollJob(json.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  function pollJob(id: string, expectStatus: "ready_for_review" | "done" = "ready_for_review") {
    stopPolling();
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`${pipelineBaseUrl}/api/adbank/job/${id}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const j = await res.json();
        if (j.progress) setProgress(j.progress);
        if (j.status === "failed" || j.status === "failed_publish") {
          stopPolling();
          setError(j.error || "Pipeline failed.");
          setStep("error");
          return;
        }
        if (j.status === expectStatus) {
          stopPolling();
          if (expectStatus === "ready_for_review") {
            setDraft(j.draft);
            seedEditFields(j.draft);
            setStep("review");
          } else {
            setPublishResult(j.publish || null);
            setStep("done");
          }
        }
      } catch (err) {
        console.warn("[adbank poll] error", err);
      }
    }, 3000);
  }

  function seedEditFields(d: Draft) {
    setEditedTranscript(d.transcript || "");
    const a = d.analysis || {};
    setEditedHook(a.opening_hook_first_5_seconds || "");
    setEditedCaption(a.on_screen_caption_opening || "");
    setEditedSpeaker(a.speaker || "");
    setEditedTitle(a.title || "");
    setEditedCategoryFit(a.category_fit_description || "");
  }

  async function submitPublish() {
    if (!jobId) return;
    setError("");
    setStep("publishing");
    setProgress({ step: "publishing", message: "Publishing to ad bank…" });
    try {
      const res = await fetch(`${pipelineBaseUrl}/api/adbank/publish/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          transcript: editedTranscript,
          opening_hook_first_5_seconds: editedHook,
          on_screen_caption_opening: editedCaption,
          speaker: editedSpeaker,
          title: editedTitle,
          category_fit_description: editedCategoryFit,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Publish failed (${res.status})`);
      pollJob(jobId, "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new ad to Ad Bank</DialogTitle>
          <DialogDescription>
            Upload a competitor ad, AI handles transcript + visual analysis, you review and publish.
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <FormStep
            file={file}
            onFileChange={pickFile}
            brand={brand}
            onBrandChange={setBrand}
            brandSuggestions={brandSuggestions}
            pageName={pageName}
            onPageNameChange={setPageName}
            adId={adId}
            onAdIdChange={setAdId}
            notes={notes}
            onNotesChange={setNotes}
            categories={categories}
            categoryId={categoryId}
            onCategoryIdChange={setCategoryId}
            newCategoryName={newCategoryName}
            onNewCategoryName={setNewCategoryName}
            newCategoryDesc={newCategoryDesc}
            onNewCategoryDesc={setNewCategoryDesc}
            onSubmit={submitIngest}
          />
        )}

        {(step === "processing" || step === "publishing") && (
          <ProcessingStep progress={progress} step={step} />
        )}

        {step === "review" && draft && (
          <ReviewStep
            draft={draft}
            editedTranscript={editedTranscript}
            editedHook={editedHook}
            editedCaption={editedCaption}
            editedSpeaker={editedSpeaker}
            editedTitle={editedTitle}
            editedCategoryFit={editedCategoryFit}
            onTranscriptChange={setEditedTranscript}
            onHookChange={setEditedHook}
            onCaptionChange={setEditedCaption}
            onSpeakerChange={setEditedSpeaker}
            onTitleChange={setEditedTitle}
            onCategoryFitChange={setEditedCategoryFit}
            onPublish={submitPublish}
            onCancel={() => onOpenChange(false)}
          />
        )}

        {step === "done" && (
          <DoneStep
            publishResult={publishResult}
            onAddAnother={resetDialog}
            onClose={() => onOpenChange(false)}
          />
        )}

        {step === "error" && (
          <ErrorStep
            error={error}
            onRetry={() => setStep("form")}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormStep(props: {
  file: File | null;
  onFileChange: (f: File | null) => void;
  brand: string;
  onBrandChange: (s: string) => void;
  brandSuggestions: string[];
  pageName: string;
  onPageNameChange: (s: string) => void;
  adId: string;
  onAdIdChange: (s: string) => void;
  notes: string;
  onNotesChange: (s: string) => void;
  categories: Category[];
  categoryId: string;
  onCategoryIdChange: (s: string) => void;
  newCategoryName: string;
  onNewCategoryName: (s: string) => void;
  newCategoryDesc: string;
  onNewCategoryDesc: (s: string) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4 py-2">
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const f = e.dataTransfer.files?.[0];
          if (f) props.onFileChange(f);
        }}
      >
        {props.file ? (
          <div className="flex items-center justify-center gap-3">
            <FileVideo className="w-8 h-8 text-primary" />
            <div className="text-left">
              <div className="font-medium truncate max-w-md">{props.file.name}</div>
              <div className="text-xs text-muted-foreground">
                {(props.file.size / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <UploadCloud className="w-10 h-10" />
            <div>Drop MP4 here, or click to choose</div>
            <div className="text-xs">Max 200 MB</div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/*"
          className="hidden"
          onChange={(e) => props.onFileChange(e.target.files?.[0] || null)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Brand *</Label>
          <Input
            list="brand-suggestions"
            value={props.brand}
            onChange={(e) => props.onBrandChange(e.target.value)}
            placeholder="e.g. Resilia, Cleantra, Liven…"
          />
          <datalist id="brand-suggestions">
            {props.brandSuggestions.map((b) => <option key={b} value={b} />)}
          </datalist>
        </div>
        <div className="space-y-2">
          <Label>Page name (optional)</Label>
          <Input
            value={props.pageName}
            onChange={(e) => props.onPageNameChange(e.target.value)}
            placeholder="Defaults to brand"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={props.categoryId} onValueChange={props.onCategoryIdChange}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a category or create new" />
          </SelectTrigger>
          <SelectContent>
            {props.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
            <SelectItem value={NEW_CATEGORY_VALUE}>+ New category…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {props.categoryId === NEW_CATEGORY_VALUE && (
        <div className="space-y-2 pl-4 border-l-2 border-primary/30">
          <div className="space-y-1">
            <Label>New category name *</Label>
            <Input
              value={props.newCategoryName}
              onChange={(e) => props.onNewCategoryName(e.target.value)}
              placeholder="e.g. Pixar Ads"
            />
          </div>
          <div className="space-y-1">
            <Label>New category description</Label>
            <Textarea
              rows={2}
              value={props.newCategoryDesc}
              onChange={(e) => props.onNewCategoryDesc(e.target.value)}
              placeholder="What pattern makes ads belong in this category?"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>FB Ad Library ID (optional)</Label>
          <Input
            value={props.adId}
            onChange={(e) => props.onAdIdChange(e.target.value)}
            placeholder="e.g. 1359134912698732"
          />
        </div>
        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Input
            value={props.notes}
            onChange={(e) => props.onNotesChange(e.target.value)}
            placeholder="Any context for the curator"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={props.onSubmit} disabled={!props.file || !props.brand || !props.categoryId}>
          Process video
        </Button>
      </div>
    </div>
  );
}

function ProcessingStep({ progress, step }: { progress: { step: string; message: string } | null; step: string }) {
  const stepLabel = step === "publishing" ? "Publishing" : "Processing";
  const message = progress?.message || "Working…";
  const stepName = progress?.step || "starting";
  const stepIndex = ["uploading","probe","audio","frames","transcribe","analyze","ready","supabase","files","build_py","rebuild","git","done","publishing"].indexOf(stepName);
  const totalSteps = step === "publishing" ? 6 : 6;
  const pct = stepIndex >= 0 ? Math.min(100, ((stepIndex + 1) / totalSteps) * 100) : 20;

  return (
    <div className="py-8 space-y-4">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <div className="font-medium">{stepLabel}…</div>
        <div className="text-sm text-muted-foreground">{message}</div>
      </div>
      <Progress value={pct} className="w-full" />
      <div className="text-xs text-center text-muted-foreground">
        This typically takes 30-60 seconds. Whisper transcription runs locally; Claude analyzes the visuals.
      </div>
    </div>
  );
}

function ReviewStep(props: {
  draft: Draft;
  editedTranscript: string; editedHook: string; editedCaption: string;
  editedSpeaker: string; editedTitle: string; editedCategoryFit: string;
  onTranscriptChange: (s: string) => void;
  onHookChange: (s: string) => void;
  onCaptionChange: (s: string) => void;
  onSpeakerChange: (s: string) => void;
  onTitleChange: (s: string) => void;
  onCategoryFitChange: (s: string) => void;
  onPublish: () => void;
  onCancel: () => void;
}) {
  const a = props.draft.analysis || {};
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-md bg-muted p-3 text-sm space-y-1">
        <div><strong>Duration:</strong> {props.draft.duration_seconds}s</div>
        {a.visual_subject && <div><strong>Visual:</strong> {a.visual_subject}</div>}
        {a.setting && <div><strong>Setting:</strong> {a.setting}</div>}
        {a.template_signature && <div><strong>Template:</strong> {a.template_signature}</div>}
        {a.suggested_ad_format && <div><strong>Format:</strong> {a.suggested_ad_format}</div>}
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={props.editedTitle} onChange={(e) => props.onTitleChange(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Opening hook (first 5 sec)</Label>
          <Textarea rows={2} value={props.editedHook} onChange={(e) => props.onHookChange(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>On-screen caption opening</Label>
          <Textarea rows={2} value={props.editedCaption} onChange={(e) => props.onCaptionChange(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Speaker / on-screen presence</Label>
        <Textarea rows={2} value={props.editedSpeaker} onChange={(e) => props.onSpeakerChange(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Why this ad fits the category</Label>
        <Textarea rows={2} value={props.editedCategoryFit} onChange={(e) => props.onCategoryFitChange(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Transcript</Label>
        <Textarea rows={8} value={props.editedTranscript} onChange={(e) => props.onTranscriptChange(e.target.value)} />
      </div>

      {a.shot_sequence && a.shot_sequence.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Shot sequence ({a.shot_sequence.length} beats)</summary>
          <ul className="mt-2 space-y-1 pl-4 text-muted-foreground">
            {a.shot_sequence.map((b, i) => <li key={i}>• {b}</li>)}
          </ul>
        </details>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={props.onCancel}>Cancel</Button>
        <Button onClick={props.onPublish}>Publish to ad bank</Button>
      </div>
    </div>
  );
}

function DoneStep({ publishResult, onAddAnother, onClose }: {
  publishResult: { scriptPageUrl?: string; commitMessage?: string } | null;
  onAddAnother: () => void;
  onClose: () => void;
}) {
  return (
    <div className="py-6 text-center space-y-4">
      <div className="text-4xl">🎉</div>
      <div className="font-medium">Published</div>
      <div className="text-sm text-muted-foreground">
        The site will update on the next auto-pull cycle (~3 min).
      </div>
      {publishResult?.scriptPageUrl && (
        <a
          href={publishResult.scriptPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
        >
          View the new ad page <ExternalLink className="w-3 h-3" />
        </a>
      )}
      <div className="flex justify-center gap-2 pt-2">
        <Button variant="outline" onClick={onAddAnother}>Add another</Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function ErrorStep({ error, onRetry, onClose }: { error: string; onRetry: () => void; onClose: () => void }) {
  return (
    <div className="py-6 space-y-4">
      <div className="text-center text-destructive font-medium">Something went wrong</div>
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive whitespace-pre-wrap break-all">
        {error}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={onRetry}>
          <RefreshCcw className="w-3 h-3 mr-1" /> Try again
        </Button>
      </div>
    </div>
  );
}
