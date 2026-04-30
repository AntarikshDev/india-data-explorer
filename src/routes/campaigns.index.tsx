import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { listCampaigns } from "@/server/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/campaigns")({
  component: () => (
    <AppShell>
      <CampaignsPage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Campaigns — EdSetu Lead Scraper" },
      { name: "description", content: "Auto-routing scrape campaigns across districts and states." },
    ],
  }),
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "outline",
  paused: "secondary",
  awaiting_next_state: "secondary",
  completed: "outline",
};

function CampaignsPage() {
  const listFn = useServerFn(listCampaigns);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listFn({}).then((r) => {
      setItems(r.campaigns ?? []);
      setLoading(false);
    });
  }, [listFn]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Auto-route scrapes across districts and states.</p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <Plus className="mr-2 h-4 w-4" /> New campaign
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <p className="text-muted-foreground">No campaigns yet.</p>
          <Button asChild>
            <Link to="/campaigns/new">Create your first campaign</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((c) => (
            <Link key={c.id} to="/campaigns/$id" params={{ id: c.id }}>
              <Card className="p-4 hover:bg-accent/40 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>
                        {c.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      "{c.query_template}" · {c.current_state_code ?? c.start_state_code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.sources?.join(" + ")} · {c.results_per_source}/source · cap{" "}
                      {c.daily_target_cap}/day
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
