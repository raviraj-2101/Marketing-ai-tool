import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

interface Avatar {
  id: string;
  name: string;
  image_url: string | null;
}

interface Props {
  productSlug: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function AvatarSelector({ productSlug, selectedIds, onChange }: Props) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productSlug) { setAvatars([]); setLoading(false); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/ugc/options/${productSlug}?types=avatars`)
      .then((r) => r.json())
      .then((d) => setAvatars(d.avatars ?? d.options?.avatars ?? []))
      .catch(() => setAvatars([]))
      .finally(() => setLoading(false));
  }, [productSlug]);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  }

  function selectAll() { onChange(avatars.map((a) => a.id)); }
  function clearAll() { onChange([]); }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading avatars…
      </div>
    );
  }

  if (!avatars.length) {
    return <p className="text-sm text-muted-foreground">No avatars found for this product.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={selectAll} type="button">Select all</Button>
        <Button variant="ghost" size="sm" onClick={clearAll} type="button">Clear</Button>
        <Badge variant="secondary">{selectedIds.length} selected</Badge>
      </div>
      <ScrollArea className="h-40 rounded-md border p-2">
        <div className="space-y-1">
          {avatars.map((av) => (
            <div key={av.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted cursor-pointer" onClick={() => toggle(av.id)}>
              <Checkbox checked={selectedIds.includes(av.id)} onCheckedChange={() => toggle(av.id)} id={`av-${av.id}`} />
              {av.image_url && (
                <img src={av.image_url} alt={av.name} className="h-7 w-7 rounded-full object-cover" />
              )}
              <Label htmlFor={`av-${av.id}`} className="cursor-pointer text-sm">{av.name}</Label>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
