import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, ExternalLink, MoreHorizontal, Pencil, Trash2, Lightbulb, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useInspos, Inspo } from "@/hooks/useInspos";
import { InspoDialog } from "@/components/inspo/InspoDialog";
import { DeleteInspoDialog } from "@/components/inspo/DeleteInspoDialog";

const getFunnelBadgeClass = (ft: string) => {
  const f = ft.toLowerCase();
  if (f === "comparison") return "funnel-badge-comparison";
  if (f === "onbrand") return "funnel-badge-onbrand";
  if (f === "tsl") return "funnel-badge-tsl";
  if (f === "adv") return "funnel-badge-adv";
  return "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground";
};

export const SourcePoolsPanel = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedInspo, setSelectedInspo] = useState<Inspo | null>(null);

  const { inspos, isLoading } = useInspos();

  const filteredInspos = inspos?.filter((inspo) =>
    inspo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    setSelectedInspo(null);
    setDialogOpen(true);
  };

  const handleEdit = (inspo: Inspo) => {
    setSelectedInspo(inspo);
    setDialogOpen(true);
  };

  const handleDelete = (inspo: Inspo) => {
    setSelectedInspo(inspo);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap pb-4 flex-shrink-0">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search source pools..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {!isLoading && (
          <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
            {filteredInspos?.length ?? 0} inspo
          </span>
        )}
        <div className="ml-auto">
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add New Inspo
          </Button>
        </div>
      </div>

   <div className="flex-1 overflow-y-auto pb-8">
      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="content-card h-28 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filteredInspos?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Lightbulb className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">No source pools yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery
                ? "No pools match your search"
                : "Add your first source pool to get started"}
            </p>
          </div>
          {!searchQuery && (
            <Button onClick={handleAdd} size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Pool
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInspos?.map((inspo) => (
            <div
              key={inspo.id}
              className="content-card group flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              {/* Name + menu */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm leading-snug text-foreground">
                  {inspo.name}
                </h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="flex-shrink-0 -mt-1 -mr-1 h-7 w-7">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(inspo)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(inspo)}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Funnel badges */}
              <div className="flex flex-wrap gap-1.5">
                {(inspo.funnel_type || []).map((ft) => (
                  <span key={ft} className={getFunnelBadgeClass(ft)}>
                    {ft}
                  </span>
                ))}
              </div>

              {/* Brief status */}
              {inspo.inspo_brief_status === "generating" && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating brief…
                </div>
              )}
              {inspo.inspo_brief_status === "completed" && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Brief ready
                </div>
              )}
              {inspo.inspo_brief_status === "failed" && (
                <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                  <XCircle className="w-3.5 h-3.5" />
                  Brief failed
                </div>
              )}

              {/* Drive link */}
              <div className="pt-2 border-t border-border">
                <a
                  href={inspo.drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Drive
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
   </div>

      <InspoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        inspo={selectedInspo}
      />

      <DeleteInspoDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        inspo={selectedInspo}
      />
    </div>
  );
};
