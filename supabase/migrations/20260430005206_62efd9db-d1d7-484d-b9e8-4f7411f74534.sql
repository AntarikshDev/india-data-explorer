
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Scrape runs
CREATE TABLE public.scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  city TEXT,
  sources TEXT[] NOT NULL DEFAULT '{}',
  results_per_source INT NOT NULL DEFAULT 25,
  status TEXT NOT NULL DEFAULT 'queued',
  total_count INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own runs" ON public.scrape_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own runs" ON public.scrape_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own runs" ON public.scrape_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own runs" ON public.scrape_runs FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_scrape_runs_user_created ON public.scrape_runs(user_id, created_at DESC);

-- Leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id UUID NOT NULL REFERENCES public.scrape_runs(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  category TEXT,
  rating NUMERIC,
  reviews_count INT,
  website TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  raw_json JSONB,
  dedupe_hash TEXT NOT NULL,
  pushed_to_crm_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own leads" ON public.leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own leads" ON public.leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own leads" ON public.leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own leads" ON public.leads FOR DELETE USING (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_leads_user_dedupe ON public.leads(user_id, dedupe_hash);
CREATE INDEX idx_leads_run ON public.leads(run_id);

-- CRM settings
CREATE TABLE public.crm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  endpoint_url TEXT,
  api_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  daily_credit_cap INT NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own crm" ON public.crm_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own crm" ON public.crm_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own crm" ON public.crm_settings FOR UPDATE USING (auth.uid() = user_id);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_runs_updated BEFORE UPDATE ON public.scrape_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_updated BEFORE UPDATE ON public.crm_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + crm_settings on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name) VALUES (NEW.id, NEW.email);
  INSERT INTO public.crm_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_runs;
