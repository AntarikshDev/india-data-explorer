// Public webhook called by pg_cron once per day.
// For each active+scheduled campaign, picks the next district and runs ONE
// scrape — repeats up to the campaign's daily cap.
//
// Auth: shared secret in `x-cron-secret` header. Set CRON_SECRET in env.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { performScrapeRun } from "@/server/scrape-core.server";

export const Route = createFileRoute("/api/public/hooks/run-daily-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        const expected = process.env.CRON_SECRET;
        if (!expected || secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: campaigns, error } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .eq("status", "active")
          .eq("schedule_enabled", true);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let triggered = 0;
        const results: Array<{ id: string; name: string; runs: number; error?: string }> = [];

        for (const c of campaigns ?? []) {
          const cap = Math.min(c.daily_target_cap ?? 5, 10);
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const { count: alreadyRanToday } = await supabaseAdmin
            .from("campaign_targets")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", c.id)
            .gte("ran_at", todayStart.toISOString());
          const remaining = Math.max(0, cap - (alreadyRanToday ?? 0));
          let ranThisInvocation = 0;

          for (let i = 0; i < remaining; i++) {
            const r = await runOneCampaignTarget(c);
            if (!r.ok) {
              results.push({ id: c.id, name: c.name, runs: ranThisInvocation, error: r.error });
              break;
            }
            ranThisInvocation++;
            triggered++;
          }
          if (ranThisInvocation > 0) {
            results.push({ id: c.id, name: c.name, runs: ranThisInvocation });
          }
        }

        return Response.json({
          ok: true,
          campaigns: (campaigns ?? []).length,
          triggered,
          results,
        });
      },
    },
  },
});

async function runOneCampaignTarget(c: any): Promise<{ ok: boolean; error?: string }> {
  const userId = c.user_id;
  const stateCode = c.current_state_code ?? c.start_state_code;

  const [{ data: districts }, { data: prevTargets }] = await Promise.all([
    supabaseAdmin
      .from("geo_districts")
      .select("id, name, hq_lat, hq_lng")
      .eq("state_code", stateCode),
    supabaseAdmin
      .from("campaign_targets")
      .select("district_id, leads_inserted")
      .eq("campaign_id", c.id),
  ]);

  const total = (districts ?? []).length;
  const touched = new Set((prevTargets ?? []).map((t) => t.district_id).filter(Boolean));
  const pct = total ? Math.round((touched.size / total) * 100) : 0;

  if (pct >= c.state_coverage_threshold) {
    await supabaseAdmin.from("campaigns").update({ status: "awaiting_next_state" }).eq("id", c.id);
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      kind: "state_expand",
      title: `${stateCode} is ${pct}% covered`,
      body: `Campaign "${c.name}" hit your ${c.state_coverage_threshold}% coverage threshold. Pick the next state.`,
      payload: { campaignId: c.id, coverage: { covered: touched.size, total, pct } },
    });
    return { ok: false, error: "STATE_COVERED" };
  }

  // Pick next: un-touched districts first, ignore exhausted
  const counts = new Map<string, { runs: number; lowYieldStreak: number }>();
  for (const t of prevTargets ?? []) {
    if (!t.district_id) continue;
    const cur = counts.get(t.district_id) ?? { runs: 0, lowYieldStreak: 0 };
    cur.runs += 1;
    cur.lowYieldStreak = (t.leads_inserted ?? 0) < 5 ? cur.lowYieldStreak + 1 : 0;
    counts.set(t.district_id, cur);
  }
  const exhausted = new Set<string>();
  for (const [dId, info] of counts) {
    if (info.runs >= c.per_district_cap) exhausted.add(dId);
    if (info.lowYieldStreak >= c.exhaustion_streak) exhausted.add(dId);
  }
  const candidates = (districts ?? []).filter((d) => !exhausted.has(d.id));
  if (candidates.length === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "awaiting_next_state" }).eq("id", c.id);
    return { ok: false, error: "All districts exhausted" };
  }
  candidates.sort((a, b) => (counts.has(a.id) ? 1 : 0) - (counts.has(b.id) ? 1 : 0));
  const next = candidates[0];

  // Insert target row
  const { data: target } = await supabaseAdmin
    .from("campaign_targets")
    .insert({
      user_id: userId,
      campaign_id: c.id,
      state_code: stateCode,
      district_id: next.id,
      district_name: next.name,
      status: "running",
      ran_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (!target) return { ok: false, error: "Target insert failed" };

  // Create scrape_runs row
  const initialProgress: Record<string, { status: string; inserted: number }> = {};
  for (const s of c.sources as string[]) {
    initialProgress[s] = { status: "pending", inserted: 0 };
  }
  const { data: run } = await supabaseAdmin
    .from("scrape_runs")
    .insert({
      user_id: userId,
      query: c.query_template,
      city: next.name,
      sources: c.sources,
      results_per_source: c.results_per_source,
      status: "queued",
      progress: initialProgress as never,
    })
    .select("id")
    .single();
  if (!run) {
    await supabaseAdmin.from("campaign_targets").update({ status: "failed" }).eq("id", target.id);
    return { ok: false, error: "Run insert failed" };
  }
  await supabaseAdmin
    .from("campaign_targets")
    .update({ scrape_run_id: run.id })
    .eq("id", target.id);

  // Run the scrape synchronously (cron handler can be slow). Cron infra
  // typically allows 60-120s; one scrape takes ~30-60s.
  const result = await performScrapeRun({
    supabase: supabaseAdmin,
    userId,
    runId: run.id,
  });

  // Count actual leads inserted for this target
  const { count } = await supabaseAdmin
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("user_id", userId);
  await supabaseAdmin
    .from("campaign_targets")
    .update({
      status: result.ok ? "done" : "failed",
      leads_inserted: count ?? 0,
    })
    .eq("id", target.id);
  await supabaseAdmin
    .from("campaigns")
    .update({
      current_district_id: next.id,
      last_run_at: new Date().toISOString(),
    })
    .eq("id", c.id);

  return { ok: true };
}
