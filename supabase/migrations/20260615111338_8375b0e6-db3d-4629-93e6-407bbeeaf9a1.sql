
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS pin_district_id uuid REFERENCES public.geo_districts(id),
  ADD COLUMN IF NOT EXISTS pin_locality_id uuid REFERENCES public.geo_localities(id);

ALTER TABLE public.campaign_targets
  ADD COLUMN IF NOT EXISTS locality_id uuid REFERENCES public.geo_localities(id),
  ADD COLUMN IF NOT EXISTS locality_name text;
