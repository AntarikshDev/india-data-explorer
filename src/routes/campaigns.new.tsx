import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { createCampaign } from "@/server/campaigns.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SOURCE_LABELS, type Source } from "@/lib/leadTypes";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/campaigns/new")({
  component: () => (
    <AppShell>
      <NewCampaignPage />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "New campaign — EdSetu Lead Scraper" }] }),
});

const SOURCES: Source[] = ["gmaps", "justdial"];

function NewCampaignPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createCampaign);

  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Source[]>(["gmaps", "justdial"]);
  const [perSource, setPerSource] = useState(25);
  const [states, setStates] = useState<{ code: string; name: string }[]>([]);
  const [stateCode, setStateCode] = useState("UP");
  const [coverageThreshold, setCoverageThreshold] = useState(80);
  const [dailyCap, setDailyCap] = useState(5);
  const [perDistrictCap, setPerDistrictCap] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("geo_states")
      .select("code, name")
      .order("name")
      .then(({ data }) => setStates(data ?? []));
  }, []);

  function toggleSrc(s: Source) {
    setSources((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  }

  async function submit() {
    if (!name.trim() || !query.trim() || sources.length === 0) {
      toast.error("Fill name, query, and pick at least one source");
      return;
    }
    setSubmitting(true);
    const res = await createFn({
      data: {
        name: name.trim(),
        queryTemplate: query.trim(),
        sources,
        resultsPerSource: perSource,
        startStateCode: stateCode,
        stateCoverageThreshold: coverageThreshold,
        perDistrictCap,
        exhaustionStreak: 3,
        dailyTargetCap: dailyCap,
        scheduleEnabled: true,
      },
    });
    setSubmitting(false);
    if (!res.id) {
      toast.error(res.error ?? "Failed to create");
      return;
    }
    toast.success("Campaign created");
    navigate({ to: "/campaigns/$id", params: { id: res.id } });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New campaign</h1>
        <p className="text-muted-foreground">
          The agent will walk this query through districts of your start state and ask before
          jumping to the next state.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="cn">Name</Label>
          <Input
            id="cn"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. UP Coaching Sweep"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cq">Query template</Label>
          <Input
            id="cq"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Coaching classes"
          />
          <p className="text-xs text-muted-foreground">
            District name is added automatically — don't include a city here.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Start state</Label>
          <Select value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {states.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label>Sources</Label>
          <div className="grid grid-cols-2 gap-2">
            {SOURCES.map((s) => (
              <label
                key={s}
                className={
                  "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors " +
                  (sources.includes(s) ? "border-primary bg-primary/5" : "hover:bg-accent")
                }
              >
                <Checkbox checked={sources.includes(s)} onCheckedChange={() => toggleSrc(s)} />
                <span className="text-sm font-medium">{SOURCE_LABELS[s]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
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
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label>Daily target cap</Label>
            <span className="text-sm font-medium tabular-nums">{dailyCap} runs/day</span>
          </div>
          <Slider
            value={[dailyCap]}
            onValueChange={(v) => setDailyCap(v[0])}
            min={1}
            max={20}
            step={1}
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label>Max runs per district</Label>
            <span className="text-sm font-medium tabular-nums">{perDistrictCap}</span>
          </div>
          <Slider
            value={[perDistrictCap]}
            onValueChange={(v) => setPerDistrictCap(v[0])}
            min={1}
            max={20}
            step={1}
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label>State coverage threshold</Label>
            <span className="text-sm font-medium tabular-nums">{coverageThreshold}%</span>
          </div>
          <Slider
            value={[coverageThreshold]}
            onValueChange={(v) => setCoverageThreshold(v[0])}
            min={50}
            max={100}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            When this much of the state's districts have been touched, you'll be prompted to expand.
          </p>
        </div>

        <Button onClick={submit} disabled={submitting} size="lg" className="w-full">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
            </>
          ) : (
            "Create campaign"
          )}
        </Button>
      </Card>
    </div>
  );
}
