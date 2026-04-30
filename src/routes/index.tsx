import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createScrapeRun, executeScrapeRun } from "@/server/scrape.functions";
import { AppShell } from "@/components/AppShell";
import { GeoPicker, emptyGeoSelection, type GeoSelection } from "@/components/GeoPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { SOURCE_LABELS, type Source } from "@/lib/leadTypes";
import { toast } from "sonner";
import { Loader2, Search, MapPin } from "lucide-react";

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
  const createRunFn = useServerFn(createScrapeRun);
  const executeRunFn = useServerFn(executeScrapeRun);
  const [query, setQuery] = useState("");
  const [geo, setGeo] = useState<GeoSelection>(emptyGeoSelection);
  const [sources, setSources] = useState<Source[]>(["justdial", "indiamart"]);
  const [perSource, setPerSource] = useState(25);
  const [running, setRunning] = useState(false);

  const estCredits = sources.length * perSource * 1.5; // ~1 page + pagination amortised

  // Derive the city string the scraper will use
  const derivedCity = geo.localityName ?? geo.districtName ?? null;

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
      const res = await createRunFn({
        data: {
          query: query.trim(),
          city: derivedCity,
          sources,
          resultsPerSource: perSource,
        },
      });
      if (!res.runId) {
        toast.error(res.error ?? "Could not start scrape");
        return;
      }
      // Fire-and-forget the actual scrape — the results page subscribes via realtime.
      executeRunFn({ data: { runId: res.runId } }).catch((err) => {
        console.error("executeScrapeRun failed:", err);
      });
      toast.success("Scrape started — streaming results live");
      navigate({ to: "/results/$runId", params: { runId: res.runId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start scrape");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Find leads</h1>
        <p className="text-muted-foreground">
          Pick a location, type what you're looking for. We scrape, score, and rank.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="q">Search query</Label>
          <Input
            id="q"
            placeholder='e.g. "Coaching classes"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Tip: Don't include the city — pick it below for better targeting.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Location
          </Label>
          <GeoPicker value={geo} onChange={setGeo} defaultStateCode="UP" />
          {derivedCity && (
            <p className="text-xs text-muted-foreground">
              Targeting: <span className="font-medium text-foreground">{derivedCity}</span>
              {geo.stateName && <>, {geo.stateName}</>}
            </p>
          )}
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
            Estimated cost: ~{Math.ceil(estCredits)} Firecrawl credits (incl. pagination)
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
