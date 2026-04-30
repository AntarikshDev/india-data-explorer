// Public webhook called by pg_cron once per day. Walks every active campaign
// for every user and runs one target each (the per-campaign daily cap inside
// runCampaignOnce will prevent over-running in case cron fires multiple times).
//
// Auth: shared secret in `x-cron-secret` header. Set CRON_SECRET in env.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/run-daily-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        const expected = process.env.CRON_SECRET;
        if (!expected || secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Pull every active campaign across all users
        const { data: campaigns, error } = await supabaseAdmin
          .from("campaigns")
          .select("id, user_id, name, daily_target_cap")
          .eq("status", "active")
          .eq("schedule_enabled", true);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        let triggered = 0;
        const results: Array<{ id: string; name: string; runs: number; error?: string }> = [];

        for (const c of campaigns ?? []) {
          // For each campaign, fire up to daily_target_cap runs
          const cap = Math.min(c.daily_target_cap ?? 5, 10); // hard cap of 10 per cron tick
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
            // Call our own server fn endpoint internally. We can't easily auth as a
            // user from inside cron, so we replicate the planner logic with admin
            // privileges by directly invoking the route URL with a service header.
            // Simpler: just record a queued target row and let a follow-up worker
            // process it. For v1, do an HTTP self-call to /api/public/hooks/run-target
            const res = await runOneCampaignTarget(c.id, c.user_id);
            if (!res.ok) {
              results.push({ id: c.id, name: c.name, runs: ranThisInvocation, error: res.error });
              break;
            }
            ranThisInvocation++;
            triggered++;
            // Don't hammer — small gap between targets
            await new Promise((r) => setTimeout(r, 500));
            // If state coverage hit, stop early
            if (res.stateCovered) break;
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

// Runs ONE target for the given campaign as the campaign's owning user.
// This duplicates the planner used by runCampaignOnce but uses supabaseAdmin
// so it works without a logged-in session (cron context).
async function runOneCampaignTarget(
  campaignId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string; stateCovered?: boolean }> {
  const { data: c } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!c) return { ok: false, error: "Campaign not found" };

  const stateCode = c.current_state_code ?? c.start_state_code;

  // Coverage check
  const [{ data: districts }, { data: prevTargets }] = await Promise.all([
    supabaseAdmin.from("geo_districts").select("id, name, hq_lat, hq_lng").eq("state_code", stateCode),
    supabaseAdmin
      .from("campaign_targets")
      .select("district_id, leads_inserted")
      .eq("campaign_id", campaignId),
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
    return { ok: false, error: "STATE_COVERED", stateCovered: true };
  }

  // Pick next district by run count + un-touched-first
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
  // Prefer un-touched
  candidates.sort((a, b) => {
    const aTouched = counts.has(a.id) ? 1 : 0;
    const bTouched = counts.has(b.id) ? 1 : 0;
    return aTouched - bTouched;
  });
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

  // Create scrape run
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

  // Trigger the actual scrape via internal HTTP (server fn). We hit our own
  // /api/public/hooks/execute-cron-run endpoint to keep credentials server-side.
  const baseUrl =
    process.env.PUBLIC_BASE_URL ??
    "https://project--9c789170-636a-4368-b1ab-15e511bfead6.lovable.app";
  // Fire-and-forget: don't await — cron should return fast
  fetch(`${baseUrl}/api/public/hooks/execute-cron-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": process.env.CRON_SECRET ?? "",
    },
    body: JSON.stringify({ runId: run.id, userId, targetId: target.id, campaignId: c.id, districtId: next.id }),
  }).catch(() => {});

  return { ok: true };
}
