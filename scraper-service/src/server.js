// Self-hosted scraper service.
// POST /scrape  body: { source, query, city, limit }
// Auth: optional `Authorization: Bearer <SCRAPER_SERVICE_TOKEN>` header.
//
// Deploy:
//   1) Push this folder to Railway / Render / Fly / a VPS.
//   2) Set env vars:
//        PORT (provided by host)
//        SCRAPER_SERVICE_TOKEN  (any random string; share with the Lovable app)
//   3) In the Lovable app, add secrets:
//        SCRAPER_SERVICE_URL    = https://<your-deploy>.up.railway.app
//        SCRAPER_SERVICE_TOKEN  = <same token>
//   The Lovable app will automatically use this service instead of Firecrawl
//   whenever SCRAPER_SERVICE_URL is set.

import express from "express";
import { chromium } from "playwright";
import { scrapeGoogleMaps } from "./sources/gmaps.js";
import { scrapeJustDial } from "./sources/justdial.js";
import { scrapeIndiaMart } from "./sources/indiamart.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const TOKEN = process.env.SCRAPER_SERVICE_TOKEN || "";

// Single shared browser instance — cheaper & faster than one per request.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserPromise;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/scrape", async (req, res) => {
  if (TOKEN) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${TOKEN}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { source, query, city, limit } = req.body || {};
  if (!source || !query) {
    return res.status(400).json({ error: "source and query are required" });
  }
  const max = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 50);

  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 850 },
      locale: "en-IN",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);

    let result;
    if (source === "gmaps") {
      result = await scrapeGoogleMaps(page, { query, city, limit: max });
    } else if (source === "justdial") {
      result = await scrapeJustDial(page, { query, city, limit: max });
    } else if (source === "indiamart") {
      result = await scrapeIndiaMart(page, { query, city, limit: max });
    } else {
      return res.status(400).json({ error: `Unknown source: ${source}` });
    }

    return res.json(result);
  } catch (err) {
    console.error("[scrape] error", err);
    return res.status(500).json({
      leads: [],
      sourceUrl: "",
      error: err && err.message ? err.message : "Scrape failed",
    });
  } finally {
    if (context) await context.close().catch(() => {});
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Scraper service listening on :${port}`));
