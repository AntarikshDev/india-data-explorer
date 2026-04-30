import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const pushLeadsToCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ leadIds: z.array(z.string().uuid()).min(1).max(500) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("crm_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.enabled || !settings.endpoint_url) {
      return { ok: false, pushed: 0, error: "CRM not configured. Set endpoint URL in Settings." };
    }

    const { data: leads, error } = await supabase
      .from("leads")
      .select("*")
      .in("id", data.leadIds);
    if (error) throw new Error(error.message);

    try {
      const res = await fetch(settings.endpoint_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.api_key ? { Authorization: `Bearer ${settings.api_key}` } : {}),
        },
        body: JSON.stringify({ leads }),
      });

      if (!res.ok) {
        const text = await res.text();
        return { ok: false, pushed: 0, error: `CRM ${res.status}: ${text.slice(0, 300)}` };
      }

      await supabase
        .from("leads")
        .update({ pushed_to_crm_at: new Date().toISOString() })
        .in("id", data.leadIds);

      return { ok: true, pushed: leads?.length ?? 0 };
    } catch (e) {
      return { ok: false, pushed: 0, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
