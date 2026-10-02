-- Add unique constraint on inspos name
ALTER TABLE public.inspos
ADD CONSTRAINT unique_inspo_name UNIQUE (name);

-- Add unique constraint on publishers name
ALTER TABLE public.publishers
ADD CONSTRAINT unique_publisher_name UNIQUE (name);

-- Add unique constraint on brands name
ALTER TABLE public.brands
ADD CONSTRAINT unique_brand_name UNIQUE (name);

-- Add unique constraint on products name + brand combination
ALTER TABLE public.products
ADD CONSTRAINT unique_product_name_brand UNIQUE (name, brand_id);