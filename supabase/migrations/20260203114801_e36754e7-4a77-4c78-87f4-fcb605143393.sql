-- Add generated_images_drive_link column to products table
ALTER TABLE public.products 
ADD COLUMN generated_images_drive_link text;