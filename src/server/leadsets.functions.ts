import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

const SetInput = z.object({
  name: z.string().trim().min(1).max(80),
  stateCode: z.string().max(8).optional().nullable(),
  districtId: z.string().uuid().optional().nullable(),
  districtName: z.string().max(120).optional().nullable(),
  localityId: z.string().uuid().optional().nullable(),
  localityName: z.string().max(120).optional().nullable(),
  categoryQuery: z.string().max(120).optional().nullable(),
  nameQuery: z.string().max(120).optional().nullable(),
  minScore: z.number().int().min(0).max(100).default(0),
});

export const listLeadSets = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("lead_sets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return { sets: [], error: error.message };

    // attach a quick "ready to call" count per set
    const { data: handled } = await supabase
      .from("call_attempts")
      .select("lead_id")
      .eq("user_id", userId)
      .neq("outcome", "skip");
    const handledSet = new Set((handled ?? []).map((r) => r.lead_id));

    const enriched = await Promise.all(
      (data ?? []).map(async (s) => {
        let q = supabase
          .from("leads")
          .select("id", { count: "exact", head: false })
          .eq("user_id", userId)
          .not("phone", "is", null)
          .gte("score", s.min_score ?? 0);
        if (s.state_code) q = q.eq("state_code", s.state_code);
        if (s.district_id) q = q.eq("district_id", s.district_id);
        if (s.locality_id) q = q.eq("locality_id", s.locality_id);
        const { data: ids } = await q.limit(1000);
        const ready = (ids ?? []).filter((r) => !handledSet.has(r.id)).length;
        return { ...s, ready_count: ready };
      }),
    );
    return { sets: enriched, error: null as string | null };
  });

export const createLeadSet = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => SetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("lead_sets")
      .insert({
        user_id: userId,
        name: data.name,
        state_code: data.stateCode ?? null,
        district_id: data.districtId ?? null,
        district_name: data.districtName ?? null,
        locality_id: data.localityId ?? null,
        locality_name: data.localityName ?? null,
        category_query: data.categoryQuery ?? null,
        name_query: data.nameQuery ?? null,
        min_score: data.minScore,
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, set: row, error: null as string | null };
  });

export const deleteLeadSet = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("lead_sets")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null as string | null };
  });
