// Data Centre: filtered listing + edit + CSV import
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { normalizeIndianMobile } from "./phone.server";

const EDITABLE_FIELDS = [
  "name",
  "phone",
  "whatsapp",
  "email",
  "owner_name",
  "category",
  "website",
  "address",
  "city",
  "state_code",
  "district_id",
  "district_name",
  "locality_id",
  "locality_name",
  "notes",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export const listLeads = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        q: z.string().max(120).optional().nullable(),
        stateCode: z.string().optional().nullable(),
        districtId: z.string().uuid().optional().nullable(),
        localityId: z.string().uuid().optional().nullable(),
        source: z.enum(["gmaps", "justdial"]).optional().nullable(),
        minScore: z.number().int().min(0).max(100).optional().nullable(),
        campaignId: z.string().uuid().optional().nullable(),
        leadSetId: z.string().uuid().optional().nullable(),
        from: z.string().datetime().optional().nullable(),
        to: z.string().datetime().optional().nullable(),
        limit: z.number().int().min(1).max(5000).default(100),
        offset: z.number().int().min(0).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let setStateCode = data.stateCode ?? null;
    let setDistrictId = data.districtId ?? null;
    let setLocalityId = data.localityId ?? null;
    let setMinScore = data.minScore ?? null;
    let setCategory: string | null = null;
    let setName: string | null = null;
    if (data.leadSetId) {
      const { data: set } = await supabase
        .from("lead_sets")
        .select("*")
        .eq("id", data.leadSetId)
        .eq("user_id", userId)
        .maybeSingle();
      if (set) {
        setStateCode = setStateCode ?? set.state_code ?? null;
        setDistrictId = setDistrictId ?? set.district_id ?? null;
        setLocalityId = setLocalityId ?? set.locality_id ?? null;
        setMinScore = setMinScore ?? set.min_score ?? null;
        setCategory = set.category_query ?? null;
        setName = set.name_query ?? null;
      }
    }

    let runIds: string[] | null = null;
    if (data.campaignId) {
      const { data: tgts } = await supabase
        .from("campaign_targets")
        .select("scrape_run_id")
        .eq("user_id", userId)
        .eq("campaign_id", data.campaignId)
        .not("scrape_run_id", "is", null);
      runIds = Array.from(
        new Set((tgts ?? []).map((t) => t.scrape_run_id).filter(Boolean) as string[]),
      );
      if (runIds.length === 0) {
        return { rows: [], count: 0, error: null as string | null };
      }
    }

    let q = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("user_id", userId);
    if (data.q) {
      const term = `%${data.q}%`;
      q = q.or(`name.ilike.${term},phone.ilike.${term},city.ilike.${term},category.ilike.${term}`);
    }
    if (setStateCode) q = q.eq("state_code", setStateCode);
    if (setDistrictId) q = q.eq("district_id", setDistrictId);
    if (setLocalityId) q = q.eq("locality_id", setLocalityId);
    if (data.source) q = q.eq("source", data.source);
    if (typeof setMinScore === "number") q = q.gte("score", setMinScore);
    if (setCategory) q = q.ilike("category", `%${setCategory}%`);
    if (setName) q = q.ilike("name", `%${setName}%`);
    if (runIds) q = q.in("run_id", runIds);
    if (data.from) q = q.gte("scraped_at", data.from);
    if (data.to) q = q.lte("scraped_at", data.to);

    const { data: rows, count, error } = await q
      .order("scraped_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) return { rows: [], count: 0, error: error.message };
    return { rows: rows ?? [], count: count ?? 0, error: null as string | null };
  });

