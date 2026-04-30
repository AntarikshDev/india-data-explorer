import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { listLeads, updateLead, importLeadsCsv } from "@/server/leads.functions";
import { supabase } from "@/integrations/supabase/client";
import { SOURCE_LABELS, type Lead } from "@/lib/leadTypes";
import { toast } from "sonner";
import { Pencil, Upload, Download, Search, ChevronRight, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/data")({
  component: () => (
    <AppShell>
      <DataCentrePage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Data Centre — EdSetu Lead Scraper" },
      { name: "description", content: "All scraped leads with filters, edit, and CSV import." },
    ],
  }),
});

interface GeoState { code: string; name: string }
interface GeoDistrict { id: string; state_code: string; name: string }
interface GeoLocality { id: string; district_id: string; name: string }

const PAGE = 100;

function DataCentrePage() {
  const listFn = useServerFn(listLeads);
  const updateFn = useServerFn(updateLead);
  const importFn = useServerFn(importLeadsCsv);

  const [q, setQ] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [localityId, setLocalityId] = useState("");
  const [source, setSource] = useState<"" | "gmaps" | "justdial">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [states, setStates] = useState<GeoState[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [localities, setLocalities] = useState<GeoLocality[]>([]);

  const [editing, setEditing] = useState<Lead | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.from("geo_states").select("*").order("name").then(({ data }) => setStates((data ?? []) as GeoState[]));
  }, []);
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

  async function load(o = offset) {
    setLoading(true);
    const r = await listFn({
      data: {
        q: q || null,
        stateCode: stateCode || null,
        districtId: districtId || null,
        localityId: localityId || null,
        source: source || null,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(to).toISOString() : null,
        limit: PAGE,
        offset: o,
      },
    });
    setRows((r.rows ?? []) as Lead[]);
    setTotal(r.count ?? 0);
    setLoading(false);
  }
  useEffect(() => {
    load(0);
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportCsv() {
    if (rows.length === 0) return;
    const headers = ["name", "phone", "email", "category", "city", "state_code", "district_name", "locality_name", "score", "source", "scraped_at"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const v = (r as unknown as Record<string, unknown>)[h];
            const s = v == null ? "" : String(v).replace(/"/g, '""');
            return /[,"\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Data Centre</h1>
          <p className="text-xs text-muted-foreground">{total} leads · edits are tracked, no deletes</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          <div className="lg:col-span-2 relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="h-8 text-xs pl-7"
              placeholder="Search name / phone / city / category"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(0)}
            />
          </div>
          <Select value={stateCode || "__any__"} onValueChange={(v) => { setStateCode(v === "__any__" ? "" : v); setDistrictId(""); setLocalityId(""); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All states</SelectItem>
              {states.map((s) => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={districtId || "__any__"} onValueChange={(v) => { setDistrictId(v === "__any__" ? "" : v); setLocalityId(""); }} disabled={!stateCode}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="District" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All districts</SelectItem>
              {districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={localityId || "__any__"} onValueChange={(v) => setLocalityId(v === "__any__" ? "" : v)} disabled={!districtId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Locality" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All localities</SelectItem>
              {localities.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source || "__any__"} onValueChange={(v) => setSource(v === "__any__" ? "" : (v as "gmaps" | "justdial"))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All sources</SelectItem>
              <SelectItem value="gmaps">Google Maps</SelectItem>
              <SelectItem value="justdial">JustDial</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" onClick={() => { setOffset(0); load(0); }}>Apply</Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <div>
            <Label className="text-[10px]">Scraped from</Label>
            <Input type="date" className="h-8 text-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px]">Scraped to</Label>
            <Input type="date" className="h-8 text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
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

      {editing && <EditDialog lead={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} updateFn={updateFn} />}
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
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
          {(Object.keys(form) as (keyof typeof form)[]).map((k) => (
            <div key={k} className={k === "address" || k === "notes" ? "col-span-2" : ""}>
              <Label className="text-xs capitalize">{k.replace("_", " ")}</Label>
              <Input className="h-8 text-xs" value={form[k]} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
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
