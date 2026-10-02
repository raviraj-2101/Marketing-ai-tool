CREATE TABLE ugc_automations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL,
  name               TEXT NOT NULL,
  mode               TEXT NOT NULL CHECK (mode IN ('NN','IT')),
  product            TEXT NOT NULL,
  angle              TEXT,
  persona            TEXT,
  pain_points        JSONB,
  sub_angle          TEXT,
  avatar_type        TEXT NOT NULL DEFAULT 'mix'
                       CHECK (avatar_type IN ('doctor','normal','natural_wellness','mix')),
  avatar_pool        JSONB,
  scripts_per_run    INT NOT NULL DEFAULT 3,
  avatars_per_script INT NOT NULL DEFAULT 3,
  iterate_from_ad_id TEXT,
  iterate_criteria   JSONB,
  cs_owner           TEXT NOT NULL DEFAULT 'Agentic',
  interval_minutes   INT NOT NULL DEFAULT 1440,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  last_run_at        TIMESTAMPTZ,
  next_run_at        TIMESTAMPTZ
);

CREATE TABLE ugc_automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   UUID NOT NULL REFERENCES ugc_automations(id),
  user_id         UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  thought_process TEXT,
  inspo_summary   TEXT,
  scripts_json    JSONB,
  lineage_json    JSONB,
  error           TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX ugc_automation_runs_automation_id_idx ON ugc_automation_runs(automation_id);
CREATE INDEX ugc_automations_next_run_idx ON ugc_automations(next_run_at) WHERE enabled = TRUE;

ALTER TABLE ugc_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ugc_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_automations" ON ugc_automations
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_automation_runs" ON ugc_automation_runs
  USING (true) WITH CHECK (true);
