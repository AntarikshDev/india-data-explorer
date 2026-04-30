import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { scrapeSource, dedupeHash, scoreLead } from "./firecrawl.server";
import { isCustomScraperEnabled, scrapeViaService } from "./scraperService.server";
import { normalizeIndianMobile } from "./phone.server";
import { StartSchema, ExecuteSchema } from "./scrape.schemas";
import type { Source, RunProgress, SourceProgress } from "@/lib/leadTypes";

// 1) Create the run row immediately and return its id so the UI can navigate
//    to /results/$runId and start streaming progress in real-time.
export const createScrapeRun = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => StartSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const initialProgress: RunProgress = {};
    for (const s of data.sources as Source[]) {
      initialProgress[s] = { status: "pending", inserted: 0 };
    }

    const { data: run, error } = await supabase
      .from("scrape_runs")
      .insert({
        user_id: userId,
        query: data.query,
        city: data.city ?? null,
        sources: data.sources,
        results_per_source: data.resultsPerSource,
        status: "queued",
        progress: initialProgress as unknown as never,
      })
      .select("id")
      .single();

    if (error || !run) {
      return { runId: null as string | null, error: error?.message ?? "Failed to create run" };
    }
    return { runId: run.id, error: null as string | null };
  });

// 2) Execute the scrape. The client fires this and does NOT await it — the UI
//    watches `scrape_runs.progress` and `leads` via realtime to render live updates.
export const executeScrapeRun = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => ExecuteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run, error: runErr } = await supabase
      .from("scrape_runs")
      .select("*")
      .eq("id", data.runId)
      .eq("user_id", userId)
      .single();

    if (runErr || !run) {
      return { ok: false, error: runErr?.message ?? "Run not found" };
    }
    const runRow = run;

    const sources = runRow.sources as Source[];
    const progress: RunProgress = (runRow.progress as RunProgress) ?? {};

    // Mark run as running
    await supabase
      .from("scrape_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", runRow.id);

    const queryCategory = runRow.query.split(/\s+in\s+|\s+at\s+|,/i)[0]?.trim();

    // Helper: persist progress for a single source
    async function setSourceProgress(source: Source, patch: Partial<SourceProgress>) {
      progress[source] = { ...(progress[source] ?? { status: "pending", inserted: 0 }), ...patch };
      await supabase
        .from("scrape_runs")
        .update({ progress: progress as unknown as never })
        .eq("id", runRow.id);
    }

    const tasks = sources.map(async (source) => {
      await setSourceProgress(source, { status: "running", started_at: new Date().toISOString() });

      const useCustom = isCustomScraperEnabled();
      const { leads, sourceUrl, error: scrapeErr } = useCustom
        ? await scrapeViaService({
            source,
            query: runRow.query,
            city: runRow.city ?? null,
            limit: runRow.results_per_source,
          })
        : await scrapeSource({
            source,
            query: runRow.query,
            city: runRow.city ?? null,
            limit: runRow.results_per_source,
          });

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
        const hash = dedupeHash(source, raw.name, raw.phone);
        const website = raw.business_website ?? null;
        const listing = raw.listing_url ?? null;
        const { score, reasons } = scoreLead(
          {
            phone: raw.phone,
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
            phone: raw.phone ?? null,
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
          // Stream progress every few inserts so the UI counter ticks live
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
  });
