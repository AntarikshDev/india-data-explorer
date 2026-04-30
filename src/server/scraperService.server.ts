// Client for a self-hosted scraper microservice (Playwright-based).
// When SCRAPER_SERVICE_URL is configured, the app will call this service
// instead of Firecrawl. Deploy the service from the `scraper-service/`
// folder at the repo root onto Railway, Render, Fly, or any Node host.
import type { Source } from "@/lib/leadTypes";
import type { RawLead } from "./firecrawl.server";

export interface ScraperServiceResponse {
  leads: RawLead[];
  sourceUrl: string;
  error?: string;
}

export function isCustomScraperEnabled(): boolean {
  return Boolean(process.env.SCRAPER_SERVICE_URL);
}

export async function scrapeViaService(opts: {
  source: Source;
  query: string;
  city: string | null;
  limit: number;
}): Promise<ScraperServiceResponse> {
  const baseUrl = process.env.SCRAPER_SERVICE_URL;
  if (!baseUrl) throw new Error("SCRAPER_SERVICE_URL is not configured");
  const token = process.env.SCRAPER_SERVICE_TOKEN ?? "";

  const url = `${baseUrl.replace(/\/$/, "")}/scrape`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const text = await res.text();
      return { leads: [], sourceUrl: "", error: `Scraper ${res.status}: ${text.slice(0, 300)}` };
    }
    const json = (await res.json()) as ScraperServiceResponse;
    return {
      leads: json.leads ?? [],
      sourceUrl: json.sourceUrl ?? "",
      error: json.error,
    };
  } catch (err) {
    return { leads: [], sourceUrl: "", error: err instanceof Error ? err.message : "Scraper service error" };
  }
}
