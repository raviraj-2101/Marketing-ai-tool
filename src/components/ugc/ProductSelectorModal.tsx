import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

interface Product {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (product: string, title: string) => void;
  creating: boolean;
}

export function ProductSelectorModal({ open, onClose, onCreate, creating }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/api/ugc/products`)
      .then((r) => r.json())
      .then((data) => setProducts(data.products || []))
      .catch(() => setError("Failed to load products"))
      .finally(() => setLoading(false));
  }, [open]);

  function handleCreate() {
    if (!selectedProduct) return;
    const product = products.find((p) => p.id === selectedProduct);
    onCreate(selectedProduct, product?.name || selectedProduct);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Script Chat</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : (
          <div className="space-y-4 pt-2">
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!selectedProduct || creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Start Chat
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
