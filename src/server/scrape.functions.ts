import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { performScrapeRun } from "./scrape-core.server";
import { StartSchema, ExecuteSchema } from "./scrape.schemas";
import type { Source, RunProgress } from "@/lib/leadTypes";

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
    const result = await performScrapeRun({ supabase, userId, runId: data.runId });
    return result;
  });
