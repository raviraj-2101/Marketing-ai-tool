import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFormTemplates, useCreateFormTemplate, useUpdateFormTemplate, useDeleteFormTemplate, FormTemplate, FormTemplateFormData } from "@/hooks/useFormTemplates";
import { useAuth } from "@/hooks/useAuth";
import { TemplateDialog } from "@/components/templates/TemplateDialog";
import { DeleteTemplateDialog } from "@/components/templates/DeleteTemplateDialog";
import { userHasBrandAccess } from "@/lib/brandAccess";

const FormTemplates = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);

  const { user } = useAuth();
  const { data: templates = [], isLoading } = useFormTemplates();
  const createTemplate = useCreateFormTemplate();
  const updateTemplate = useUpdateFormTemplate();
  const deleteTemplate = useDeleteFormTemplate();

  // Determine if user is Custom-only (restricted to assigned brands)
  const isCustomUser = !!(
    user?.user_type?.includes("Custom") &&
    !user.user_type.some(t => ["Super Admin", "Admin", "Dev"].includes(t))
  );

  // Filter templates by assigned brands for Custom users (or all, current &
  // future, for an All-Brands grant)
  const visibleTemplates = isCustomUser
    ? templates.filter(t => userHasBrandAccess(user, t.brand_id || ""))
    : templates;

  const filteredTemplates = visibleTemplates.filter((t) => {
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
      deleteTemplate.mutate(selectedTemplate.id, { onSuccess: () => setDeleteDialogOpen(false) });
    }
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Templates</h1>
            <p className="page-description">Manage reusable form templates by funnel</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Template
          </Button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search templates..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
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
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery || funnelFilter !== "all" ? "No templates match your search" : "No templates yet. Click 'Add Template' to create one."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground break-words line-clamp-2">{template.name}</h3>
                        <Badge variant="secondary" className="mt-1">{template.funnel}</Badge>
                        {template.concept_name && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{template.concept_name}</p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="flex-shrink-0">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(template)}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(template)} className="text-destructive">
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
      </div>

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
    </DashboardLayout>
  );
};

export default FormTemplates;
