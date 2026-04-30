import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import {
  getCampaign,
  runCampaignOnce,
  updateCampaignStatus,
} from "@/server/campaigns.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, Pause, ArrowRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/campaigns/$id")({
  component: () => (
    <AppShell>
      <CampaignDetailPage />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Campaign — EdSetu Lead Scraper" }] }),
});

function CampaignDetailPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getCampaign);
  const runFn = useServerFn(runCampaignOnce);
  const setStatusFn = useServerFn(updateCampaignStatus);

  const [campaign, setCampaign] = useState<any>(null);
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [coverage, setCoverage] = useState<{ covered: number; total: number; pct: number } | null>(
    null,
  );
  const [states, setStates] = useState<{ code: string; name: string }[]>([]);
  const [nextState, setNextState] = useState("");

  const refresh = useCallback(async () => {
    const r = await getFn({ data: { id } });
    setCampaign(r.campaign);
    setTargets(r.targets ?? []);
    if (r.campaign) {
      const stateCode = r.campaign.current_state_code ?? r.campaign.start_state_code;
      const [districtsRes, touchedRes] = await Promise.all([
        supabase.from("geo_districts").select("id", { count: "exact", head: true }).eq("state_code", stateCode),
        supabase
          .from("campaign_targets")
          .select("district_id")
          .eq("campaign_id", id)
          .eq("state_code", stateCode),
      ]);
      const total = districtsRes.count ?? 0;
      const touched = new Set((touchedRes.data ?? []).map((t: any) => t.district_id).filter(Boolean));
      setCoverage({
        covered: touched.size,
        total,
        pct: total ? Math.round((touched.size / total) * 100) : 0,
      });
    }
    setLoading(false);
  }, [getFn, id]);

  useEffect(() => {
    refresh();
    supabase
      .from("geo_states")
      .select("code, name")
      .order("name")
      .then(({ data }) => setStates(data ?? []));
  }, [refresh]);

  // Realtime — refresh when targets change
  useEffect(() => {
    const ch = supabase
      .channel(`campaign:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_targets" }, () =>
        refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, refresh]);

  async function runNow() {
    setRunning(true);
    const res = await runFn({ data: { campaignId: id } });
    setRunning(false);
    if (res.ok) {
      toast.success(`Started: ${res.district}`);
      refresh();
    } else {
      toast.error(res.error ?? "Failed");
    }
  }

  async function togglePause() {
    if (!campaign) return;
    const newStatus = campaign.status === "active" ? "paused" : "active";
    const res = await setStatusFn({ data: { id, status: newStatus } });
    if (res.ok) refresh();
    else toast.error(res.error ?? "Failed");
  }

  async function expandToState() {
    if (!nextState) {
      toast.error("Pick a state");
      return;
    }
    const res = await setStatusFn({
      data: { id, status: "active", currentStateCode: nextState },
    });
    if (res.ok) {
      toast.success("Expanded — agent will resume here");
      refresh();
    } else {
      toast.error(res.error ?? "Failed");
    }
  }

  if (loading || !campaign) {
    return (
      <div className="grid place-items-center py-32 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/campaigns" className="text-sm text-muted-foreground hover:text-foreground">
          ← All campaigns
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
            <p className="text-muted-foreground">
              "{campaign.query_template}" · {campaign.sources?.join(" + ")}
            </p>
          </div>
          <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
            {campaign.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current state</p>
            <p className="text-xl font-semibold">
              {campaign.current_state_code ?? campaign.start_state_code}
            </p>
          </div>
          {coverage && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Coverage</p>
              <p className="text-xl font-semibold tabular-nums">
                {coverage.covered}/{coverage.total} · {coverage.pct}%
              </p>
            </div>
          )}
        </div>
        {coverage && <Progress value={coverage.pct} />}

        {campaign.status === "awaiting_next_state" ? (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">
              State threshold reached. Pick the next state to continue.
            </p>
            <div className="flex gap-2">
              <Select value={nextState} onValueChange={setNextState}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder="Pick a state" />
                </SelectTrigger>
                <SelectContent>
                  {states
                    .filter((s) => s.code !== (campaign.current_state_code ?? campaign.start_state_code))
                    .map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={expandToState}>
                <ArrowRight className="mr-2 h-4 w-4" /> Expand
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={runNow} disabled={running || campaign.status !== "active"}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Run agent now
            </Button>
            <Button variant="outline" onClick={togglePause}>
              {campaign.status === "active" ? (
                <>
                  <Pause className="mr-2 h-4 w-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Resume
                </>
              )}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h2 className="font-semibold">Run history</h2>
        </div>
        {targets.length === 0 ? (
          <p className="p-6 text-muted-foreground text-sm">
            No runs yet. Click "Run agent now" to start.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">District</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Leads</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {targets
                .slice()
                .reverse()
                .map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 text-muted-foreground">
                      {t.ran_at ? new Date(t.ran_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-3 font-medium">{t.district_name ?? "—"}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          t.status === "done"
                            ? "default"
                            : t.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right tabular-nums">{t.leads_inserted}</td>
                    <td className="p-3">
                      {t.scrape_run_id && (
                        <Link
                          to="/results/$runId"
                          params={{ runId: t.scrape_run_id }}
                          className="text-primary inline-flex items-center gap-1 hover:underline text-xs"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
