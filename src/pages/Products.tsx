import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, ExternalLink, Image, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProducts, Product } from "@/hooks/useProducts";
import { useAuth } from "@/hooks/useAuth";
import { ProductDialog } from "@/components/products/ProductDialog";
import { DeleteProductDialog } from "@/components/products/DeleteProductDialog";

const Products = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { products, isLoading, deleteProduct } = useProducts();

  const filteredProducts = (products || []).filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.brands?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setDialogOpen(true);
  };

  const handleDelete = (product: Product) => {
    setSelectedProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleAddNew = () => {
    setSelectedProduct(null);
    setDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Products</h1>
            <p className="page-description">Manage your product catalog</p>
          </div>
          <Button onClick={handleAddNew} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            {isLoading ? "Loading..." : "Add Product"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">All Products</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search products..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading products...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? "No products found matching your search." : "No products yet. Add your first product!"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Publisher</TableHead>
                    <TableHead className="text-center">Images</TableHead>
                    <TableHead>Docs Knowledge</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.product_code || "-"}</TableCell>
                      <TableCell>{product.brands?.name || "-"}</TableCell>
                      <TableCell>
                        {product.publishers?.name ? (
                          <Badge variant="secondary">{product.publishers.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Image className="w-4 h-4 text-muted-foreground" />
                          <span>{product.product_images?.length || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.docs_file_url ? (
                          <a
                            href={product.docs_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-primary hover:underline"
                          >
                            <span className="truncate max-w-[200px] inline-block align-middle">
                              {product.docs_file_url}
                            </span>
                            <ExternalLink className="w-4 h-4 ml-2 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(product)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(product)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ProductDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        product={selectedProduct}
      />

      <DeleteProductDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        product={selectedProduct}
      />
    </DashboardLayout>
  );
};

export default Products;
