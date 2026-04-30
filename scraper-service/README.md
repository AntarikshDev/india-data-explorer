# EdSetu Scraper Service

Self-hosted Playwright scraper for **Google Maps**, **JustDial**, and **IndiaMART**.
Replaces Firecrawl in the main app — no per-scrape cost, full control over selectors and anti-bot tweaks.

> ⚠️ This service **cannot run inside Lovable / Cloudflare Workers** (no Chromium). Deploy it separately on Railway, Render, Fly, or any Node host.

## Endpoints

- `GET  /health` → `{ ok: true }`
- `POST /scrape` → body `{ source, query, city, limit }` → `{ leads, sourceUrl, error? }`

`source` is one of `gmaps | justdial | indiamart`.

## Local run

```bash
cd scraper-service
npm install            # also installs Playwright Chromium
SCRAPER_SERVICE_TOKEN=devtoken npm start
# test:
curl -X POST http://localhost:8080/scrape \
  -H "Authorization: Bearer devtoken" \
  -H "Content-Type: application/json" \
  -d '{"source":"gmaps","query":"coaching classes","city":"Lucknow","limit":10}'
```

## Deploy on Railway (recommended, ~5 min)

1. Push the **`scraper-service/`** folder to a new GitHub repo (or the same repo as your Lovable project — point Railway at this subfolder).
2. railway.app → **New Project → Deploy from GitHub repo**.
3. Settings → **Root Directory** = `scraper-service`.
4. **Variables**:
   - `SCRAPER_SERVICE_TOKEN` = any long random string (e.g. `openssl rand -hex 32`)
5. Deploy. Copy the public URL (e.g. `https://edsetu-scraper.up.railway.app`).

## Deploy on Render

1. New → Web Service → connect repo.
2. Root Directory: `scraper-service`.
3. Prefer **Docker** runtime so the Playwright browser and Linux libraries stay in sync with `package.json`.
   - If using Node runtime: Build `npm install`; Start `npm start`.
4. Add env var `SCRAPER_SERVICE_TOKEN`.

## Wire up the Lovable app

In your Lovable project, add **two secrets** (Cloud → Secrets):

| Name | Value |
|------|-------|
| `SCRAPER_SERVICE_URL` | `https://<your-deploy>.up.railway.app` (no trailing slash) |
| `SCRAPER_SERVICE_TOKEN` | same token you set on the service |

That's it. As soon as `SCRAPER_SERVICE_URL` is present, the app calls your scraper instead of Firecrawl. Remove the secret to fall back to Firecrawl.

## Maintenance

Directory sites change their HTML often. If a source starts returning 0 leads:

- Open `src/sources/<source>.js`.
- Inspect the live page in a browser, find the new class names, update the selectors.
- Redeploy.

Common breakage points are documented inline in each source file.

## Cost

Railway hobby plan (~$5/mo) handles light traffic. Each scrape = ~5–15s of CPU + ~50–150 MB RAM peak. No per-request cost beyond hosting.
