import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Search,
  Pencil,
  ArrowRight,
  ChevronDown,
  MoreHorizontal,
  Trash2,
  FileText,
  Package,
  Lightbulb,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import {
  useFormTemplates,
  useDeleteFormTemplate,
  FormTemplate,
} from "@/hooks/useFormTemplates";
import { useProducts } from "@/hooks/useProducts";
import { useFilteredBrands } from "@/hooks/useFilteredBrands";
import { useInspos } from "@/hooks/useInspos";
import { useAuth } from "@/hooks/useAuth";
import { userHasBrandAccess } from "@/lib/brandAccess";
import { DeleteTemplateDialog } from "@/components/templates/DeleteTemplateDialog";

interface ExistingTemplatesPanelProps {
  onEdit: (template: FormTemplate) => void;
  onGenerate: (template: FormTemplate) => void;
}

const getFunnelBadgeClass = (f: string) => {
  if (f === "Comparison") return "funnel-badge-comparison";
  if (f === "Onbrand") return "funnel-badge-onbrand";
  if (f === "TSL") return "funnel-badge-tsl";
  if (f === "ADV") return "funnel-badge-adv";
  return "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground";
};

export const ExistingTemplatesPanel = ({
  onEdit,
  onGenerate,
}: ExistingTemplatesPanelProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [funnelFilter, setFunnelFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  const { data: templates = [], isLoading } = useFormTemplates();
  const deleteTemplate = useDeleteFormTemplate();
  const { products = [] } = useProducts();
  const { data: brands = [] } = useFilteredBrands();
  const { inspos = [] } = useInspos();
  const { user } = useAuth();

  // Filter products by selected brand and user's assigned brands
  const productsForFilter = brandFilter === "all"
    ? products.filter((p) => userHasBrandAccess(user, p.brand_id, { emptyMeansAll: true }))
    : products.filter((p) => p.brand_id === brandFilter && userHasBrandAccess(user, p.brand_id, { emptyMeansAll: true }));

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFunnel = funnelFilter === "all" || t.funnel === funnelFilter;
    const matchesBrand = brandFilter === "all" || t.brand_id === brandFilter;
    const matchesProduct = productFilter === "all" || t.product_id === productFilter;
    // Only show templates from user's assigned brands
    const matchesUserBrands = userHasBrandAccess(user, t.brand_id, { emptyMeansAll: true });
    return matchesSearch && matchesFunnel && matchesBrand && matchesProduct && matchesUserBrands;
  });

  const handleBrandChange = (value: string) => {
    setBrandFilter(value);
    setProductFilter("all");
  };

  const getProductName = (productId: string | null) =>
    products.find((p) => p.id === productId)?.name ?? "—";

  const getInspoNames = (inspoIds: string[] | null) => {
    if (!inspoIds || inspoIds.length === 0) return [];
    return inspoIds
      .map((id) => inspos.find((i) => i.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const handleDelete = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedTemplate) {
      deleteTemplate.mutate(selectedTemplate.id, {
        onSuccess: () => setDeleteDialogOpen(false),
      });
    }
  };

  const toggleCard = (id: string) =>
    setOpenCards((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap pb-4 flex-shrink-0">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={funnelFilter} onValueChange={setFunnelFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by funnel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Funnels</SelectItem>
            <SelectItem value="Comparison">Comparison</SelectItem>
            <SelectItem value="Onbrand">Onbrand</SelectItem>
            <SelectItem value="TSL">TSL</SelectItem>
            <SelectItem value="Adv">ADV</SelectItem>
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={handleBrandChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by product" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {productsForFilter.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isLoading && (
          <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
            {filteredTemplates.length} templates
          </span>
        )}
      </div>

 <div className="flex-1 overflow-y-auto pb-8">
      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="content-card h-48 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <FileText className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">No templates yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery || funnelFilter !== "all" || brandFilter !== "all" || productFilter !== "all"
                ? "No templates match your filters"
                : "Create your first config template in Ad Template Builder"}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((template) => {
            const inspoNames = getInspoNames(template.inspo_ids);
            const poolCount = inspoNames.length;
            const isOpen = openCards[template.id] ?? false;

            return (
              <div
                key={template.id}
                className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="p-5 flex flex-col flex-1 gap-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={getFunnelBadgeClass(template.funnel)}>
                          {template.funnel.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground leading-snug">
                        {template.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {poolCount > 0
                          ? `${poolCount} source pool${poolCount !== 1 ? "s" : ""}.`
                          : "No source pools saved."}{" "}
                        {template.concept_name
                          ? template.concept_name
                          : "No detailed inspiration summary saved yet."}
                      </p>
                    </div>

                    {/* Right meta + menu */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                        <Clock className="w-3 h-3" />
                        <span>
                          Updated{" "}
                          {format(new Date(template.updated_at), "M/d/yyyy, h:mm:ss aa")}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(template)}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(template)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Meta fields */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground w-24 shrink-0">Product</span>
                      <span className="font-medium text-foreground">
                        {getProductName(template.product_id)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <Lightbulb className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground w-24 shrink-0">Source pools</span>
                      <span className="font-medium text-foreground">
                        {inspoNames.length > 0 ? inspoNames.join(", ") : "None saved"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground w-24 shrink-0">Summary</span>
                      <span className="font-medium text-foreground">
                        {template.design_elements
                          ? template.design_elements.slice(0, 60) +
                            (template.design_elements.length > 60 ? "…" : "")
                          : "No summary saved."}
                      </span>
                    </div>
                  </div>

                  {/* Baseline instructions collapsible */}
                  <Collapsible open={isOpen} onOpenChange={() => toggleCard(template.id)}>
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1.5 border-t border-border">
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                        Baseline instructions
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pt-2 pb-1 text-sm text-foreground leading-relaxed bg-muted/40 rounded-lg p-3 mt-1">
                        {template.design_elements || template.title || template.subtitle ? (
                          <div className="space-y-1">
                            {template.title && (
                              <p>
                                <span className="font-medium text-muted-foreground">Title:</span>{" "}
                                {template.title}
                              </p>
                            )}
                            {template.subtitle && (
                              <p>
                                <span className="font-medium text-muted-foreground">Subtitle:</span>{" "}
                                {template.subtitle}
                              </p>
                            )}
                            {template.design_elements && (
                              <p className="whitespace-pre-wrap">{template.design_elements}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-muted-foreground italic">
                            No baseline instructions saved.
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1 mt-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => onEdit(template)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit template
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => onGenerate(template)}
                    >
                      Generate from template
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
 </div>

      <DeleteTemplateDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        template={selectedTemplate}
        onConfirm={handleConfirmDelete}
        isLoading={deleteTemplate.isPending}
      />
    </div>
  );
};
