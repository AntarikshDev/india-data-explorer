import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from "@/components/ui/drawer";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { listLeads, listCampaignsWithLeadStats, updateLead, importLeadsCsv } from "@/server/leads.functions";
import { listLeadSets } from "@/server/leadsets.functions";
import { supabase } from "@/integrations/supabase/client";
import { SOURCE_LABELS, type Lead } from "@/lib/leadTypes";
import { toast } from "sonner";
import { Pencil, Upload, Download, Search, ChevronRight, SlidersHorizontal, X, Megaphone } from "lucide-react";

export const Route = createFileRoute("/data")({
  component: () => (
    <AppShell>
      <DataCentrePage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Data Centre — EdSetu Lead Scraper" },
      { name: "description", content: "All scraped leads with campaign, set, and location filters." },
    ],
  }),
});

interface GeoState { code: string; name: string }
interface GeoDistrict { id: string; state_code: string; name: string }
interface GeoLocality { id: string; district_id: string; name: string }
interface CampaignStat {
  id: string;
  name: string;
  status: string;
  created_at: string;
  last_run_at: string | null;
  lead_count: number;
  inserted_total: number;
}
interface LeadSet {
  id: string;
  name: string;
  state_code: string | null;
  district_name: string | null;
  locality_name: string | null;
  category_query: string | null;
}

const PAGE = 100;

