
-- ================ Phase 4: Call Attempts ================
CREATE TYPE public.call_outcome AS ENUM (
  'connected', 'voicemail', 'not_interested', 'follow_up', 'wrong_number', 'skip'
);

CREATE TABLE public.call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  outcome public.call_outcome NOT NULL,
  notes text,
  next_action_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_attempts_user_lead ON public.call_attempts(user_id, lead_id);
CREATE INDEX idx_call_attempts_user_created ON public.call_attempts(user_id, created_at DESC);

ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own call_attempts" ON public.call_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own call_attempts" ON public.call_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own call_attempts" ON public.call_attempts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own call_attempts" ON public.call_attempts FOR DELETE USING (auth.uid() = user_id);

-- ================ Phase 5: Campaigns ================
CREATE TYPE public.campaign_status AS ENUM (
  'draft', 'active', 'paused', 'awaiting_next_state', 'completed'
);

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  query_template text NOT NULL,
  sources text[] NOT NULL DEFAULT '{gmaps,justdial}',
  results_per_source int NOT NULL DEFAULT 25,
  status public.campaign_status NOT NULL DEFAULT 'draft',

  -- Geo anchor & current cursor
  start_state_code text NOT NULL,
  current_state_code text,
  current_district_id uuid,

  -- Thresholds
  state_coverage_threshold int NOT NULL DEFAULT 80, -- %
  per_district_cap int NOT NULL DEFAULT 5,           -- max runs per district
  exhaustion_streak int NOT NULL DEFAULT 3,          -- N consecutive runs <5 leads = done

  -- Pacing
  daily_target_cap int NOT NULL DEFAULT 5,           -- max scrape runs/day
  schedule_enabled boolean NOT NULL DEFAULT false,

  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_user_status ON public.campaigns(user_id, status);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own campaigns" ON public.campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own campaigns" ON public.campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own campaigns" ON public.campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own campaigns" ON public.campaigns FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================ Phase 5: Campaign targets (planned route) ================
CREATE TYPE public.target_status AS ENUM ('queued', 'running', 'done', 'skipped', 'failed');

CREATE TABLE public.campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  state_code text NOT NULL,
  district_id uuid,
  district_name text,
  locality_id uuid,
  locality_name text,
  status public.target_status NOT NULL DEFAULT 'queued',
  scrape_run_id uuid,
  leads_inserted int NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0, -- ordering in the route
  scheduled_for timestamptz,
  ran_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_targets_campaign_status ON public.campaign_targets(campaign_id, status, position);
CREATE INDEX idx_targets_user ON public.campaign_targets(user_id);

ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own targets" ON public.campaign_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own targets" ON public.campaign_targets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own targets" ON public.campaign_targets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own targets" ON public.campaign_targets FOR DELETE USING (auth.uid() = user_id);

-- ================ Phase 6: Notifications ================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL, -- 'state_expand', 'campaign_done', 'cron_failure', etc.
  title text NOT NULL,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);
