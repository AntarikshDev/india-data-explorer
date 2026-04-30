import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scrapeSource, dedupeHash, scoreLead } from "./firecrawl.server";
import type { Source } from "@/lib/leadTypes";

const SourceEnum = z.enum(["gmaps", "justdial", "indiamart"]);

const StartSchema = z.object({
  query: z.string().min(2).max(200),
  city: z.string().max(100).optional().nullable(),
  sources: z.array(SourceEnum).min(1).max(3),
  resultsPerSource: z.number().int().min(5).max(50).default(25),
});

export const startScrapeRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run, error } = await supabase
      .from("scrape_runs")
      .insert({
        user_id: userId,
        query: data.query,
        city: data.city ?? null,
        sources: data.sources,
        results_per_source: data.resultsPerSource,
        status: "running",
      })
      .select("*")
      .single();

    if (error || !run) {
      throw new Error(error?.message ?? "Failed to create run");
    }

    // Derive a query category hint for scoring (first noun-ish token)
    const queryCategory = data.query.split(/\s+in\s+|\s+at\s+|,/i)[0]?.trim();

    const tasks = (data.sources as Source[]).map(async (source) => {
      const { leads, sourceUrl, error: scrapeErr } = await scrapeSource({
        source,
        query: data.query,
        city: data.city ?? null,
        limit: data.resultsPerSource,
      });

      if (scrapeErr && leads.length === 0) {
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
            run_id: run.id,
            name: raw.name ?? null,
            phone: raw.phone ?? null,
            email: raw.email ?? null,
            address: raw.address ?? null,
            city: raw.city ?? data.city ?? null,
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
        if (!insErr) inserted++;
      }
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
      })
      .eq("id", run.id);

    return { runId: run.id, total, errors };
  });
