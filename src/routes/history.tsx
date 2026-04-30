import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOURCE_LABELS, type ScrapeRun, type Source } from "@/lib/leadTypes";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/history")({
  component: () => (
    <AppShell>
      <HistoryPage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "History — EdSetu Lead Scraper" },
      { name: "description", content: "Past scrape runs." },
    ],
  }),
});

function HistoryPage() {
  const [runs, setRuns] = useState<ScrapeRun[]>([]);

  async function load() {
    const { data } = await supabase.from("scrape_runs").select("*").order("created_at", { ascending: false });
    setRuns((data ?? []) as ScrapeRun[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function del(id: string) {
    if (!confirm("Delete this run and all its leads?")) return;
    const { error } = await supabase.from("scrape_runs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Run history</h1>
      <div className="space-y-3">
        {runs.length === 0 && <p className="text-muted-foreground">No runs yet. Try a search!</p>}
        {runs.map((r) => (
          <Card key={r.id} className="p-4 flex items-center justify-between gap-4 hover:bg-accent/30 transition-colors">
            <Link to="/results/$runId" params={{ runId: r.id }} className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.query}</div>
              <div className="flex gap-2 mt-1 flex-wrap items-center text-xs text-muted-foreground">
                <span>{new Date(r.created_at).toLocaleString()}</span>
                <span>·</span>
                <span>{r.total_count} leads</span>
                <span>·</span>
                <span>{r.sources.map((s) => SOURCE_LABELS[s as Source]).join(", ")}</span>
                {r.city && <><span>·</span><span>{r.city}</span></>}
                <Badge variant={r.status === "done" ? "secondary" : r.status === "failed" ? "destructive" : "outline"} className="ml-2">
                  {r.status}
                </Badge>
              </div>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => del(r.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
