// Firecrawl scraping helpers — server-only.
import type { Source } from "@/lib/leadTypes";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

export interface RawLead {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  category?: string;
  rating?: number;
  reviews_count?: number;
  website?: string;
}

const leadJsonSchema = {
  type: "object",
  properties: {
    leads: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Business or listing name" },
          phone: { type: "string", description: "Phone number, digits only if possible" },
          email: { type: "string" },
          address: { type: "string", description: "Full street address" },
          city: { type: "string" },
          category: { type: "string", description: "Business category or service type" },
          rating: { type: "number", description: "Star rating 0-5" },
          reviews_count: { type: "number" },
          website: { type: "string" },
        },
      },
    },
  },
  required: ["leads"],
};

function buildSourceUrl(source: Source, query: string, city: string | null): string {
  const q = encodeURIComponent(query);
  const c = encodeURIComponent((city || "").trim());
  switch (source) {
    case "gmaps":
      return `https://www.google.com/maps/search/${q}${c ? `+${c}` : ""}`;
    case "justdial":
      // JustDial city-scoped search; falls back to global search if no city
      return c
        ? `https://www.justdial.com/${c}/${q.replace(/%20/g, "-")}`
        : `https://www.justdial.com/search?q=${q}`;
    case "indiamart":
      return `https://dir.indiamart.com/search.mp?ss=${q}${c ? `&cq=${c}` : ""}`;
  }
}

export async function scrapeSource(opts: {
  source: Source;
  query: string;
  city: string | null;
  limit: number;
}): Promise<{ leads: RawLead[]; sourceUrl: string; error?: string }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not configured");

  const sourceUrl = buildSourceUrl(opts.source, opts.query, opts.city);

  const body = {
    url: sourceUrl,
    formats: [
      {
        type: "json",
        schema: leadJsonSchema,
        prompt: `Extract up to ${opts.limit} business listings from this page. For each listing, return name, phone, address, city, category, rating, reviews_count, website. Only include real businesses visible in the listings — skip ads and navigation.`,
      },
    ],
    onlyMainContent: true,
    waitFor: opts.source === "gmaps" ? 3500 : 2000,
    timeout: 60000,
  };

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { leads: [], sourceUrl, error: `Firecrawl ${res.status}: ${text.slice(0, 300)}` };
    }

    const json: unknown = await res.json();
    // Firecrawl v2 wraps result in { success, data: { json: {...}, metadata, ... } }
    const data = (json as { data?: { json?: { leads?: RawLead[] } } }).data;
    const leads = data?.json?.leads ?? [];
    return { leads: leads.slice(0, opts.limit), sourceUrl };
  } catch (err) {
    return {
      leads: [],
      sourceUrl,
      error: err instanceof Error ? err.message : "Unknown scrape error",
    };
  }
}

export function dedupeHash(source: Source, name: string | undefined, phone: string | undefined): string {
  const p = (phone || "").replace(/\D/g, "");
  if (p.length >= 7) return `phone:${p}`;
  return `${source}:${(name || "").trim().toLowerCase()}`;
}
