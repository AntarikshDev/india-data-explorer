// Self-hosted scraper service.
// POST /scrape  body: { source, query, city, limit }
// Auth: optional `Authorization: Bearer <SCRAPER_SERVICE_TOKEN>` header.

import express from "express";
import { newHumanContext, getBrowser } from "./browser.js";
import { scrapeGoogleMaps } from "./sources/gmaps.js";
import { scrapeJustDial } from "./sources/justdial.js";
import { scrapeIndiaMart } from "./sources/indiamart.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const TOKEN = process.env.SCRAPER_SERVICE_TOKEN || "";

app.get("/health", async (_req, res) => {
  try {
    await getBrowser();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err && err.message });
  }
});

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
    context = await newHumanContext();
    const page = await context.newPage();
    page.setDefaultTimeout(60000);

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
