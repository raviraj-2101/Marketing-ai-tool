import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Image } from "lucide-react";
import { useBrands, useCreateBrand, useUpdateBrand, useDeleteBrand, Brand, BrandFormData } from "@/hooks/useBrands";
import { useAuth } from "@/hooks/useAuth";
import { BrandDialog } from "@/components/brands/BrandDialog";
import { DeleteBrandDialog } from "@/components/brands/DeleteBrandDialog";
import { filterBrandScoped } from "@/lib/brandAccess";

const Brands = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  const { data: allBrands = [], isLoading } = useBrands();
  const { user } = useAuth();
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const deleteBrand = useDeleteBrand();

  // Admin, Dev, and Super Admin can manage brands; Custom users (without other types) cannot
  const isCustomOnly = !!(
    user?.user_type?.includes("Custom") &&
    !user.user_type.some(t => ["Super Admin", "Admin", "Dev"].includes(t))
  );

  // Custom-only users see only assigned brands (or all, current & future, for
  // an All-Brands grant)
  const brands = isCustomOnly
    ? filterBrandScoped(user, allBrands, (b) => b.id)
    : allBrands;

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    setSelectedBrand(null);
    setDialogOpen(true);
  };

  const handleEdit = (brand: Brand) => {
    setSelectedBrand(brand);
    setDialogOpen(true);
  };

  const handleDelete = (brand: Brand) => {
    setSelectedBrand(brand);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = (formData: BrandFormData) => {
    if (selectedBrand) {
      updateBrand.mutate(
        { id: selectedBrand.id, formData, existingBrand: selectedBrand },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createBrand.mutate(formData, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleConfirmDelete = () => {
    if (selectedBrand) {
      deleteBrand.mutate(selectedBrand, { onSuccess: () => setDeleteDialogOpen(false) });
    }
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Brands</h1>
            <p className="page-description">Manage your brand portfolio</p>
          </div>
          <div className="flex items-center gap-2">
            {!isCustomOnly && (
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Add Brand
              </Button>
            )}
          </div>
        </div>

        <div className="mb-6">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search brands..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading brands...</div>
        ) : filteredBrands.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery ? "No brands match your search" : "No brands yet. Click 'Add Brand' to create one."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBrands.map((brand) => (
              <Card key={brand.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center overflow-hidden">
                        {brand.black_logo_url ? (
                          <img src={brand.black_logo_url} alt={brand.name} className="w-full h-full object-contain p-1" />
                        ) : (
                          <Image className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{brand.name}</h3>
                        {brand.brand_code && (
                          <span className="text-xs text-muted-foreground">Code: {brand.brand_code}</span>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {brand.black_logo_url && (
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Black</span>
                          )}
                          {brand.white_logo_url && (
                            <span className="text-xs bg-muted px-1.5 py-0.5 rounded">White</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(brand)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {!isCustomOnly && (
                          <DropdownMenuItem onClick={() => handleDelete(brand)} className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      brand.status === "Active" 
                        ? "bg-green-100 text-green-700" 
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {brand.status}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BrandDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brand={selectedBrand}
        onSubmit={handleSubmit}
        isLoading={createBrand.isPending || updateBrand.isPending}
      />

      <DeleteBrandDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        brand={selectedBrand}
        onConfirm={handleConfirmDelete}
        isLoading={deleteBrand.isPending}
      />
    </DashboardLayout>
  );
};

export default Brands;
