import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, Trash2, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface LookPair {
  scene_group_id: string;
  name: string | null;
  without_product: { scene_id: string; heygen_avatar_id: string | null; image_url: string | null } | null;
  with_product:    { scene_id: string; heygen_avatar_id: string | null; image_url: string | null } | null;
}

interface Props {
  look: LookPair;
  onRemove: (sceneGroupId: string) => void;
}

function HeygenIdCell({ label, data }: { label: string; data: { heygen_avatar_id: string | null; image_url: string | null } | null }) {
  const [copied, setCopied] = useState(false);
  const id = data?.heygen_avatar_id ?? null;

  function copy() {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex-1 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {data?.image_url ? (
        <img src={data.image_url} alt={label} className="w-full aspect-[9/16] rounded object-cover bg-muted" />
      ) : (
        <div className="w-full aspect-[9/16] rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
          No preview
        </div>
      )}
      {id ? (
        <div className="flex items-center gap-1">
          <code className="text-xs text-muted-foreground truncate flex-1">{id.slice(0, 12)}…</code>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={copy}>
                {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied!" : id}</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No HeyGen ID</p>
      )}
    </div>
  );
}

export function LookPairCard({ look, onRemove }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Card className="border border-border">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium truncate">{look.name || <span className="italic text-muted-foreground">Unnamed look</span>}</p>
            <Button
              variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex gap-2">
            <HeygenIdCell label="P1 (without product)" data={look.without_product} />
            <HeygenIdCell label="P2 (with product)"    data={look.with_product} />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this look?</AlertDialogTitle>
            <AlertDialogDescription>
              Both scene rows will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); onRemove(look.scene_group_id); }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
