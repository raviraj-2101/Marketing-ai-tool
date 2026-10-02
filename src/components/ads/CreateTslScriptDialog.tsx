import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBrands, type Brand } from '@/hooks/useBrands';
import { useFilteredBrands } from '@/hooks/useFilteredBrands';
import { useProducts, type Product } from '@/hooks/useProducts';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTslScriptDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { data: brands = [], isLoading: brandsLoading } = useFilteredBrands();
  const { products = [], isLoading: productsLoading } = useProducts();

  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [coreId, setCoreId] = useState('');
  const [variation, setVariation] = useState('');

  const filteredProducts = products.filter((p: Product) => p.brand_id === selectedBrandId);
  const selectedBrand = brands.find((b: Brand) => b.id === selectedBrandId);
  const selectedProduct = products.find((p: Product) => p.id === selectedProductId);

  const mutation = useMutation({
    mutationFn: async () => {
      const baseUrl = import.meta.env.VITE_PIPELINE_API_BASE_URL;
      const res = await fetch(`${baseUrl}/api/create-tsl-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          core_id: Number(coreId),
          variation: Number(variation),
          brand_code: selectedBrand?.brand_code,
          product_code: selectedProduct?.product_code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create TSL script');
      return data;
    },
    onSuccess: (data) => {
      toast({ title: 'TSL Script created', description: `ID: ${data.tsl_script_id}` });
      queryClient.invalidateQueries({ queryKey: ['tsl-scripts'] });
      handleClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  function handleClose() {
    setSelectedBrandId('');
    setSelectedProductId('');
    setCoreId('');
    setVariation('');
    onOpenChange(false);
  }

  function handleBrandChange(value: string) {
    setSelectedBrandId(value);
    setSelectedProductId('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBrandId || !selectedProductId || !coreId || !variation) return;
    mutation.mutate();
  }

  const isSubmitDisabled =
    mutation.isPending || !selectedBrandId || !selectedProductId || !coreId || !variation;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create TSL Script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select value={selectedBrandId} onValueChange={handleBrandChange}>
              <SelectTrigger>
                <SelectValue placeholder={brandsLoading ? 'Loading…' : 'Select brand'} />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b: Brand) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select
              value={selectedProductId}
              onValueChange={setSelectedProductId}
              disabled={!selectedBrandId || productsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={productsLoading ? 'Loading…' : 'Select product'} />
              </SelectTrigger>
              <SelectContent>
                {filteredProducts.map((p: Product) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Core ID</Label>
            <Input
              type="number"
              value={coreId}
              onChange={(e) => setCoreId(e.target.value)}
              placeholder="e.g. 42"
              min={1}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Variation</Label>
            <Input
              type="number"
              value={variation}
              onChange={(e) => setVariation(e.target.value)}
              placeholder="e.g. 1"
              min={0}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {mutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