function DataCentrePage() {
  const listFn = useServerFn(listLeads);
  const updateFn = useServerFn(updateLead);
  const importFn = useServerFn(importLeadsCsv);
  const listCampaignStatsFn = useServerFn(listCampaignsWithLeadStats);
  const listLeadSetsFn = useServerFn(listLeadSets);

  const [q, setQ] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [source, setSource] = useState<"" | "gmaps" | "justdial">("");
  const [campaignId, setCampaignId] = useState("");
  const [leadSetId, setLeadSetId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [states, setStates] = useState<GeoState[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [localities, setLocalities] = useState<GeoLocality[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignStat[]>([]);
  const [leadSets, setLeadSets] = useState<LeadSet[]>([]);

  const [editing, setEditing] = useState<Lead | null>(null);
  const [exportingCampaign, setExportingCampaign] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.from("geo_states").select("*").order("name").then(({ data }) => setStates((data ?? []) as GeoState[]));
    listCampaignStatsFn({}).then((r) => setCampaigns((r.campaigns ?? []) as CampaignStat[]));
    listLeadSetsFn({}).then((r) => setLeadSets((r.sets ?? []) as LeadSet[]));
  }, [listCampaignStatsFn, listLeadSetsFn]);
  useEffect(() => {
    if (!stateCode) return setDistricts([]);
    supabase.from("geo_districts").select("*").eq("state_code", stateCode).order("name")
      .then(({ data }) => setDistricts((data ?? []) as GeoDistrict[]));
  }, [stateCode]);
  useEffect(() => {
    if (!districtId) return setLocalities([]);
    supabase.from("geo_localities").select("*").eq("district_id", districtId).order("name")
      .then(({ data }) => setLocalities((data ?? []) as GeoLocality[]));
  }, [districtId]);

  const load = useCallback(async (o: number) => {
    setLoading(true);
    const r = await listFn({
      data: {
        q: q || null,
        stateCode: stateCode || null,
        districtId: districtId || null,
        localityId: localityId || null,
        source: source || null,
        campaignId: campaignId || null,
        leadSetId: leadSetId || null,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(to).toISOString() : null,
        limit: PAGE,
        offset: o,
      },
    });
    setRows((r.rows ?? []) as Lead[]);
    setTotal(r.count ?? 0);
    setLoading(false);
  }, [listFn, q, stateCode, districtId, localityId, source, campaignId, leadSetId, from, to]);

  // Auto-apply when filters (other than q/dates) change
  useEffect(() => {
    setOffset(0);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateCode, districtId, localityId, source, campaignId, leadSetId]);

  // Initial load
  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildCsv(data: Lead[]) {
    const headers = ["name", "phone", "email", "category", "city", "state_code", "district_name", "locality_name", "score", "source", "scraped_at"];
    return [
      headers.join(","),
      ...data.map((r) =>
        headers
          .map((h) => {
            const v = (r as unknown as Record<string, unknown>)[h];
            const s = v == null ? "" : String(v).replace(/"/g, '""');
            return /[,"\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      ),
    ].join("\n");
  }

  function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCurrentFilter() {
    const r = await listFn({
      data: {
        q: q || null,
        stateCode: stateCode || null,
        districtId: districtId || null,
        localityId: localityId || null,
        source: source || null,
        campaignId: campaignId || null,
        leadSetId: leadSetId || null,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(to).toISOString() : null,
        limit: 5000,
        offset: 0,
      },
    });
    const data = (r.rows ?? []) as Lead[];
    if (!data.length) {
      toast.error("No rows to export");
      return;
    }
    downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(data));
  }

  async function exportCampaign(c: CampaignStat) {
    setExportingCampaign(c.id);
    try {
      const r = await listFn({ data: { campaignId: c.id, limit: 5000, offset: 0 } });
      const data = (r.rows ?? []) as Lead[];
      if (!data.length) {
        toast.error("No leads in this campaign");
        return;
      }
      const safe = c.name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
      downloadCsv(`campaign-${safe}-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(data));
      toast.success(`Exported ${data.length} leads`);
    } finally {
      setExportingCampaign(null);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("CSV looks empty");
      return;
    }
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const required = ["name", "phone", "email", "website", "category", "address", "city", "state", "district", "locality"];
    const missing = required.filter((c) => !header.includes(c));
    if (missing.length) {
      toast.error(`Missing columns: ${missing.join(", ")}`);
      return;
    }
    const records = lines.slice(1).map((line) => {
      const cols = parseCsvLine(line);
      const obj: Record<string, string> = {};
      header.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
      return obj;
    });
    const res = await importFn({
      data: {
        rows: records.map((r) => ({
          name: r.name,
          phone: r.phone,
          email: r.email || null,
          website: r.website || null,
          category: r.category || null,
          address: r.address || null,
          city: r.city || null,
          state: r.state || null,
          district: r.district || null,
          locality: r.locality || null,
        })),
      },
    });
    if (!res.ok) toast.error(res.error ?? "Import failed");
    else toast.success(`Imported ${res.inserted}, skipped ${res.skipped}`);
    if (fileRef.current) fileRef.current.value = "";
    load(0);
    setOffset(0);
  }

  const pages = useMemo(() => Math.ceil(total / PAGE), [total]);
  const page = Math.floor(offset / PAGE) + 1;

  const activeCampaign = campaigns.find((c) => c.id === campaignId);
  const activeSet = leadSets.find((s) => s.id === leadSetId);

  function clearAllFilters() {
    setQ("");
    setStateCode("");
    setDistrictId("");
    setLocalityId("");
    setSource("");
    setCampaignId("");
    setLeadSetId("");
    setFrom("");
    setTo("");
  }

  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterControls = (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            className="h-9 text-xs pl-7"
            placeholder="Search name / phone / city / category"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(0)}
          />
        </div>
        <Select value={campaignId || "__any__"} onValueChange={(v) => setCampaignId(v === "__any__" ? "" : v)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Campaign" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All campaigns</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} · {c.lead_count}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={leadSetId || "__any__"} onValueChange={(v) => setLeadSetId(v === "__any__" ? "" : v)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Lead set" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All sets</SelectItem>
            {leadSets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Select value={stateCode || "__any__"} onValueChange={(v) => { setStateCode(v === "__any__" ? "" : v); setDistrictId(""); setLocalityId(""); }}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All states</SelectItem>
            {states.map((s) => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={districtId || "__any__"} onValueChange={(v) => { setDistrictId(v === "__any__" ? "" : v); setLocalityId(""); }} disabled={!stateCode}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="District" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All districts</SelectItem>
            {districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={localityId || "__any__"} onValueChange={(v) => setLocalityId(v === "__any__" ? "" : v)} disabled={!districtId}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Locality" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All localities</SelectItem>
            {localities.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source || "__any__"} onValueChange={(v) => setSource(v === "__any__" ? "" : (v as "gmaps" | "justdial"))}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">All sources</SelectItem>
            <SelectItem value="gmaps">Google Maps</SelectItem>
            <SelectItem value="justdial">JustDial</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <Label className="text-[10px]">Scraped from</Label>
          <Input type="date" className="h-9 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px]">Scraped to</Label>
          <Input type="date" className="h-9 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button size="sm" className="h-9 text-xs sm:col-start-4" onClick={() => { setOffset(0); load(0); setFiltersOpen(false); }}>Apply</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">Data Centre</h1>
          <p className="text-[11px] md:text-xs text-muted-foreground">{total} leads · edits tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="h-9">
            <Upload className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" variant="outline" onClick={exportCurrentFilter} disabled={total === 0} className="h-9">
            <Download className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Campaign sections */}
      {campaigns.length > 0 && (
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> Campaign-wise data
            </h2>
            {campaignId && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setCampaignId("")}>
                Show all <X className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {campaigns.map((c) => {
              const active = c.id === campaignId;
              return (
                <div
                  key={c.id}
                  className={`rounded-lg border p-2.5 text-xs transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="text-left min-w-0 flex-1"
                      onClick={() => setCampaignId(active ? "" : c.id)}
                    >
                      <div className="font-medium truncate text-sm">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] mr-1">{c.lead_count} leads</Badge>
                        <span className="capitalize">{c.status}</span>
                      </div>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      disabled={exportingCampaign === c.id || c.lead_count === 0}
                      title="Export campaign CSV"
                      onClick={() => exportCampaign(c)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Active filter chips */}
      {(activeCampaign || activeSet || stateCode || districtId || localityId || source) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">Filtering:</span>
          {activeCampaign && (
            <Badge variant="secondary" className="gap-1">
              Campaign: {activeCampaign.name}
              <button onClick={() => setCampaignId("")}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {activeSet && (
            <Badge variant="secondary" className="gap-1">
              Set: {activeSet.name}
              <button onClick={() => setLeadSetId("")}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {stateCode && (
            <Badge variant="secondary" className="gap-1">
              {states.find((s) => s.code === stateCode)?.name ?? stateCode}
              <button onClick={() => { setStateCode(""); setDistrictId(""); setLocalityId(""); }}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {source && (
            <Badge variant="secondary" className="gap-1">
              {SOURCE_LABELS[source as "gmaps" | "justdial"]}
              <button onClick={() => setSource("")}><X className="h-3 w-3" /></button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={clearAllFilters}>Clear all</Button>
        </div>
      )}

      {/* Mobile: search + filter trigger */}
      <div className="md:hidden flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="h-3.5 w-3.5 absolute left-2 top-3 text-muted-foreground" />
          <Input
            className="h-10 pl-7"
            placeholder="Search leads"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(0)}
          />
        </div>
        <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Filters</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6">{filterControls}</div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Desktop: full filter card */}
      <Card className="p-3 hidden md:block">{filterControls}</Card>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {loading && (
          <Card className="p-6 text-center text-xs text-muted-foreground">Loading…</Card>
        )}
        {!loading && rows.length === 0 && (
          <Card className="p-6 text-center text-xs text-muted-foreground">No leads.</Card>
        )}
        {!loading &&
          rows.map((r) => (
            <Card
              key={r.id}
              className="p-3 flex items-start gap-2 active:bg-accent/40 transition-colors"
              onClick={() => setEditing(r)}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate text-sm">{r.name ?? "—"}</span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                    {r.score}
                  </Badge>
                </div>
                <div className="font-mono text-xs text-foreground/80">{r.phone}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[r.locality_name, r.district_name ?? r.city, r.state_code]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                  {r.category && <> · {r.category}</>}
                </div>
                <div className="text-[10px] text-muted-foreground/80">
                  {SOURCE_LABELS[r.source]} · {new Date(r.scraped_at).toLocaleDateString()}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </Card>
          ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Scraped</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No leads.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium max-w-[180px] truncate">{r.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">
                    {[r.locality_name, r.district_name ?? r.city, r.state_code].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs max-w-[140px] truncate">{r.category ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{r.score}</Badge></TableCell>
                  <TableCell className="text-xs">{SOURCE_LABELS[r.source]}</TableCell>
                  <TableCell className="text-xs">{new Date(r.scraped_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Page {page} / {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - PAGE); setOffset(o); load(o); }}>Prev</Button>
            <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => { const o = offset + PAGE; setOffset(o); load(o); }}>Next</Button>
          </div>
        </div>
      )}

      {editing && <EditDialog lead={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(offset); }} updateFn={updateFn} />}
    </div>
  );
}

function EditDialog({
  lead,
  onClose,
  onSaved,
  updateFn,
}: {
  lead: Lead;
  onClose: () => void;
  onSaved: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateFn: (args: any) => Promise<{ ok: boolean; error?: string | null }>;
}) {
  const [form, setForm] = useState({
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    whatsapp: lead.whatsapp ?? "",
    email: lead.email ?? "",
    owner_name: lead.owner_name ?? "",
    category: lead.category ?? "",
    website: lead.website ?? "",
    address: lead.address ?? "",
    city: lead.city ?? "",
    notes: lead.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  async function save() {
    setBusy(true);
    const patch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(form)) patch[k] = v.trim() === "" ? null : v.trim();
    const r = await updateFn({ data: { id: lead.id, patch } });
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Failed");
    toast.success("Saved");
    onSaved();
  }
  const isMobile = useIsMobile();
  const formBody = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(Object.keys(form) as (keyof typeof form)[]).map((k) => (
        <div key={k} className={k === "address" || k === "notes" ? "sm:col-span-2" : ""}>
          <Label className="text-xs capitalize">{k.replace("_", " ")}</Label>
          <Input className="h-10" value={form[k]} onChange={(e) => set(k, e.target.value)} />
        </div>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader>
            <DrawerTitle>Edit lead</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-2 overflow-y-auto">{formBody}</div>
          <DrawerFooter className="flex-row justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">{formBody}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') { inQ = true; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}
