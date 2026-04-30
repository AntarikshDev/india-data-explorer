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
  business_website?: string;
  listing_url?: string;
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
          business_website: { type: "string", description: "The business's own website (NOT the directory listing URL)" },
          listing_url: { type: "string", description: "URL of the listing page on the directory site" },
        },
      },
    },
  },
  required: ["leads"],
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
}

function buildSourceUrl(source: Source, query: string, city: string | null, page: number): string {
  const cityRaw = (city || "").trim();
  switch (source) {
    case "gmaps": {
      const q = encodeURIComponent(cityRaw ? `${query} ${cityRaw}` : query);
      return `https://www.google.com/maps/search/${q}`;
    }
    case "justdial": {
      // JustDial expects: https://www.justdial.com/<City>/<Query-Hyphenated>/nct-10422745
      // Fall back to global search if no city.
      if (!cityRaw) {
        const base = `https://www.justdial.com/search?q=${encodeURIComponent(query)}`;
        return page > 1 ? `${base}&page=${page}` : base;
      }
      const citySlug = titleCase(cityRaw);
      const querySlug = titleCase(query);
      const base = `https://www.justdial.com/${citySlug}/${querySlug}`;
      return page > 1 ? `${base}/page-${page}` : base;
    }
    case "indiamart": {
      const ss = query.trim().replace(/\s+/g, "+");
      const cq = cityRaw.replace(/\s+/g, "+");
      const base = `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(ss).replace(/%2B/g, "+")}${
        cq ? `&cq=${encodeURIComponent(cq).replace(/%2B/g, "+")}` : ""
      }`;
      return page > 1 ? `${base}&start=${(page - 1) * 25}` : base;
    }
  }
}

function buildPrompt(opts: { limit: number; city: string | null; query: string }): string {
  const cityClause = opts.city
    ? ` Only include businesses physically located in or directly serving "${opts.city}". Reject results from neighbouring cities.`
    : "";
  return `Extract up to ${opts.limit} business listings matching "${opts.query}".${cityClause} For each listing return: name, phone (digits only), address, city, category, rating, reviews_count, business_website (the company's own site, NOT the directory page), and listing_url (the directory page URL). Skip ads, sponsored slots, and navigation items. Only real businesses visible in the listings.`;
}

async function scrapeOnce(opts: {
  source: Source;
  url: string;
  prompt: string;
  limit: number;
  apiKey: string;
}): Promise<{ leads: RawLead[]; error?: string }> {
  // JustDial often hides phone behind "Show Number" — click before extract.
  const actions =
    opts.source === "justdial"
      ? [
          { type: "wait", milliseconds: 2000 },
          { type: "click", selector: "span.callNowAnchor, .callcontent, [data-track='Call']", all: true },
          { type: "wait", milliseconds: 1500 },
        ]
      : undefined;

  const body: Record<string, unknown> = {
    url: opts.url,
    formats: [{ type: "json", schema: leadJsonSchema, prompt: opts.prompt }],
    onlyMainContent: true,
    waitFor: opts.source === "gmaps" ? 3500 : 2000,
    timeout: 75000,
  };
  if (actions) body.actions = actions;

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { leads: [], error: `Firecrawl ${res.status}: ${text.slice(0, 300)}` };
    }
    const json: unknown = await res.json();
    const data = (json as { data?: { json?: { leads?: RawLead[] } } }).data;
    return { leads: data?.json?.leads ?? [] };
  } catch (err) {
    return { leads: [], error: err instanceof Error ? err.message : "Unknown scrape error" };
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

  const prompt = buildPrompt(opts);
  const firstUrl = buildSourceUrl(opts.source, opts.query, opts.city, 1);

  // Page 1
  const all: RawLead[] = [];
  const errors: string[] = [];
  const first = await scrapeOnce({ source: opts.source, url: firstUrl, prompt, limit: opts.limit, apiKey });
  if (first.error) errors.push(first.error);
  all.push(...first.leads);

  // Paginate JustDial / IndiaMART up to ~3 pages until we have enough
  if ((opts.source === "justdial" || opts.source === "indiamart") && all.length < opts.limit) {
    for (let p = 2; p <= 3 && all.length < opts.limit; p++) {
      const url = buildSourceUrl(opts.source, opts.query, opts.city, p);
      const next = await scrapeOnce({
        source: opts.source,
        url,
        prompt: buildPrompt({ ...opts, limit: opts.limit - all.length }),
        limit: opts.limit - all.length,
        apiKey,
      });
      if (next.error) {
        errors.push(`p${p}: ${next.error}`);
        break;
      }
      if (next.leads.length === 0) break;
      all.push(...next.leads);
    }
  }

  return {
    leads: all.slice(0, opts.limit),
    sourceUrl: firstUrl,
    error: all.length === 0 && errors.length ? errors.join(" | ") : undefined,
  };
}

export function dedupeHash(source: Source, name: string | undefined, phone: string | undefined): string {
  const p = (phone || "").replace(/\D/g, "");
  if (p.length >= 7) return `phone:${p}`;
  return `${source}:${(name || "").trim().toLowerCase()}`;
}

// ---------- Scoring ----------

export interface ScoreResult {
  score: number;
  reasons: Record<string, number>;
}

export function scoreLead(l: {
  phone?: string | null;
  email?: string | null;
  email_enriched?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  website?: string | null;
  category?: string | null;
}, queryCategory?: string): ScoreResult {
  const reasons: Record<string, number> = {};
  if (l.phone && l.phone.replace(/\D/g, "").length >= 10) reasons.phone = 30;
  if (l.email || l.email_enriched) reasons.email = 15;
  if (typeof l.rating === "number" && l.rating >= 4) reasons.rating = 15;
  else if (typeof l.rating === "number" && l.rating >= 3) reasons.rating = 7;
  if (typeof l.reviews_count === "number" && l.reviews_count >= 20) reasons.reviews = 10;
  else if (typeof l.reviews_count === "number" && l.reviews_count >= 5) reasons.reviews = 5;
  if (l.website && /^https?:\/\//i.test(l.website)) reasons.website = 10;
  if (queryCategory && l.category && l.category.toLowerCase().includes(queryCategory.toLowerCase())) {
    reasons.category_match = 10;
  }
  // Floor of 10 if we have at least name+phone, to avoid all-zero ranking
  const total = Math.min(100, Object.values(reasons).reduce((a, b) => a + b, 0));
  return { score: total, reasons };
}
