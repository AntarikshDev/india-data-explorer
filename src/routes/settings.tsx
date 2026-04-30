import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Settings — EdSetu Lead Scraper" },
      { name: "description", content: "Configure CRM push and limits." },
    ],
  }),
});

function SettingsPage() {
  const [endpointUrl, setEndpointUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [cap, setCap] = useState(200);
  const [crmWebhookUrl, setCrmWebhookUrl] = useState("");
  const [dailySync, setDailySync] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("crm_settings")
      .select("*")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEndpointUrl(data.endpoint_url ?? "");
          setApiKey(data.api_key ?? "");
          setEnabled(data.enabled);
          setCap(data.daily_credit_cap);
          setCrmWebhookUrl(data.crm_webhook_url ?? "");
          setDailySync(data.daily_sync_enabled ?? false);
          setLastSync(data.last_daily_sync_at ?? null);
        }
      });
  }, []);

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("crm_settings")
      .update({
        endpoint_url: endpointUrl || null,
        api_key: apiKey || null,
        enabled,
        daily_credit_cap: cap,
        crm_webhook_url: crmWebhookUrl || null,
        daily_sync_enabled: dailySync,
      })
      .eq("user_id", u.user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  return (
    <div className="max-w-2xl space-y-5 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Settings</h1>

      <Card className="p-4 md:p-6 space-y-5">
        <div>
          <h2 className="font-semibold">EdSetu Command — Daily Sync (8 PM IST)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every night at 8 PM IST, this app will POST today's call attempts to your EdSetu Command webhook
            so all responses land in your CRM automatically.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="ds" className="cursor-pointer">Enable daily sync</Label>
            <p className="text-xs text-muted-foreground">
              {lastSync ? `Last sync: ${new Date(lastSync).toLocaleString()}` : "Not synced yet"}
            </p>
          </div>
          <Switch id="ds" checked={dailySync} onCheckedChange={setDailySync} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hook">Webhook URL</Label>
          <Input
            id="hook"
            type="url"
            placeholder="https://edsetu-command.lovable.app/api/public/hooks/import-call-log"
            value={crmWebhookUrl}
            onChange={(e) => setCrmWebhookUrl(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Receives <code>{`{ date, attempts: [...] }`}</code>. The optional API key below is sent as <code>Authorization: Bearer …</code>.
          </p>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div>
          <h2 className="font-semibold">Per-page CRM Push (legacy)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Used by the "Push to CRM" button on results pages. Accepts <code>POST {`{ leads: [...] }`}</code>.
          </p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="enabled" className="cursor-pointer">Enable CRM push</Label>
            <p className="text-xs text-muted-foreground">When off, the Push button is disabled.</p>
          </div>
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="url">Endpoint URL</Label>
          <Input
            id="url"
            type="url"
            placeholder="https://your-crm.lovable.app/api/public/leads/import"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="key">API key (Bearer token, used by both)</Label>
          <Input id="key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div>
          <h2 className="font-semibold">Limits</h2>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cap">Daily Firecrawl credit cap (informational)</Label>
          <Input id="cap" type="number" min={10} max={10000} value={cap} onChange={(e) => setCap(parseInt(e.target.value || "0"))} />
        </div>
      </Card>

      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
    </div>
  );
}
