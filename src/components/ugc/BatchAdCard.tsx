import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { AvatarSelector } from "./AvatarSelector";

export type AdMode = "with" | "without" | "combination";

export interface PerScriptItem {
  mode: AdMode;
  plain: string;
  p1: string;
  p2: string;
  avatarIds: string[];
  concept: string;
}

interface Props {
  index: number;
  item: PerScriptItem;
  productSlug: string;
  onChange: (item: PerScriptItem) => void;
  onRemove: () => void;
}

export function BatchAdCard({ index, item, productSlug, onChange, onRemove }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  function set<K extends keyof PerScriptItem>(k: K, v: PerScriptItem[K]) {
    onChange({ ...item, [k]: v });
  }

  return (
    <Card className="border border-border">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground">Ad {index + 1}</span>
          {item.concept && <span className="text-sm font-medium truncate max-w-48">{item.concept}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-7 w-7"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" type="button" onClick={onRemove} className="h-7 w-7 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Concept / Title</Label>
              <Input
                placeholder="e.g. Pain point hook"
                value={item.concept}
                onChange={(e) => set("concept", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={item.mode} onValueChange={(v) => set("mode", v as AdMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="without">Without product</SelectItem>
                  <SelectItem value="with">With product</SelectItem>
                  <SelectItem value="combination">Combination (P1 + P2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {item.mode === "combination" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">P1 Script (without product)</Label>
                <Textarea
                  rows={5}
                  placeholder="First part — no product shown"
                  value={item.p1}
                  onChange={(e) => set("p1", e.target.value)}
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">P2 Script (with product)</Label>
                <Textarea
                  rows={5}
                  placeholder="Second part — product shown"
                  value={item.p2}
                  onChange={(e) => set("p2", e.target.value)}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Script</Label>
              <Textarea
                rows={5}
                placeholder={`Script for "${item.mode}" mode`}
                value={item.plain}
                onChange={(e) => set("plain", e.target.value)}
                className="resize-none text-sm"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Avatars</Label>
            <AvatarSelector
              productSlug={productSlug}
              selectedIds={item.avatarIds}
              onChange={(ids) => set("avatarIds", ids)}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
