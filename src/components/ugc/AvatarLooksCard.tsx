import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LookPairCard, type LookPair } from "./LookPairCard";
import { AddLookModal } from "./AddLookModal";
import { Plus } from "lucide-react";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

export interface AvatarWithLooks {
  id: string;
  name: string;
  image_url: string | null;
  voice_name: string | null;
  quality_status: "approved" | "needs_review" | "disabled" | null;
  avatar_type: "doctor" | "natural_wellness" | "normal";
  avatar_type_override: "doctor" | "natural_wellness" | "normal" | null;
  looks: LookPair[];
}

interface Props {
  avatar: AvatarWithLooks;
  onUpdated: () => void;
}

const QUALITY_OPTS = [
  { value: "approved",     label: "Approved" },
  { value: "needs_review", label: "Needs Review" },
  { value: "disabled",     label: "Disabled" },
  { value: "__clear__",    label: "No flag" },
];

const TYPE_OPTS = [
  { value: "doctor",           label: "Doctor" },
  { value: "natural_wellness", label: "Natural / Wellness" },
  { value: "normal",           label: "Normal" },
  { value: "__clear__",        label: "Auto-detect" },
];

const QUALITY_COLOR: Record<string, string> = {
  approved:     "bg-green-100 text-green-800 border-green-200",
  needs_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  disabled:     "bg-red-100 text-red-800 border-red-200",
};

const TYPE_COLOR: Record<string, string> = {
  doctor:           "bg-blue-100 text-blue-800 border-blue-200",
  natural_wellness: "bg-emerald-100 text-emerald-800 border-emerald-200",
  normal:           "bg-slate-100 text-slate-700 border-slate-200",
};

export function AvatarLooksCard({ avatar, onUpdated }: Props) {
  const [addLookOpen, setAddLookOpen] = useState(false);

  async function handleQualityChange(value: string) {
    const status = value === "__clear__" ? null : value;
    await fetch(`${API_BASE}/api/ugc-avatars/${avatar.id}/quality`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onUpdated();
  }

  async function handleTypeChange(value: string) {
    const type = value === "__clear__" ? null : value;
    await fetch(`${API_BASE}/api/ugc-avatars/${avatar.id}/type-override`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    onUpdated();
  }

  async function handleRemoveLook(sceneGroupId: string) {
    await fetch(`${API_BASE}/api/ugc-avatars/looks/${sceneGroupId}`, { method: "DELETE" });
    onUpdated();
  }

  return (
    <Card className="border border-border">
      <CardHeader className="py-3 px-4">
        <div className="flex items-start gap-3">
          {avatar.image_url ? (
            <img src={avatar.image_url} alt={avatar.name} className="h-12 w-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-muted shrink-0" />
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{avatar.name}</p>
              {avatar.voice_name && (
                <span className="text-xs text-muted-foreground">{avatar.voice_name}</span>
              )}
              {avatar.quality_status && (
                <Badge className={`text-xs border ${QUALITY_COLOR[avatar.quality_status]}`}>
                  {QUALITY_OPTS.find(o => o.value === avatar.quality_status)?.label}
                </Badge>
              )}
              <Badge className={`text-xs border ${TYPE_COLOR[avatar.avatar_type]}`}>
                {TYPE_OPTS.find(o => o.value === avatar.avatar_type)?.label ?? avatar.avatar_type}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Select
                value={avatar.quality_status ?? "__clear__"}
                onValueChange={handleQualityChange}
              >
                <SelectTrigger className="h-6 text-xs w-32">
                  <SelectValue placeholder="Quality…" />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={avatar.avatar_type_override ?? "__clear__"}
                onValueChange={handleTypeChange}
              >
                <SelectTrigger className="h-6 text-xs w-36">
                  <SelectValue placeholder="Type…" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {avatar.looks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No looks registered yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {avatar.looks.map((look) => (
              <LookPairCard key={look.scene_group_id} look={look} onRemove={handleRemoveLook} />
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={() => setAddLookOpen(true)} type="button">
          <Plus className="h-3 w-3 mr-1" /> Add Look
        </Button>
      </CardContent>

      <AddLookModal
        open={addLookOpen}
        avatarId={avatar.id}
        avatarName={avatar.name}
        onClose={() => setAddLookOpen(false)}
        onSaved={() => { setAddLookOpen(false); onUpdated(); }}
      />
    </Card>
  );
}
