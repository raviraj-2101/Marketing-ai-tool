// ManageSubAngleDialog — the Sub-angle "Manage options" editor. Modeled on
// ManageOptionsDialog (@/hooks/useAdsAgGridColumns) but two-level: a parent-Angle
// <Select> at the top scopes the add/remove list to that angle's sub-angles. Backed
// by useCsKpiAngleOptions → /api/cs-kpis/sub-angles. No rename (the cs-kpis API has
// add + delete only). Used only by TslMetadataPage.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

export interface ManageSubAngleDialogProps {
  open: boolean;
  onClose: () => void;
  parentAngles: Array<{ id: string; name: string }>;
  selectedAngleId: string;
  onSelectAngle: (id: string) => void;
  /** Sub-angles under the selected parent angle. */
  options: Array<{ label: string; value: string }>;
  onAdd?: (label: string) => void;
  onRemove?: (label: string) => void;
}

export function ManageSubAngleDialog({
  open,
  onClose,
  parentAngles,
  selectedAngleId,
  onSelectAngle,
  options,
  onAdd,
  onRemove,
}: ManageSubAngleDialogProps) {
  const [localOptions, setLocalOptions] = useState(options);
  const [newLabel, setNewLabel] = useState("");

  // Re-sync the displayed list whenever the dialog opens, the parent angle changes,
  // or the fetched sub-angles for the selected angle come back / change.
  useEffect(() => {
    setLocalOptions(options);
    setNewLabel("");
  }, [open, selectedAngleId, options]);

  const handleAdd = () => {
    const trimmed = newLabel.trim();
    if (!trimmed || !selectedAngleId || localOptions.some((o) => o.label === trimmed)) return;
    setLocalOptions((prev) => [...prev, { label: trimmed, value: trimmed }]);
    setNewLabel("");
    onAdd?.(trimmed);
  };

  const handleRemove = (label: string) => {
    setLocalOptions((prev) => prev.filter((o) => o.label !== label));
    onRemove?.(label);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Options — Sub-angle</DialogTitle>
        </DialogHeader>

        {/* Parent-angle picker — sub-angles are scoped under it. */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Under which Angle?</label>
          <Select value={selectedAngleId || undefined} onValueChange={onSelectAngle}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Pick an angle…" />
            </SelectTrigger>
            <SelectContent>
              {parentAngles.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">No angles yet</div>
              )}
              {parentAngles.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedAngleId ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Pick an angle first to manage its sub-angles.
          </p>
        ) : (
          <>
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
              {localOptions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No sub-angles yet</p>
              )}
              {localOptions.map((opt) => (
                <div key={opt.label} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50">
                  <span className="text-sm flex-1 truncate">{opt.label}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(opt.label)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                placeholder="New sub-angle…"
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={handleAdd} className="h-8 px-3">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
