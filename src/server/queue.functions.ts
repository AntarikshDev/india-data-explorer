import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

export const OutcomeEnum = z.enum([
  "connected",
  "voicemail",
  "not_interested",
  "follow_up",
  "wrong_number",
  "skip",
]);
export type CallOutcome = z.infer<typeof OutcomeEnum>;

const FilterSchema = z.object({
  stateCode: z.string().optional().nullable(),
  districtId: z.string().uuid().optional().nullable(),
  localityId: z.string().uuid().optional().nullable(),
  setId: z.string().uuid().optional().nullable(),
  minScore: z.number().int().min(0).max(100).optional().nullable(),
  limit: z.number().int().min(1).max(200).default(50),
});

// Fetch un-contacted leads, sorted oldest-scraped first (FIFO) but high-score-first as tiebreak.
// Filters: state / district / locality OR an explicit lead_set id.
export const getQueue = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => FilterSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let stateCode = data.stateCode ?? null;
    let districtId = data.districtId ?? null;
    let localityId = data.localityId ?? null;
    let minScore = data.minScore ?? 0;

    if (data.setId) {
      const { data: s } = await supabase
        .from("lead_sets")
        .select("*")
        .eq("id", data.setId)
        .eq("user_id", userId)
        .maybeSingle();
      if (s) {
        stateCode = s.state_code ?? stateCode;
        districtId = s.district_id ?? districtId;
        localityId = s.locality_id ?? localityId;
        minScore = s.min_score ?? minScore;
      }
    }

    // Already-handled lead ids
    const { data: handled } = await supabase
      .from("call_attempts")
      .select("lead_id")
      .eq("user_id", userId)
      .neq("outcome", "skip");
    const handledSet = new Set((handled ?? []).map((r) => r.lead_id));

    let q = supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .not("phone", "is", null)
      .gte("score", minScore);

    if (stateCode) q = q.eq("state_code", stateCode);
    if (districtId) q = q.eq("district_id", districtId);
    if (localityId) q = q.eq("locality_id", localityId);

    // Oldest scraped first → first scraped, first called. Score as secondary.
    const { data: leads, error } = await q
      .order("scraped_at", { ascending: true })
      .order("score", { ascending: false })
      .limit(data.limit + handledSet.size);

    if (error) return { leads: [], error: error.message };
    const filtered = (leads ?? []).filter((l) => !handledSet.has(l.id)).slice(0, data.limit);
    return { leads: filtered, error: null as string | null };
  });

export const logCallAttempt = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        outcome: OutcomeEnum,
        notes: z.string().max(2000).optional().nullable(),
        nextActionAt: z.string().datetime().optional().nullable(),
        durationSec: z.number().int().min(0).max(36000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const noteText = data.notes ?? null;
    const finalNotes =
      typeof data.durationSec === "number" && data.durationSec > 0
        ? `[${Math.floor(data.durationSec / 60)}m ${data.durationSec % 60}s] ${noteText ?? ""}`.trim()
        : noteText;
    const { error } = await supabase.from("call_attempts").insert({
      user_id: userId,
      lead_id: data.leadId,
      outcome: data.outcome,
      notes: finalNotes,
      next_action_at: data.nextActionAt ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null as string | null };
  });

export const getTodayCallLog = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: rows, error } = await supabase
      .from("call_attempts")
      .select("*, leads:lead_id(name, phone, city, district_name, state_code)")
      .eq("user_id", userId)
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) return { rows: [], error: error.message };
    return { rows: rows ?? [], error: null as string | null };
  });

export const updateCallNotes = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        attemptId: z.string().uuid(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("call_attempts")
      .update({ notes: data.notes ?? null })
      .eq("id", data.attemptId)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null as string | null };
  });

export const getCallHistory = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("call_attempts")
      .select("*")
      .eq("user_id", userId)
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) return { attempts: [], error: error.message };
    return { attempts: rows ?? [], error: null as string | null };
  });
