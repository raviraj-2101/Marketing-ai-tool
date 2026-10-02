-- Migration: grant the UGC Builder tool to existing CS users.
--
-- Per Liam's spec, creative strategists + admins both get the UGC Builder
-- (including Automations). Admins / Super Admins / Dev bypass `allowed_routes`
-- entirely (they see every route), so they need NO change here. Editors are
-- intentionally NOT touched.
--
-- A CS user = a Custom user with a '<brandId>:CS' entry in custom_role_types.
-- `allowed_routes` is TEXT[]; we union-in the UGC Builder routes, de-duplicated,
-- WITHOUT dropping any existing routes. Safe to re-run (idempotent).

UPDATE public.users u
SET allowed_routes = (
  SELECT ARRAY(
    SELECT DISTINCT e
    FROM unnest(
      u.allowed_routes || ARRAY[
        '/ugc-builder/generate-scripts',
        '/ugc-builder/batch-creator',
        '/ugc-builder/avatars',
        '/ugc-builder/video-build-log',
        '/ugc-builder/automations'
      ]::text[]
    ) AS e
  )
)
WHERE EXISTS (
  SELECT 1 FROM unnest(u.custom_role_types) AS crt WHERE crt LIKE '%:CS'
);
