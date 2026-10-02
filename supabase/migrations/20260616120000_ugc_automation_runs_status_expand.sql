-- Expand ugc_automation_runs.status to cover the granular render-status lifecycle.
--
-- The automation run no longer flips to 'completed' the instant HeyGen jobs are
-- submitted; it now carries its true derived state as videos render/merge:
--   pending → generating_scripts → rendering → merging
--            → completed | partial | failed | stalled
-- The original CHECK only allowed (pending, running, completed, failed,
-- cancelled), so writing any new value raised
-- "ugc_automation_runs_status_check" violations and the run was force-failed.
--
-- This drops the old constraint and re-adds it as a strict SUPERSET — every
-- previously-allowed value is preserved, so existing rows remain valid.

ALTER TABLE ugc_automation_runs
  DROP CONSTRAINT IF EXISTS ugc_automation_runs_status_check;

ALTER TABLE ugc_automation_runs
  ADD CONSTRAINT ugc_automation_runs_status_check
  CHECK (status IN (
    'pending',
    'generating_scripts',
    'rendering',
    'merging',
    'running',
    'completed',
    'partial',
    'failed',
    'stalled',
    'cancelled'
  ));
