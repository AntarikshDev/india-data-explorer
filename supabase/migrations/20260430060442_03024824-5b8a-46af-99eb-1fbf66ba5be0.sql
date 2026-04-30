ALTER TABLE public.scrape_runs ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.scrape_runs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.scrape_runs ADD COLUMN IF NOT EXISTS finished_at timestamptz;