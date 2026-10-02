ALTER TABLE public.statics_logs
  ADD COLUMN week text DEFAULT NULL,
  ADD COLUMN creation_method text DEFAULT 'Auto',
  ADD COLUMN stage text DEFAULT 'Generating',
  ADD COLUMN clickup_task_status text DEFAULT 'to do';