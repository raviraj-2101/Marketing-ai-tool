import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, FileText } from "lucide-react";
import {
  useFormTemplates,
  useCreateFormTemplate,
  useUpdateFormTemplate,
  useDeleteFormTemplate,
  FormTemplate,
  FormTemplateFormData,
} from "@/hooks/useFormTemplates";
import { TemplateDialog } from "@/components/templates/TemplateDialog";
import { DeleteTemplateDialog } from "@/components/templates/DeleteTemplateDialog";

const getFunnelBadgeClass = (f: string) => {
  if (f === "Comparison") return "funnel-badge-comparison";
  if (f === "Onbrand") return "funnel-badge-onbrand";
  if (f === "TSL") return "funnel-badge-tsl";
  return "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground";
};

const getFunnelAccentClass = (f: string) => {
  if (f === "Comparison") return "bg-blue-500";
  if (f === "Onbrand") return "bg-emerald-500";
  if (f === "TSL") return "bg-purple-500";
  return "bg-muted-foreground/30";
};

export const TemplatesPanel = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);

  const { data: templates = [], isLoading } = useFormTemplates();
  const createTemplate = useCreateFormTemplate();
  const updateTemplate = useUpdateFormTemplate();
  const deleteTemplate = useDeleteFormTemplate();

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFunnel = funnelFilter === "all" || t.funnel === funnelFilter;
    return matchesSearch && matchesFunnel;
  });

  const handleCreate = () => {
    setSelectedTemplate(null);
    setDialogOpen(true);
  };

  const handleEdit = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setDialogOpen(true);
  };

  const handleDelete = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = (formData: FormTemplateFormData) => {
    if (selectedTemplate) {
      updateTemplate.mutate(
        { id: selectedTemplate.id, formData },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createTemplate.mutate(formData, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleConfirmDelete = () => {
    if (selectedTemplate) {
      deleteTemplate.mutate(selectedTemplate.id, {
        onSuccess: () => setDeleteDialogOpen(false),
      });
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
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
          </SelectContent>
        </Select>
        {!isLoading && (
          <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
            {filteredTemplates.length} templates
          </span>
        )}
        <div className="ml-auto">
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Template
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="content-card h-28 animate-pulse bg-muted" />
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
              {searchQuery || funnelFilter !== "all"
                ? "No templates match your filters"
                : "Create your first template to get started"}
            </p>
          </div>
          {!searchQuery && funnelFilter === "all" && (
            <Button onClick={handleCreate} size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="hover:shadow-md transition-shadow relative overflow-hidden"
            >
              {/* Funnel accent bar */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-1 ${getFunnelAccentClass(template.funnel)}`}
              />
              <CardContent className="p-5 pl-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-foreground break-words line-clamp-2">
                        {template.name}
                      </h3>
                      <span className={`mt-1.5 ${getFunnelBadgeClass(template.funnel)}`}>
                        {template.funnel}
                      </span>
                      {template.concept_name && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                          {template.concept_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="flex-shrink-0 h-7 w-7 -mt-1 -mr-1">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(template)}>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={selectedTemplate}
        onSubmit={handleSubmit}
        isLoading={createTemplate.isPending || updateTemplate.isPending}
      />

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
