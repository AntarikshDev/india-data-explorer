# EdSetu Lead Scraper

A web app where you type a query like *"Coaching classes in sector 135 Noida"*, pick a source (Google Maps / JustDial / IndiaMART / All), and get a clean table of leads. Export to Excel, save history, or push selected rows into your EdSetu Command CRM.

## How it works (plain language)

1. You enter a query and pick sources.
2. The app sends the job to a backend that uses **Firecrawl** (a managed scraping API that handles proxies, JavaScript rendering, and anti-bot challenges). Your browser never touches the target sites — so no CORS, no blocking, no Windows needed.
3. Firecrawl returns the page contents; the backend parses them into a clean schema (name, phone, address, rating, category, website, source URL).
4. Results stream into a live table. You can edit, deduplicate, export, or push to CRM.

## Honest expectations on each source

- **JustDial & IndiaMART** — high reliability via Firecrawl. These are the strongest fits.
- **Google Maps** — works, but Google fights bots harder. Expect occasional partial results. If volume grows, we add Google Places API as a fallback (separate decision later).
- Phone numbers on JustDial/IndiaMART are sometimes click-to-reveal — Firecrawl's "wait for" + interaction options handle most cases; a small percentage may come back masked.

## Pages

- **/ (Search)** — query box, source checkboxes, results-per-source slider (10/25/50), city autocomplete suggestions, "Run" button, live progress panel.
- **/results/:runId** — the big editable table. Columns: select, name, phone, email, address, city, category, rating, reviews, website, source, source URL, scraped at. Sort, filter, dedupe by phone, bulk delete, bulk export, bulk push-to-CRM.
- **/history** — every past run with query, sources, count, date, and quick actions (re-run, view, export, delete).
- **/settings** — Firecrawl connection status, EdSetu Command CRM connection (API URL + key), default export columns, dedupe rules.

## Data model (Lovable Cloud / Supabase)

- `scrape_runs` — id, query, sources[], status (queued/running/done/failed), counts, created_at, error.
- `leads` — id, run_id, name, phone, email, address, city, category, rating, reviews_count, website, source (gmaps/justdial/indiamart), source_url, raw_json, scraped_at, pushed_to_crm_at, dedupe_hash.
- Unique index on `dedupe_hash` per user so re-runs don't duplicate.

## Backend jobs

- `POST /api/scrape` server function — creates a run, kicks off async work.
- A worker server function per source builds the right Firecrawl call:
  - **JustDial:** `https://www.justdial.com/<city>/<query>` → Firecrawl scrape with `formats: ['markdown', { type: 'json', schema: leadSchema }]` and `onlyMainContent: true`.
  - **IndiaMART:** search URL → same JSON-extraction pattern.
  - **Google Maps:** `https://www.google.com/maps/search/<query>` → Firecrawl with `waitFor` + JSON extraction.
- Results parsed with Zod, deduped, inserted in batches, run status updated.
- Live updates to the UI via Supabase Realtime on the `leads` table.

## Excel export

- "Export to Excel" button on results page → server function builds an `.xlsx` with `exceljs` (formatted headers, frozen top row, autofilters, phone as text to preserve leading zeros) and streams it to download. Also supports CSV.

## Push to EdSetu Command CRM

Two options — we'll confirm whichever you want during build:
- **A. Direct DB write** — if EdSetu Command is on the same Supabase, add a server function that inserts into its `contacts`/`leads` table using a service-role key stored as a secret. Fastest, cleanest.
- **B. HTTP API** — EdSetu Command exposes `/api/public/leads/import` with HMAC signature; this app POSTs selected leads to it. Decoupled, safer.

Default assumption: **B (HTTP)**. Switchable to A on request.

## Cost & limits (start-small posture)

- Firecrawl free tier (~500 credits/mo) covers initial testing. ~1 credit per page scraped.
- App enforces a per-day cap (configurable in /settings) so a runaway query can't drain credits.
- Every run shows estimated credit cost before you confirm.

## Tech notes

```text
Frontend:  TanStack Start + Tailwind + shadcn/ui
Backend:   createServerFn handlers + Lovable Cloud (Supabase)
Scraping:  Firecrawl connector (server-side only, key never reaches browser)
Excel:     exceljs in a server function, streamed download
Realtime:  Supabase Realtime on `leads` table for live row updates
Auth:      Supabase email/password, single user, RLS scoped to user_id
```

## What you'll be asked to do during build

1. Approve enabling **Lovable Cloud** (database + auth).
2. Approve linking the **Firecrawl connector** (one click; no key to paste).
3. Confirm CRM push method (HTTP vs direct DB) and provide the EdSetu Command endpoint/key at that step.

## Out of scope for v1 (can add later)

- Google Places API fallback for Google Maps reliability
- Email enrichment (Hunter.io / Apollo)
- Scheduled recurring scrapes
- Team / multi-user with roles
- WhatsApp / email outreach from inside the app