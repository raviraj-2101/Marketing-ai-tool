ALTER TABLE avatars
  ADD COLUMN IF NOT EXISTS quality_status       text CHECK (quality_status IN ('approved','needs_review','disabled')),
  ADD COLUMN IF NOT EXISTS avatar_type_override text CHECK (avatar_type_override IN ('doctor','natural_wellness','normal'));
