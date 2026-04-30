export type Source = "gmaps" | "justdial" | "indiamart";

export const SOURCE_LABELS: Record<Source, string> = {
  gmaps: "Google Maps",
  justdial: "JustDial",
  indiamart: "IndiaMART",
};

export interface Lead {
  id: string;
  user_id: string;
  run_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  email_enriched: string | null;
  whatsapp: string | null;
  owner_name: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviews_count: number | null;
  website: string | null;
  listing_url: string | null;
  source: Source;
  source_url: string | null;
  raw_json: unknown;
  dedupe_hash: string;
  pushed_to_crm_at: string | null;
  score: number;
  score_reasons: Record<string, number> | null;
  scraped_at: string;
  state_code: string | null;
  district_id: string | null;
  district_name: string | null;
  locality_id: string | null;
  locality_name: string | null;
  notes: string | null;
}

export type SourceProgressStatus = "pending" | "running" | "done" | "failed";

export interface SourceProgress {
  status: SourceProgressStatus;
  inserted: number;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export type RunProgress = Partial<Record<Source, SourceProgress>>;

export interface ScrapeRun {
  id: string;
  user_id: string;
  query: string;
  city: string | null;
  sources: Source[];
  results_per_source: number;
  status: "queued" | "running" | "done" | "failed";
  total_count: number;
  error: string | null;
  progress: RunProgress;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}
