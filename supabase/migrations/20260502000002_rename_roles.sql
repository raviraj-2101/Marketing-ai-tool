-- Migration: Rename roles CS → Static Generator, Editor → Video Generator
-- This updates the live user data to reflect the new role names

UPDATE public.users
SET roles = array_replace(roles, 'CS', 'Static Generator');

UPDATE public.users
SET roles = array_replace(roles, 'Editor', 'Video Generator');
