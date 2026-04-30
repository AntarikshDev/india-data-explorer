import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { haversineKm } from "./geo.server";
import { createScrapeRun, executeScrapeRun } from "./scrape.functions";
import type { Source } from "@/lib/leadTypes";

const SourceEnum = z.enum(["gmaps", "justdial"]);

const CreateCampaignSchema = z.object({
  name: z.string().min(2).max(120),
  queryTemplate: z.string().min(2).max(200),
  sources: z.array(SourceEnum).min(1).max(2),
  resultsPerSource: z.number().int().min(5).max(50).default(25),
  startStateCode: z.string().min(2).max(3),
  startDistrictId: z.string().uuid().optional().nullable(),
  stateCoverageThreshold: z.number().int().min(50).max(100).default(80),
  perDistrictCap: z.number().int().min(1).max(20).default(5),
  exhaustionStreak: z.number().int().min(1).max(10).default(3),
  dailyTargetCap: z.number().int().min(1).max(20).default(5),
  scheduleEnabled: z.boolean().default(false),
});

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateCampaignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        name: data.name,
        query_template: data.queryTemplate,
        sources: data.sources,
        results_per_source: data.resultsPerSource,
        start_state_code: data.startStateCode,
        current_state_code: data.startStateCode,
        current_district_id: data.startDistrictId ?? null,
        state_coverage_threshold: data.stateCoverageThreshold,
        per_district_cap: data.perDistrictCap,
        exhaustion_streak: data.exhaustionStreak,
        daily_target_cap: data.dailyTargetCap,
        schedule_enabled: data.scheduleEnabled,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !row) return { id: null as string | null, error: error?.message ?? "Failed" };
    return { id: row.id, error: null as string | null };
  });

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return { campaigns: [], error: error.message };
    return { campaigns: data ?? [], error: null as string | null };
  });

export const getCampaign = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [campRes, targetsRes] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", data.id).eq("user_id", userId).single(),
      supabase
        .from("campaign_targets")
        .select("*")
        .eq("campaign_id", data.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    if (campRes.error) return { campaign: null, targets: [], error: campRes.error.message };
    return {
      campaign: campRes.data,
      targets: targetsRes.data ?? [],
      error: null as string | null,
    };
  });

export const updateCampaignStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "active", "paused", "awaiting_next_state", "completed"]),
        currentStateCode: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      status: typeof data.status;
      current_state_code?: string;
      current_district_id?: string | null;
    } = { status: data.status };
    if (data.currentStateCode) {
      patch.current_state_code = data.currentStateCode;
      patch.current_district_id = null;
    }
    const { error } = await supabase
      .from("campaigns")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null as string | null };
  });

// =============================================================
// Planner — pick the next district within a state by Haversine
// distance from the current cursor; skip districts already at cap
// or in exhaustion streak.
// =============================================================
async function pickNextDistrict(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  campaignId: string;
  stateCode: string;
  currentDistrictId: string | null;
  perDistrictCap: number;
  exhaustionStreak: number;
}) {
  const { supabase, userId, campaignId, stateCode, currentDistrictId, perDistrictCap } = opts;

  const { data: districts } = await supabase
    .from("geo_districts")
    .select("id, name, hq_lat, hq_lng")
    .eq("state_code", stateCode);
  if (!districts || districts.length === 0) return null;

  // Districts already exhausted in this campaign
  const { data: prevTargets } = await supabase
    .from("campaign_targets")
    .select("district_id, status, leads_inserted")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);
  const counts = new Map<string, { runs: number; lowYieldStreak: number; lastLowYield: boolean }>();
  for (const t of prevTargets ?? []) {
    if (!t.district_id) continue;
    const c = counts.get(t.district_id) ?? { runs: 0, lowYieldStreak: 0, lastLowYield: false };
    c.runs += 1;
    const lowYield = (t.leads_inserted ?? 0) < 5;
    c.lowYieldStreak = lowYield ? c.lowYieldStreak + 1 : 0;
    c.lastLowYield = lowYield;
    counts.set(t.district_id, c);
  }
  const exhausted = new Set<string>();
  for (const [id, c] of counts) {
    if (c.runs >= perDistrictCap) exhausted.add(id);
    if (c.lowYieldStreak >= opts.exhaustionStreak) exhausted.add(id);
  }

  const candidates = districts.filter((d: any) => !exhausted.has(d.id));
  if (candidates.length === 0) return null;

  // Anchor for distance ranking: current district HQ, else first candidate
  let anchor = candidates[0];
  if (currentDistrictId) {
    const cur = districts.find((d: any) => d.id === currentDistrictId);
    if (cur) anchor = cur;
  }

  candidates.sort((a: any, b: any) => {
    const da = haversineKm(+anchor.hq_lat, +anchor.hq_lng, +a.hq_lat, +a.hq_lng);
    const db = haversineKm(+anchor.hq_lat, +anchor.hq_lng, +b.hq_lat, +b.hq_lng);
    // Prefer un-touched districts first, then nearest
    const aTouched = counts.has(a.id) ? 1 : 0;
    const bTouched = counts.has(b.id) ? 1 : 0;
    if (aTouched !== bTouched) return aTouched - bTouched;
    return da - db;
  });
  return candidates[0];
}

