-- Add publisher_id foreign key to products table
ALTER TABLE public.products
ADD COLUMN publisher_id UUID REFERENCES public.publishers(id) ON DELETE SET NULL;

-- Create an index for better query performance
CREATE INDEX idx_products_publisher_id ON public.products(publisher_id);