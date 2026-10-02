ALTER TABLE statics_logs ADD COLUMN IF NOT EXISTS generated_images jsonb DEFAULT '[]';
