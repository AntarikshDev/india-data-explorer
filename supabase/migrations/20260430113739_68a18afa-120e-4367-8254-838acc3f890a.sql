-- Geo columns on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS state_code text,
  ADD COLUMN IF NOT EXISTS district_id uuid,
  ADD COLUMN IF NOT EXISTS district_name text,
  ADD COLUMN IF NOT EXISTS locality_id uuid,
  ADD COLUMN IF NOT EXISTS locality_name text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_leads_user_score ON public.leads (user_id, score DESC, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_state ON public.leads (user_id, state_code);
CREATE INDEX IF NOT EXISTS idx_leads_user_district ON public.leads (user_id, district_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_locality ON public.leads (user_id, locality_id);

-- Lead edits audit
CREATE TABLE IF NOT EXISTS public.lead_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own lead_edits" ON public.lead_edits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own lead_edits" ON public.lead_edits FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Lead sets (saved filters for the queue)
CREATE TABLE IF NOT EXISTS public.lead_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  state_code text,
  district_id uuid,
  district_name text,
  locality_id uuid,
  locality_name text,
  category_query text,
  name_query text,
  min_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own lead_sets" ON public.lead_sets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own lead_sets" ON public.lead_sets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own lead_sets" ON public.lead_sets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own lead_sets" ON public.lead_sets FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_lead_sets_updated_at BEFORE UPDATE ON public.lead_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRM webhook (separate from generic CRM endpoint — this one is fired by daily cron)
ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS crm_webhook_url text,
  ADD COLUMN IF NOT EXISTS daily_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_daily_sync_at timestamptz;