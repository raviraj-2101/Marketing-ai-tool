import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;
const FUNNELS = ["Onbrand", "Comparison", "TSL"] as const;

interface Props {
  buildId: string;
  generationId: string;
  defaults: { cs?: string; funnel?: string; persona?: string; sub_angle?: string; main_pains?: string[] };
  onSaved: () => void;
  onCancel: () => void;
}

export function PreLaunchPatch({ buildId, generationId, defaults, onSaved, onCancel }: Props) {
  const [cs, setCs] = useState(defaults.cs ?? "");
  const [funnel, setFunnel] = useState(defaults.funnel ?? "");
  const [persona, setPersona] = useState(defaults.persona ?? "");
  const [subAngle, setSubAngle] = useState(defaults.sub_angle ?? "");
  const [mainPains, setMainPains] = useState((defaults.main_pains ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (cs.trim()) body.cs = cs.trim();
      if (funnel) body.funnel = funnel;
      if (persona.trim()) body.persona = persona.trim();
      if (subAngle.trim()) body.sub_angle = subAngle.trim();
      if (mainPains.trim()) {
        body.main_pains = mainPains.split(",").map((s) => s.trim()).filter(Boolean);
      }

      const res = await fetch(
        `${API_BASE}/api/ugc-builds/${buildId}/lineage/${generationId}/patch`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Server error ${res.status}`);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">CS</Label>
          <Input value={cs} onChange={(e) => setCs(e.target.value)} className="h-8 text-xs" placeholder="Creative strategist" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Funnel</Label>
          <Select value={funnel} onValueChange={setFunnel}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select funnel" />
            </SelectTrigger>
            <SelectContent>
              {FUNNELS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Persona</Label>
          <Input value={persona} onChange={(e) => setPersona(e.target.value)} className="h-8 text-xs" placeholder="Persona description" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sub-angle</Label>
          <Input value={subAngle} onChange={(e) => setSubAngle(e.target.value)} className="h-8 text-xs" placeholder="Sub-angle" />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Main pains (comma-separated)</Label>
          <Input value={mainPains} onChange={(e) => setMainPains(e.target.value)} className="h-8 text-xs" placeholder="Pain 1, Pain 2, Pain 3" />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving…</> : "Save"}
        </Button>
      </div>
    </div>
  );
}
