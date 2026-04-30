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
}

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
  created_at: string;
  updated_at: string;
}
