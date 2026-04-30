import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { performScrapeRun } from "@/server/scrape-core.server";

export const Route = createFileRoute("/api/public/hooks/run-scrape")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { runId?: string; userId?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const { runId, userId } = body ?? {};
        if (!runId || !userId) {
          return new Response("Missing runId or userId", { status: 400 });
        }

        const { data: run, error } = await supabaseAdmin
          .from("scrape_runs")
          .select("id, user_id, status")
          .eq("id", runId)
          .maybeSingle();
        if (error || !run) {
          return new Response("Run not found", { status: 404 });
        }
        if (run.user_id !== userId) {
          return new Response("Forbidden", { status: 403 });
        }
        if (run.status === "running" || run.status === "done") {
          return Response.json({ ok: true, skipped: true, status: run.status });
        }

        try {
          const result = await performScrapeRun({
            supabase: supabaseAdmin,
            userId,
            runId,
          });
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Scrape failed";
          await supabaseAdmin
            .from("scrape_runs")
            .update({
              status: "failed",
              error: message,
              finished_at: new Date().toISOString(),
            })
            .eq("id", runId);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
