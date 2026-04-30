// Core scrape executor — supabase-client agnostic so it can be called from:
//  1) executeScrapeRun (user-scoped client w/ RLS)
//  2) the daily cron route (admin client, server-side)
//
// All business logic (dedup, scoring, phone validation, progress streaming,
// fallback to Firecrawl) lives here.

import { scrapeSource, dedupeHash, scoreLead } from "./firecrawl.server";
import { isCustomScraperEnabled, scrapeViaService } from "./scraperService.server";
import { normalizeIndianMobile } from "./phone.server";
import type { Source, RunProgress, SourceProgress } from "@/lib/leadTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export async function performScrapeRun(opts: {
  supabase: AnySupabase;
  userId: string;
  runId: string;
}): Promise<{ ok: boolean; total: number; errors: string[] }> {
  const { supabase, userId, runId } = opts;

  const { data: run, error: runErr } = await supabase
    .from("scrape_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .single();

  if (runErr || !run) {
    return { ok: false, total: 0, errors: [runErr?.message ?? "Run not found"] };
  }
  const runRow = run;

  const sources = runRow.sources as Source[];
  const progress: RunProgress = (runRow.progress as RunProgress) ?? {};

  await supabase
    .from("scrape_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runRow.id);

  const queryCategory = runRow.query.split(/\s+in\s+|\s+at\s+|,/i)[0]?.trim();

  const seenHashes = new Set<string>();
  {
    const { data: existing } = await supabase
      .from("leads")
      .select("dedupe_hash")
      .eq("user_id", userId);
    for (const row of existing ?? []) {
      if (row.dedupe_hash) seenHashes.add(row.dedupe_hash);
    }
  }

  async function setSourceProgress(source: Source, patch: Partial<SourceProgress>) {
    progress[source] = { ...(progress[source] ?? { status: "pending", inserted: 0 }), ...patch };
    await supabase
      .from("scrape_runs")
      .update({ progress: progress as unknown as never })
      .eq("id", runRow.id);
  }

  const tasks = sources.map(async (source) => {
    await setSourceProgress(source, { status: "running", started_at: new Date().toISOString() });

    const scrapeInput = {
      source,
      query: runRow.query,
      city: runRow.city ?? null,
      limit: runRow.results_per_source,
    };
    let { leads, sourceUrl, error: scrapeErr } = isCustomScraperEnabled()
      ? await scrapeViaService(scrapeInput)
      : await scrapeSource(scrapeInput);

    const shouldFallback =
      leads.length === 0 && Boolean(scrapeErr) && Boolean(process.env.FIRECRAWL_API_KEY);
    if (shouldFallback) {
      const fallback = await scrapeSource(scrapeInput);
      leads = fallback.leads;
      sourceUrl = fallback.sourceUrl || sourceUrl;
      scrapeErr = fallback.error ?? (fallback.leads.length ? undefined : scrapeErr);
    }

    if (scrapeErr && leads.length === 0) {
      await setSourceProgress(source, {
        status: "failed",
        error: scrapeErr,
        finished_at: new Date().toISOString(),
      });
      return { source, inserted: 0, error: scrapeErr };
    }

    let inserted = 0;
    for (const raw of leads) {
      const validPhone = normalizeIndianMobile(raw.phone);
      if (!validPhone) continue;
      const hash = dedupeHash(source, raw.name, validPhone);
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      const website = raw.business_website ?? null;
      const listing = raw.listing_url ?? null;
      const { score, reasons } = scoreLead(
        {
          phone: validPhone,
          email: raw.email,
          rating: raw.rating,
          reviews_count: raw.reviews_count,
          website,
          category: raw.category,
        },
        queryCategory,
      );
      const { error: insErr } = await supabase.from("leads").insert([
        {
          user_id: userId,
          run_id: runRow.id,
          name: raw.name ?? null,
          phone: validPhone,
          email: raw.email ?? null,
          address: raw.address ?? null,
          city: raw.city ?? runRow.city ?? null,
          category: raw.category ?? null,
          rating: raw.rating ?? null,
          reviews_count: raw.reviews_count ?? null,
          website,
          listing_url: listing,
          source,
          source_url: sourceUrl,
          raw_json: raw as unknown as never,
          dedupe_hash: hash,
          score,
          score_reasons: reasons as unknown as never,
        },
      ]);
      if (!insErr) {
        inserted++;
        if (inserted % 3 === 0) {
          await setSourceProgress(source, { status: "running", inserted });
        }
      }
    }

    await setSourceProgress(source, {
      status: "done",
      inserted,
      error: scrapeErr ?? null,
      finished_at: new Date().toISOString(),
    });
    return { source, inserted, error: scrapeErr ?? null };
  });

  const results = await Promise.all(tasks);
  const total = results.reduce((s, r) => s + r.inserted, 0);
  const errors = results.filter((r) => r.error).map((r) => `${r.source}: ${r.error}`);
  const allFailed = results.every((r) => r.inserted === 0);

  await supabase
    .from("scrape_runs")
    .update({
      status: allFailed && errors.length ? "failed" : "done",
      total_count: total,
      error: errors.length ? errors.join(" | ") : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runRow.id);

  return { ok: true, total, errors };
}
