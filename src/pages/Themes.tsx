import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Palette } from "lucide-react";
import { useThemes, useCreateTheme, useUpdateTheme, useDeleteTheme, Theme, ThemeFormData } from "@/hooks/useThemes";
import { ThemeDialog } from "@/components/themes/ThemeDialog";
import { DeleteThemeDialog } from "@/components/themes/DeleteThemeDialog";

const Themes = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);

  const { data: themes = [], isLoading } = useThemes();
  const createTheme = useCreateTheme();
  const updateTheme = useUpdateTheme();
  const deleteTheme = useDeleteTheme();

  const filteredThemes = themes.filter((theme) =>
    theme.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    setSelectedTheme(null);
    setDialogOpen(true);
  };

  const handleEdit = (theme: Theme) => {
    setSelectedTheme(theme);
    setDialogOpen(true);
  };

  const handleDelete = (theme: Theme) => {
    setSelectedTheme(theme);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = (formData: ThemeFormData) => {
    if (selectedTheme) {
      updateTheme.mutate(
        { id: selectedTheme.id, formData },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createTheme.mutate(formData, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleConfirmDelete = () => {
    if (selectedTheme) {
      deleteTheme.mutate(selectedTheme.id, { onSuccess: () => setDeleteDialogOpen(false) });
    }
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Themes</h1>
            <p className="page-description">Manage your prompt themes</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Theme
          </Button>
        </div>

        <div className="mb-6">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search themes..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading themes...</div>
        ) : filteredThemes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery ? "No themes match your search" : "No themes yet. Click 'Add Theme' to create one."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredThemes.map((theme) => (
              <Card key={theme.id} className="hover:shadow-md transition-shadow h-[120px] overflow-hidden">
                <CardContent className="p-5 h-full">
                  <div className="flex items-start justify-between gap-2 h-full">
                    <div className="flex items-start gap-4 min-w-0 flex-1 overflow-hidden">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Palette className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <h3 className="font-medium text-foreground break-words line-clamp-2">{theme.name}</h3>
                        {theme.content && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">
                            {stripHtml(theme.content)}
                          </p>
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
                        <DropdownMenuItem onClick={() => handleEdit(theme)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(theme)} className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
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

      <ThemeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        theme={selectedTheme}
        onSubmit={handleSubmit}
        isLoading={createTheme.isPending || updateTheme.isPending}
      />

      <DeleteThemeDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        theme={selectedTheme}
        onConfirm={handleConfirmDelete}
        isLoading={deleteTheme.isPending}
      />
    </DashboardLayout>
  );
};

export default Themes;
