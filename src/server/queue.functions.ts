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

// Fetch the next batch of un-contacted leads with valid phone, sorted by score DESC.
// "Un-contacted" = no row in call_attempts for this user/lead OR only outcome='skip'
// (skips come back to the bottom — see ORDER BY below).
export const getQueue = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).default(25) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Get the lead_ids the user has already given a definitive outcome on
    // (anything besides 'skip'). Skipped leads stay in queue at lower priority.
    const { data: handled } = await supabase
      .from("call_attempts")
      .select("lead_id, outcome")
      .eq("user_id", userId)
      .neq("outcome", "skip");
    const handledSet = new Set((handled ?? []).map((r) => r.lead_id));

    const { data: leads, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .not("phone", "is", null)
      .order("score", { ascending: false })
      .order("scraped_at", { ascending: false })
      .limit(data.limit + handledSet.size); // overfetch so post-filter still gives `limit`

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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("call_attempts").insert({
      user_id: userId,
      lead_id: data.leadId,
      outcome: data.outcome,
      notes: data.notes ?? null,
      next_action_at: data.nextActionAt ?? null,
    });
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
