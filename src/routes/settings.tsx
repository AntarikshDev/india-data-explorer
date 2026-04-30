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
        }
      });
  }, []);

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("crm_settings")
      .update({ endpoint_url: endpointUrl || null, api_key: apiKey || null, enabled, daily_credit_cap: cap })
      .eq("user_id", u.user.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card className="p-6 space-y-5">
        <div>
          <h2 className="font-semibold">EdSetu Command CRM</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Push selected leads from any results page directly into your CRM. Your CRM should expose an HTTPS endpoint
            that accepts <code className="text-xs bg-muted px-1 rounded">POST {`{ leads: [...] }`}</code>.
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
          <Input id="url" type="url" placeholder="https://your-crm.lovable.app/api/public/leads/import" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="key">API key (optional, sent as Bearer token)</Label>
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
