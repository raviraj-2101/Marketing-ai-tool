-- Adds an Edit Type (Self-Edited vs Editor-Edited) filter to cs_pace().
--
-- Background: ads now carry an `edit_type` column (default 'Editor-Edited';
-- 'Self-Edited' is stamped by the AI/UGC tool). The CS Pace tab gains a toggle
-- that flips its numbers between the two edit types. The aggregate already sums
-- ads.points per bucket, so the Self-Edited "Points next to Quantity" column needs
-- no shape change — only an edit_type predicate so counts/points follow the toggle.
--
-- p_edit_type is appended LAST so the change is additive. NULL = both edit types
-- (the historical "count everything" behaviour, preserved for any caller that
-- omits the new arg).
--
-- edit_type is guarded with ADD COLUMN IF NOT EXISTS so this migration is
-- self-contained even if applied before the table-column migration.
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS edit_type text NOT NULL DEFAULT 'Editor-Edited';

-- Drop the old 4-arg signature (adding a parameter would otherwise leave a stale overload).
DROP FUNCTION IF EXISTS public.cs_pace(date, date, text[], text[]);

CREATE OR REPLACE FUNCTION public.cs_pace(
  p_from      date,
  p_to        date,
  p_brands    text[] DEFAULT NULL::text[],
  p_cs        text[] DEFAULT NULL::text[],
  p_edit_type text   DEFAULT NULL::text
)
 RETURNS TABLE(cs text, added_count bigint, added_points bigint, delivered_count bigint, delivered_points bigint, approved_count bigint, approved_points bigint)
 LANGUAGE sql
 STABLE
AS $function$
  -- Canonical CS list — same derivation as the /api/cs-editor-options endpoint:
  -- CS labels (cs_config.label) for emails assigned as main_cs/secondary_cs on
  -- brands. This keeps the pace table free of dirty cs values in `ads`
  -- (case variants, raw emails, editors, etc.). Brand-scoped when p_brands is set.
  with valid_cs as (
    select distinct cc.label
    from public.cs_config cc
    join public.brands b
      on cc.value = any (coalesce(b.main_cs, '{}') || coalesce(b.secondary_cs, '{}'))
    where cc.label is not null
      and (p_brands is null or b.name = any (p_brands))
  )
  select
    a.cs,
    count(*) filter (
      where (a.created_at at time zone 'UTC')::date between p_from and p_to
    ) as added_count,
    coalesce(sum(a.points) filter (
      where (a.created_at at time zone 'UTC')::date between p_from and p_to
    ), 0) as added_points,
    count(*) filter (
      where a.first_pending_review_date between p_from and p_to
    ) as delivered_count,
    coalesce(sum(a.points) filter (
      where a.first_pending_review_date between p_from and p_to
    ), 0) as delivered_points,
    count(*) filter (
      where a.first_approved_date between p_from and p_to
    ) as approved_count,
    coalesce(sum(a.points) filter (
      where a.first_approved_date between p_from and p_to
    ), 0) as approved_points
  from public.ads a
  where a.cs in (select label from valid_cs)
    and (
         (a.created_at at time zone 'UTC')::date between p_from and p_to
      or a.first_pending_review_date between p_from and p_to
      or a.first_approved_date between p_from and p_to
    )
    and (p_brands is null or a.brand = any (p_brands))
    and (
      p_cs is null
      or exists (select 1 from unnest(p_cs) as c where a.cs ilike '%' || c || '%')
    )
    and (p_edit_type is null or coalesce(a.edit_type, 'Editor-Edited') = p_edit_type)
  group by a.cs
  order by a.cs;
$function$;
