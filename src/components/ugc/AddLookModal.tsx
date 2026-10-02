import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const HEYGEN_ID_RE = /^[a-zA-Z0-9]{16,}$/;

interface Props {
  open: boolean;
  avatarId: string;
  avatarName: string;
  onClose: () => void;
  onSaved: () => void;
}

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

export function AddLookModal({ open, avatarId, avatarName, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [p1Id, setP1Id] = useState("");
  const [p2Id, setP2Id] = useState("");
  const [p1Img, setP1Img] = useState("");
  const [p2Img, setP2Img] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validate() {
    if (!HEYGEN_ID_RE.test(p1Id)) return "P1 HeyGen ID must be at least 16 alphanumeric characters";
    if (!HEYGEN_ID_RE.test(p2Id)) return "P2 HeyGen ID must be at least 16 alphanumeric characters";
    if (p1Id === p2Id) return "P1 and P2 HeyGen IDs must be different";
    return "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/ugc-avatars/${avatarId}/looks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          withoutProductHeygenId: p1Id.trim(),
          withProductHeygenId: p2Id.trim(),
          withoutProductImageUrl: p1Img.trim() || undefined,
          withProductImageUrl: p2Img.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Server error ${res.status}`);
      }
      handleClose();
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setName(""); setP1Id(""); setP2Id(""); setP1Img(""); setP2Img(""); setError("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Look — {avatarName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Look name (optional)</Label>
            <Input placeholder="e.g. Summer outfit" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">P1 HeyGen Avatar ID <span className="text-muted-foreground">(without product)</span></Label>
            <Input
              placeholder="16+ alphanumeric"
              value={p1Id}
              onChange={(e) => { setP1Id(e.target.value); setError(""); }}
              className={!p1Id || HEYGEN_ID_RE.test(p1Id) ? "" : "border-destructive"}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">P2 HeyGen Avatar ID <span className="text-muted-foreground">(with product)</span></Label>
            <Input
              placeholder="16+ alphanumeric"
              value={p2Id}
              onChange={(e) => { setP2Id(e.target.value); setError(""); }}
              className={!p2Id || HEYGEN_ID_RE.test(p2Id) ? "" : "border-destructive"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">P1 preview image URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="https://…" value={p1Img} onChange={(e) => setP1Img(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">P2 preview image URL <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="https://…" value={p2Img} onChange={(e) => setP2Img(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={handleClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !p1Id || !p2Id}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</> : "Add Look"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
