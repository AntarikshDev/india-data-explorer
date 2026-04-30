import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startScrapeRun } from "@/server/scrape.functions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { SOURCE_LABELS, type Source } from "@/lib/leadTypes";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/")({
  component: () => (
    <AppShell>
      <SearchPage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Search leads — EdSetu Lead Scraper" },
      { name: "description", content: "Pull business leads from Google Maps, JustDial, and IndiaMART by query and city." },
    ],
  }),
});

const ALL_SOURCES: Source[] = ["gmaps", "justdial", "indiamart"];

function SearchPage() {
  const navigate = useNavigate();
  const startFn = useServerFn(startScrapeRun);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [sources, setSources] = useState<Source[]>(["justdial", "indiamart"]);
  const [perSource, setPerSource] = useState(25);
  const [running, setRunning] = useState(false);

  const estCredits = sources.length * perSource;

  function toggle(s: Source) {
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function run() {
    if (!query.trim() || sources.length === 0) {
      toast.error("Enter a query and pick at least one source");
      return;
    }
    setRunning(true);
    try {
      const res = await startFn({
        data: { query: query.trim(), city: city.trim() || null, sources, resultsPerSource: perSource },
      });
      toast.success(`Scrape complete — ${res.total} leads`);
      navigate({ to: "/results/$runId", params: { runId: res.runId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Find leads</h1>
        <p className="text-muted-foreground">
          Type what you're looking for. We scrape, dedupe, and put it in a clean table.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="q">Search query</Label>
          <Input
            id="q"
            placeholder='e.g. "Coaching classes in sector 135 Noida"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City (optional, helps targeting)</Label>
          <Input id="city" placeholder="e.g. Noida" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>

        <div className="space-y-3">
          <Label>Sources</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ALL_SOURCES.map((s) => (
              <label
                key={s}
                className={
                  "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors " +
                  (sources.includes(s) ? "border-primary bg-primary/5" : "hover:bg-accent")
                }
              >
                <Checkbox checked={sources.includes(s)} onCheckedChange={() => toggle(s)} />
                <div className="text-sm">
                  <div className="font-medium">{SOURCE_LABELS[s]}</div>
                  <div className="text-xs text-muted-foreground">
                    {s === "gmaps" ? "Variable reliability" : "High reliability"}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Results per source</Label>
            <span className="text-sm font-medium tabular-nums">{perSource}</span>
          </div>
          <Slider
            value={[perSource]}
            onValueChange={(v) => setPerSource(v[0])}
            min={5}
            max={50}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            Estimated cost: ~{estCredits} Firecrawl credit{estCredits === 1 ? "" : "s"}
          </p>
        </div>

        <Button onClick={run} disabled={running} size="lg" className="w-full">
          {running ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scraping…
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" /> Run scrape
            </>
          )}
        </Button>
      </Card>
    </div>
  );
}
