import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useStaticsLogs, useUpdateStaticsLog, StaticsLog } from "@/hooks/useStaticsLogs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { userHasBrandAccess } from "@/lib/brandAccess";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  FileText,
  ExternalLink,
  Copy,
  Image,
  Loader2,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  Layers,
} from "lucide-react";
import EditImagesDialog from "./EditImagesDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface StaticsLogsTableProps {
  onUseAsTemplate: (log: StaticsLog) => void;
  filterAdId?: string;
}

const FUNNEL_STYLES: Record<string, string> = {
  Comparison: "bg-blue-50 text-blue-700 border border-blue-100",
  Onbrand: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  TSL: "bg-purple-50 text-purple-700 border border-purple-100",
  Adv: "bg-rose-50 text-rose-700 border border-rose-100",
};

const PAGE_SIZE = 10;


const IconBtn = ({
  onClick,
  title,
  disabled,
  children,
  variant = "default",
}: {
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={cn(
      "w-8 h-8 rounded-lg flex items-center justify-center border text-muted-foreground transition-colors disabled:opacity-40",
      variant === "default" && "border-border bg-card hover:bg-muted hover:text-foreground",
      variant === "danger" && "border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-500",
    )}
  >
    {children}
  </button>
);

const StaticsLogsTable = ({ onUseAsTemplate, filterAdId }: StaticsLogsTableProps) => {
  const { user } = useAuth();
  const { data: logs = [], isLoading } = useStaticsLogs();
  const updateLog = useUpdateStaticsLog();
  const [editLog, setEditLog] = useState<StaticsLog | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Filters
  const [search, setSearch] = useState("");
  const [funnelFilter, setFunnelFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Determine if user is Custom-only (restricted to assigned brands)
  const isCustomUser = !!(
    user?.user_type?.includes("Custom") &&
    !user.user_type.some(t => ["Super Admin", "Admin", "Dev"].includes(t))
  );

  // Filter logs by assigned brands for Custom users (or all, current & future,
  // for an All-Brands grant)
  const visibleLogs = isCustomUser
    ? logs.filter(l => userHasBrandAccess(user, l.brand_id || ""))
    : logs;

  const groupedLogs = useMemo(() => {
    const groups = new Map<string, StaticsLog[]>();
    let nullCounter = 0;
    for (const log of visibleLogs) {
      const key = log.generation_id || `__null_${nullCounter++}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(log);
    }
    let sorted = [...groups.entries()].sort(
      (a, b) => new Date(b[1][0].created_at).getTime() - new Date(a[1][0].created_at).getTime(),
    );
    if (filterAdId) {
      const numId = parseInt(filterAdId, 10);
      sorted = sorted.filter(([, gl]) => gl.some((l) => l.ad_id === numId));
    }
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      sorted = sorted.filter(([, gl]) => {
        const f = gl[0];
        return (
          f.brand_name?.toLowerCase().includes(q) ||
          f.product_name?.toLowerCase().includes(q) ||
          f.concept_name?.toLowerCase().includes(q) ||
          f.generation_id?.toLowerCase().includes(q)
        );
      });
    }
    if (funnelFilter !== "all")
      sorted = sorted.filter(([, gl]) => gl[0].funnel?.toLowerCase() === funnelFilter.toLowerCase());
    return sorted;
  }, [visibleLogs, filterAdId, search, funnelFilter]);

  const totalPages = Math.max(1, Math.ceil(groupedLogs.length / PAGE_SIZE));
  const pagedLogs = groupedLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, funnelFilter]);

  useEffect(() => {
    if (filterAdId && groupedLogs.length > 0) setExpandedGroups(new Set(groupedLogs.map(([k]) => k)));
  }, [filterAdId, groupedLogs]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((p) => {
      const n = new Set(p);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const extractFolderId = (link: string | null) => {
    if (!link) return null;
    const m = link.match(/folders\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  };

  const handleRegenerate = async (log: StaticsLog) => {
    setRegeneratingId(log.id);
    updateLog.mutate({ id: log.id, status: "In Work" });
    try {
      let publisherName = "";
      if (log.product_id) {
        const { data: product } = await supabase
          .from("products")
          .select("publishers(name)")
          .eq("id", log.product_id)
          .single();
        publisherName = (product as any)?.publishers?.name || "";
      }
      const { data, error } = await supabase.functions.invoke("execute-generation", {
        body: {
          Brand: log.brand_name,
          Product: log.product_name,
          Flow: log.funnel || "onbrand",
          CS: log.cs || null,
          Concept: log.concept_name || null,
          prompt: (log.prompt || "").replace(
            /Generate\s+\d+\s+images/gi,
            `Generate ${log.max_variations_per_ad_group || 8} images`,
          ),
          referenceImages: log.selected_images || [],
          inspoLinks: log.inspo_links || [],
          fileFormat: log.file_naming_convention || null,
          generation_id: log.ad_id,
          description: log.description || null,
          max_variations_per_ad_group: log.max_variations_per_ad_group || null,
          imagegenerationFolderid: extractFolderId(log.image_generation_drive_link),
          driveLink: log.drive_link,
          number_of_ads: log.number_of_ads || null,
          isRegeneration: true,
          publisherName,
        },
      });
      if (error) throw error;
      toast({ title: "Success", description: data?.data?.message || "Regeneration started." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to regenerate", variant: "destructive" });
    } finally {
      setRegeneratingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading logs…</p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <FileText className="w-8 h-8" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-muted-foreground">No logs yet</p>
          <p className="text-sm mt-1">Start generating content to see history here.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col max-h-[calc(100vh-130px)]">
        {/* ── Header + filters ── */}
        <div className="shrink-0 bg-card/95 backdrop-blur-sm border border-border rounded-t-2xl shadow-sm">
          {/* Title row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-5 py-4 border-b border-border/50">
            <div>
              <h2 className="text-lg font-bold text-foreground">Statics Logs</h2>
              <p className="text-sm text-muted-foreground">View your statics generation history and manage images</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search concept, brand…"
                  className="pl-8 h-9 w-full sm:w-52 rounded-lg border-border bg-muted text-sm"
                />
              </div>
              {/* Funnel filter */}
              <Select value={funnelFilter} onValueChange={setFunnelFilter}>
                <SelectTrigger className="h-9 w-36 rounded-lg border-border bg-muted text-sm">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Funnels</SelectItem>
                  <SelectItem value="Comparison">Comparison</SelectItem>
                  <SelectItem value="Onbrand">Onbrand</SelectItem>
                  <SelectItem value="TSL">TSL</SelectItem>
                  <SelectItem value="Adv">Adv</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Sticky column header ── */}
          <div className="grid grid-cols-[40px_120px_1fr_1fr_1fr_1fr_1fr_1fr_130px_90px_100px] items-center px-4 py-3 bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div />
            <div>Gen ID</div>
            <div>Brand</div>
            <div>Product</div>
            {/* <div>View Sheet</div> */}
            <div>Funnel</div>
            <div>CS</div>
            <div>Concept</div>
            <div>Date</div>
            <div>Time</div>
            <div>Ads</div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto border-x border-b border-border rounded-b-2xl bg-card shadow-sm">
          {pagedLogs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No results match your filters.</div>
          ) : (
            <div className="divide-y divide-border/50">
              {pagedLogs.map(([groupKey, groupLogs]) => {
                const isExpanded = expandedGroups.has(groupKey);
                const first = groupLogs[0];
                const isNullGroup = groupKey.startsWith("__null_");

                return (
                  <div key={groupKey}>
                    {/* Group row */}
                    <div
                      className="grid grid-cols-[40px_120px_1fr_1fr_1fr_1fr_1fr_1fr_130px_90px_100px] items-center px-4 py-3.5 cursor-pointer hover:bg-muted/80 transition-colors min-w-0"
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <div className="flex items-center justify-center">
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${isExpanded ? "bg-indigo-100 text-indigo-600" : "bg-muted text-muted-foreground"}`}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {isNullGroup ? "—" : first.generation_id?.slice(0, 8)}
                      </div>
                      <div className="text-sm font-semibold text-foreground truncate min-w-0 pr-2">{first.brand_name}</div>
                      <div className="text-sm text-muted-foreground truncate min-w-0 pr-2">{first.product_name}</div>
                      <div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${FUNNEL_STYLES[first.funnel || ""] || "bg-muted text-muted-foreground"}`}
                        >
                          {first.funnel}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground truncate min-w-0 pr-1" title={first.cs || ""}>
                        {first.cs ? first.cs.split("@")[0] : "—"}
                      </div>
                      <div className="text-sm text-foreground truncate min-w-0 pr-2" title={first.concept_name || ""}>
                        {first.concept_name || "—"}
                      </div>
                      <div className="text-sm text-muted-foreground">{format(new Date(first.created_at), "MMM dd, yyyy")}</div>
                      <div className="text-sm text-muted-foreground font-mono">
                        {format(new Date(first.created_at), "HH:mm:ss")}
                      </div>
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-semibold">
                          <Layers className="w-3 h-3" />
                          {groupLogs.length}
                        </span>
                      </div>
                    </div>

                    {/* Expanded child rows */}
                    {isExpanded && (
                      <div className="border-l-2 border-l-primary bg-card">
                        {/* Sub-header */}
                        <div
                          className="grid grid-cols-[40px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] items-center px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide border-b border-t border-blue-100 bg-primary/5 text-primary"
                        >
                          <div />
                          <div>Ad ID</div>
                          <div>Main Drive</div>
                          <div>Img Gen Drive</div>
                          <div># Ads</div>
                          <div>Lang</div>
                          <div>ClickUp</div>
                          <div>Actions</div>
                        </div>
                        {groupLogs.map((log) => (
                          <div
                            key={log.id}
                            className="grid grid-cols-[40px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] items-center px-6 py-3 hover:bg-blue-50/30 transition-colors border-b border-blue-50 last:border-0"
                          >
                            <div />
                            <div className="font-mono text-sm font-bold text-foreground">
                              {String(log.ad_id).padStart(6, "0")}
                            </div>
                            <div>
                              {log.drive_link ? (
                                <a
                                  href={log.drive_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </div>
                            <div>
                              {log.image_generation_drive_link ? (
                                <a
                                  href={log.image_generation_drive_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {log.max_variations_per_ad_group || "—"}
                            </div>
                            <div className="text-sm text-muted-foreground">{log.language || "EN"}</div>
                            <div>
                              {log.clickup_task_url ? (
                                <a
                                  href={log.clickup_task_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <IconBtn
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUseAsTemplate(log);
                                }}
                                title="Load as Template"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </IconBtn>
                              <IconBtn
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditLog(log);
                                  setEditOpen(true);
                                }}
                                title="Edit Images"
                                disabled={!log.images_folder_link && !log.image_generation_drive_link}
                              >
                                <Image className="w-3.5 h-3.5" />
                              </IconBtn>
                              {/* <IconBtn
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRegenerate(log);
                                }}
                                title="Regenerate"
                                disabled={regeneratingId === log.id}
                              >
                                {regeneratingId === log.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5" />
                                )}
                              </IconBtn> */}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between bg-card/95 backdrop-blur-sm border border-border rounded-b-xl px-5 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({groupedLogs.length} groups)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
              >
                ← Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const pg = start + i;
                return (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                      pg === page
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 px-3 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <EditImagesDialog open={editOpen} onOpenChange={setEditOpen} log={editLog} onRegenerate={handleRegenerate} />
    </>
  );
};

export default StaticsLogsTable;