// Coverage = % of districts in state with at least one campaign run
async function computeStateCoverage(
  supabase: any,
  userId: string,
  campaignId: string,
  stateCode: string,
) {
  const [{ data: districts }, { data: targets }] = await Promise.all([
    supabase.from("geo_districts").select("id").eq("state_code", stateCode),
    supabase
      .from("campaign_targets")
      .select("district_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .eq("state_code", stateCode),
  ]);
  const total = (districts ?? []).length;
  if (total === 0) return { covered: 0, total: 0, pct: 0 };
  const touched = new Set((targets ?? []).map((t: any) => t.district_id).filter(Boolean));
  return { covered: touched.size, total, pct: Math.round((touched.size / total) * 100) };
}

// Run the campaign once: pick next district, kick off a scrape, record target.
// Returns details for the UI.
export const runCampaignOnce = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: c, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .eq("user_id", userId)
      .single();
    if (cErr || !c) return { ok: false, error: cErr?.message ?? "Not found" };

    if (c.status !== "active") {
      return { ok: false, error: `Campaign is ${c.status}` };
    }

    // Daily cap check
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: ranToday } = await supabase
      .from("campaign_targets")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .gte("ran_at", todayStart.toISOString());
    if ((ranToday ?? 0) >= c.daily_target_cap) {
      return { ok: false, error: `Daily cap of ${c.daily_target_cap} reached` };
    }

    // Coverage check before picking
    const cov = await computeStateCoverage(supabase, userId, c.id, c.current_state_code ?? c.start_state_code);
    if (cov.pct >= c.state_coverage_threshold) {
      await supabase
        .from("campaigns")
        .update({ status: "awaiting_next_state" })
        .eq("id", c.id);
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "state_expand",
        title: `${c.current_state_code ?? c.start_state_code} is ${cov.pct}% covered`,
        body: `Campaign "${c.name}" hit your ${c.state_coverage_threshold}% coverage threshold (${cov.covered}/${cov.total} districts). Pick the next state to continue.`,
        payload: { campaignId: c.id, coverage: cov },
      });
      return { ok: false, error: "STATE_COVERED", coverage: cov };
    }

    const next = await pickNextDistrict({
      supabase,
      userId,
      campaignId: c.id,
      stateCode: c.current_state_code ?? c.start_state_code,
      currentDistrictId: c.current_district_id,
      perDistrictCap: c.per_district_cap,
      exhaustionStreak: c.exhaustion_streak,
    });
    if (!next) {
      await supabase
        .from("campaigns")
        .update({ status: "awaiting_next_state" })
        .eq("id", c.id);
      return { ok: false, error: "All districts exhausted in current state" };
    }

    // Insert the target row first
    const { data: target, error: tErr } = await supabase
      .from("campaign_targets")
      .insert({
        user_id: userId,
        campaign_id: c.id,
        state_code: c.current_state_code ?? c.start_state_code,
        district_id: next.id,
        district_name: next.name,
        status: "running",
        ran_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (tErr || !target) return { ok: false, error: tErr?.message ?? "Target insert failed" };

    // Kick off a scrape using the campaign's query + district name as city
    const runRes = await createScrapeRun({
      data: {
        query: c.query_template,
        city: next.name,
        sources: c.sources as Source[],
        resultsPerSource: c.results_per_source,
      },
    });
    if (!runRes.runId) {
      await supabase
        .from("campaign_targets")
        .update({ status: "failed" })
        .eq("id", target.id);
      return { ok: false, error: runRes.error ?? "Scrape start failed" };
    }

    const runId: string = runRes.runId;
    await supabase
      .from("campaign_targets")
      .update({ scrape_run_id: runId })
      .eq("id", target.id);

    // Fire-and-forget the scrape (UI polls)
    executeScrapeRun({ data: { runId } })
      .then(async (res) => {
        // After scrape completes, count inserted leads and finalize
        const { count } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("run_id", runId)
          .eq("user_id", userId);
        await supabase
          .from("campaign_targets")
          .update({
            status: res.ok ? "done" : "failed",
            leads_inserted: count ?? 0,
          })
          .eq("id", target.id);
        await supabase
          .from("campaigns")
          .update({
            current_district_id: next.id,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", c.id);
      })
      .catch(async () => {
        await supabase
          .from("campaign_targets")
          .update({ status: "failed" })
          .eq("id", target.id);
      });

    return {
      ok: true,
      runId: runRes.runId,
      district: next.name,
      coverage: cov,
    };
  });
