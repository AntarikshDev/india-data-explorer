import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GeoPicker, emptyGeoSelection, type GeoSelection } from "@/components/GeoPicker";
import { listLeadSets, createLeadSet, deleteLeadSet } from "@/server/leadsets.functions";
import { toast } from "sonner";
import { Trash2, Phone } from "lucide-react";

export const Route = createFileRoute("/sets")({
  component: () => (
    <AppShell>
      <SetsPage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Lead Sets — EdSetu Lead Scraper" },
      { name: "description", content: "Saved calling sets by state, district, locality." },
    ],
  }),
});

interface SetRow {
  id: string;
  name: string;
  state_code: string | null;
  district_name: string | null;
  locality_name: string | null;
  min_score: number;
  ready_count: number;
}

function SetsPage() {
  const listFn = useServerFn(listLeadSets);
  const createFn = useServerFn(createLeadSet);
  const delFn = useServerFn(deleteLeadSet);

  const [rows, setRows] = useState<SetRow[]>([]);
  const [name, setName] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [geo, setGeo] = useState<GeoSelection>(emptyGeoSelection);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await listFn();
    setRows((r.sets ?? []) as SetRow[]);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!name.trim()) return toast.error("Name required");
    setBusy(true);
    const r = await createFn({
      data: {
        name: name.trim(),
        stateCode: geo.stateCode,
        districtId: geo.districtId,
        districtName: geo.districtName,
        localityId: geo.localityId,
        localityName: geo.localityName,
        minScore,
      },
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Failed");
    toast.success("Set created");
    setName("");
    setGeo(emptyGeoSelection);
    setMinScore(0);
    load();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Lead Sets</h1>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Create a calling set</h2>
        <div className="space-y-2">
          <Label htmlFor="n">Name</Label>
          <Input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lucknow coaching centres" />
        </div>
        <GeoPicker value={geo} onChange={setGeo} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ms" className="text-xs">Min score</Label>
            <Input id="ms" type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(parseInt(e.target.value || "0"))} />
          </div>
        </div>
        <Button onClick={create} disabled={busy}>{busy ? "Saving…" : "Create set"}</Button>
      </Card>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-muted-foreground text-sm">No sets yet.</p>}
        {rows.map((s) => (
          <Card key={s.id} className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{s.name}</div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                {[s.state_code, s.district_name, s.locality_name].filter(Boolean).join(" · ") || "All locations"}
                {s.min_score > 0 && <span>· min score {s.min_score}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary">{s.ready_count} ready</Badge>
              <Button asChild size="sm" variant="default">
                <Link to="/queue" search={{}}>
                  <Phone className="h-3.5 w-3.5 mr-1" /> Call
                </Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Delete this set?")) return;
                  await delFn({ data: { id: s.id } });
                  load();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
