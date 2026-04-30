// Daily 8 PM IST sync — POST today's call_attempts to each user's
// EdSetu Command webhook URL, if daily_sync_enabled is true.
//
// Auth: shared secret in `x-cron-secret` header (CRON_SECRET).
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/sync-crm-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("x-cron-secret");
        const expected = process.env.CRON_SECRET;
        if (!expected || secret !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: settings, error } = await supabaseAdmin
          .from("crm_settings")
          .select("user_id, crm_webhook_url, api_key, daily_sync_enabled")
          .eq("daily_sync_enabled", true);

        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const isoDate = startOfDay.toISOString().slice(0, 10);

        const results: Array<{ userId: string; ok: boolean; count: number; error?: string }> = [];
        for (const s of settings ?? []) {
          if (!s.crm_webhook_url) {
            results.push({ userId: s.user_id, ok: false, count: 0, error: "no webhook url" });
            continue;
          }
          const { data: attempts } = await supabaseAdmin
            .from("call_attempts")
            .select("id, lead_id, outcome, notes, next_action_at, created_at")
            .eq("user_id", s.user_id)
            .gte("created_at", startOfDay.toISOString());

          const leadIds = Array.from(new Set((attempts ?? []).map((a) => a.lead_id)));
          const { data: leads } = leadIds.length
            ? await supabaseAdmin.from("leads").select("*").in("id", leadIds)
            : { data: [] };
          const leadById = new Map((leads ?? []).map((l) => [l.id, l]));

          const payload = {
            date: isoDate,
            attempts: (attempts ?? []).map((a) => ({
              ...a,
              lead: leadById.get(a.lead_id) ?? null,
            })),
          };

          try {
            const res = await fetch(s.crm_webhook_url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(s.api_key ? { Authorization: `Bearer ${s.api_key}` } : {}),
              },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              const t = await res.text().catch(() => "");
              results.push({ userId: s.user_id, ok: false, count: payload.attempts.length, error: `${res.status}: ${t.slice(0, 200)}` });
              continue;
            }
            await supabaseAdmin
              .from("crm_settings")
              .update({ last_daily_sync_at: new Date().toISOString() })
              .eq("user_id", s.user_id);
            results.push({ userId: s.user_id, ok: true, count: payload.attempts.length });
          } catch (e) {
            results.push({ userId: s.user_id, ok: false, count: 0, error: e instanceof Error ? e.message : "fetch failed" });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
