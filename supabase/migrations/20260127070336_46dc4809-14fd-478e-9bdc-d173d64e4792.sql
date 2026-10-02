-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  docs_file_url TEXT,
  guidelines TEXT,
  publisher_comparison TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create product_images table (images with explanations)
CREATE TABLE public.product_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  explanation TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create product_comparison_brands table (top 5 brands for comparison)
CREATE TABLE public.product_comparison_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  order_index INTEGER NOT NULL CHECK (order_index >= 1 AND order_index <= 5),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_comparison_brands ENABLE ROW LEVEL SECURITY;

-- RLS policies for products
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete products" ON public.products FOR DELETE TO authenticated USING (true);

-- RLS policies for product_images
CREATE POLICY "Authenticated users can view product_images" ON public.product_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create product_images" ON public.product_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_images" ON public.product_images FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete product_images" ON public.product_images FOR DELETE TO authenticated USING (true);

-- RLS policies for product_comparison_brands
CREATE POLICY "Authenticated users can view product_comparison_brands" ON public.product_comparison_brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create product_comparison_brands" ON public.product_comparison_brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_comparison_brands" ON public.product_comparison_brands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete product_comparison_brands" ON public.product_comparison_brands FOR DELETE TO authenticated USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage buckets for files
INSERT INTO storage.buckets (id, name, public) VALUES ('product-docs', 'product-docs', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('comparison-images', 'comparison-images', true);

-- Storage policies for product-docs
CREATE POLICY "Authenticated users can upload product docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-docs');
CREATE POLICY "Authenticated users can update product docs" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-docs');
CREATE POLICY "Authenticated users can delete product docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-docs');
CREATE POLICY "Anyone can view product docs" ON storage.objects FOR SELECT USING (bucket_id = 'product-docs');

-- Storage policies for product-images
CREATE POLICY "Authenticated users can upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Authenticated users can update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated users can delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Anyone can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');

-- Storage policies for comparison-images
CREATE POLICY "Authenticated users can upload comparison images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comparison-images');
CREATE POLICY "Authenticated users can update comparison images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'comparison-images');
CREATE POLICY "Authenticated users can delete comparison images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'comparison-images');
CREATE POLICY "Anyone can view comparison images" ON storage.objects FOR SELECT USING (bucket_id = 'comparison-images');