export const listCampaignsWithLeadStats = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select("id,name,status,created_at,last_run_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return { campaigns: [], error: error.message };

    const { data: targets } = await supabase
      .from("campaign_targets")
      .select("campaign_id,scrape_run_id,leads_inserted")
      .eq("user_id", userId);

    const byCampaign = new Map<string, { runIds: Set<string>; inserted: number }>();
    for (const t of targets ?? []) {
      const entry = byCampaign.get(t.campaign_id) ?? { runIds: new Set<string>(), inserted: 0 };
      if (t.scrape_run_id) entry.runIds.add(t.scrape_run_id);
      entry.inserted += t.leads_inserted ?? 0;
      byCampaign.set(t.campaign_id, entry);
    }

    const enriched = await Promise.all(
      (campaigns ?? []).map(async (c) => {
        const entry = byCampaign.get(c.id);
        const runIds = entry ? Array.from(entry.runIds) : [];
        let leadCount = 0;
        if (runIds.length > 0) {
          const { count } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .in("run_id", runIds);
          leadCount = count ?? 0;
        }
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          created_at: c.created_at,
          last_run_at: c.last_run_at,
          lead_count: leadCount,
          inserted_total: entry?.inserted ?? 0,
        };
      }),
    );
    return { campaigns: enriched, error: null as string | null };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing, error: getErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (getErr || !existing) return { ok: false, error: getErr?.message ?? "Not found" };

    const sanitized: Record<string, string | number | null> = {};
    const audit: Array<{ field: string; old: string | null; nv: string | null }> = [];
    for (const [k, v] of Object.entries(data.patch)) {
      if (!EDITABLE_FIELDS.includes(k as EditableField)) continue;
      let next: string | number | null = v as string | number | null;
      if (k === "phone" || k === "whatsapp") {
        const norm = typeof next === "string" ? normalizeIndianMobile(next) : null;
        if (typeof next === "string" && next.trim() && !norm) {
          return { ok: false, error: `Invalid Indian mobile for ${k}` };
        }
        next = norm ?? null;
      }
      const oldVal = (existing as Record<string, unknown>)[k];
      const oldStr = oldVal == null ? null : String(oldVal);
      const newStr = next == null ? null : String(next);
      if (oldStr !== newStr) {
        sanitized[k] = next;
        audit.push({ field: k, old: oldStr, nv: newStr });
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return { ok: true, error: null as string | null, edits: 0 };
    }

    const { error: upErr } = await supabase
      .from("leads")
      .update(sanitized as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (upErr) return { ok: false, error: upErr.message };

    if (audit.length) {
      await supabase.from("lead_edits").insert(
        audit.map((a) => ({
          user_id: userId,
          lead_id: data.id,
          field: a.field,
          old_value: a.old,
          new_value: a.nv,
        })),
      );
    }
    return { ok: true, error: null as string | null, edits: audit.length };
  });

// CSV upload — accepts an array of rows already parsed on the client.
const CsvRow = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  district: z.string().trim().optional().nullable(),
  locality: z.string().trim().optional().nullable(),
});

export const importLeadsCsv = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(CsvRow).min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run, error: runErr } = await supabase
      .from("scrape_runs")
      .insert({
        user_id: userId,
        query: "csv-import",
        sources: ["gmaps"],
        results_per_source: data.rows.length,
        status: "done",
        total_count: 0,
        progress: {} as never,
        finished_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (runErr || !run) return { ok: false, inserted: 0, skipped: 0, error: runErr?.message };

    const { data: states } = await supabase.from("geo_states").select("code,name");
    const stateByName = new Map((states ?? []).map((s) => [s.name.toLowerCase(), s.code]));
    const stateByCode = new Map((states ?? []).map((s) => [s.code.toUpperCase(), s.code]));

    const districtCache = new Map<string, { id: string; name: string; state_code: string }[]>();
    async function findDistrict(stateCode: string | null, name: string | null) {
      if (!stateCode || !name) return null;
      let arr = districtCache.get(stateCode);
      if (!arr) {
        const { data: ds } = await supabase
          .from("geo_districts")
          .select("id,name,state_code")
          .eq("state_code", stateCode);
        arr = ds ?? [];
        districtCache.set(stateCode, arr);
      }
      return arr.find((d) => d.name.toLowerCase() === name.toLowerCase()) ?? null;
    }

    let inserted = 0;
    let skipped = 0;
    for (const r of data.rows) {
      const phone = normalizeIndianMobile(r.phone);
      if (!phone) {
        skipped++;
        continue;
      }
      const stateCode =
        (r.state && (stateByCode.get(r.state.toUpperCase()) || stateByName.get(r.state.toLowerCase()))) ||
        null;
      const district = await findDistrict(stateCode, r.district ?? null);
      const hash = `csv:${phone}:${(r.name || "").toLowerCase().trim()}`;
      const { error: ie } = await supabase.from("leads").insert({
        user_id: userId,
        run_id: run.id,
        name: r.name,
        phone,
        email: r.email ?? null,
        website: r.website ?? null,
        category: r.category ?? null,
        address: r.address ?? null,
        city: r.city ?? null,
        state_code: stateCode,
        district_id: district?.id ?? null,
        district_name: district?.name ?? r.district ?? null,
        locality_name: r.locality ?? null,
        source: "gmaps",
        dedupe_hash: hash,
        score: 50,
        score_reasons: { csv_import: 50 } as never,
      });
      if (ie) skipped++;
      else inserted++;
    }
    await supabase
      .from("scrape_runs")
      .update({ total_count: inserted })
      .eq("id", run.id);
    return { ok: true, inserted, skipped, error: null as string | null };
  });
