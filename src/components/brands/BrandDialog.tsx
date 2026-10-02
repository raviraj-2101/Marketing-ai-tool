import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";
import { Brand, BrandFormData } from "@/hooks/useBrands";

interface BrandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: Brand | null;
  onSubmit: (data: BrandFormData) => void;
  isLoading: boolean;
}

export const BrandDialog = ({ open, onOpenChange, brand, onSubmit, isLoading }: BrandDialogProps) => {
  const [name, setName] = useState("");
  const [brandCode, setBrandCode] = useState("");
  const [blackLogo, setBlackLogo] = useState<File | null>(null);
  const [whiteLogo, setWhiteLogo] = useState<File | null>(null);
  const [blackLogoPreview, setBlackLogoPreview] = useState<string | null>(null);
  const [whiteLogoPreview, setWhiteLogoPreview] = useState<string | null>(null);
  
  const blackLogoRef = useRef<HTMLInputElement>(null);
  const whiteLogoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (brand) {
      setName(brand.name);
      setBrandCode(brand.brand_code || "");
      setBlackLogoPreview(brand.black_logo_url);
      setWhiteLogoPreview(brand.white_logo_url);
    } else {
      setName("");
      setBrandCode("");
      setBlackLogo(null);
      setWhiteLogo(null);
      setBlackLogoPreview(null);
      setWhiteLogoPreview(null);
    }
  }, [brand, open]);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void,
    setPreview: (url: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearFile = (
    setFile: (file: File | null) => void,
    setPreview: (url: string | null) => void,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, brand_code: brandCode, blackLogo, whiteLogo });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{brand ? "Edit Brand" : "Add Brand"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter brand name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="brandCode">Brand Code</Label>
            <Input
              id="brandCode"
              value={brandCode}
              onChange={(e) => setBrandCode(e.target.value)}
              placeholder="e.g. LD, CL"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Black Logo</Label>
            <div className="flex items-center gap-3">
              {blackLogoPreview ? (
                <div className="relative w-16 h-16 border rounded-lg overflow-hidden bg-white">
                  <img src={blackLogoPreview} alt="Black logo" className="w-full h-full object-contain p-1" />
                  <button
                    type="button"
                    onClick={() => clearFile(setBlackLogo, setBlackLogoPreview, blackLogoRef)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => blackLogoRef.current?.click()}
                  className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                >
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <input
                ref={blackLogoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, setBlackLogo, setBlackLogoPreview)}
              />
              <span className="text-sm text-muted-foreground">
                {blackLogo ? blackLogo.name : "Upload black logo"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>White Logo</Label>
            <div className="flex items-center gap-3">
              {whiteLogoPreview ? (
                <div className="relative w-16 h-16 border rounded-lg overflow-hidden bg-muted-foreground/20">
                  <img src={whiteLogoPreview} alt="White logo" className="w-full h-full object-contain p-1" />
                  <button
                    type="button"
                    onClick={() => clearFile(setWhiteLogo, setWhiteLogoPreview, whiteLogoRef)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => whiteLogoRef.current?.click()}
                  className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-primary transition-colors bg-muted-foreground/20"
                >
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <input
                ref={whiteLogoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, setWhiteLogo, setWhiteLogoPreview)}
              />
              <span className="text-sm text-muted-foreground">
                {whiteLogo ? whiteLogo.name : "Upload white logo"}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim() || !brandCode.trim()}>
              {isLoading ? "Saving..." : brand ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
