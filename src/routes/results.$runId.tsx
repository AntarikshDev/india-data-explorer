import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { exportRunToExcel } from "@/server/export.functions";
import { pushLeadsToCrm } from "@/server/crm.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SOURCE_LABELS, type Lead, type ScrapeRun, type Source } from "@/lib/leadTypes";
import { toast } from "sonner";
import { Download, Send, Trash2, ExternalLink, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/results/$runId")({
  component: () => (
    <AppShell>
      <ResultsPage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Results — EdSetu Lead Scraper" },
      { name: "description", content: "Scraped leads with export and CRM push." },
    ],
  }),
});

function ResultsPage() {
  const { runId } = Route.useParams();
  const [run, setRun] = useState<ScrapeRun | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const exportFn = useServerFn(exportRunToExcel);
  const pushFn = useServerFn(pushLeadsToCrm);

  async function load() {
    const [{ data: r }, { data: l }] = await Promise.all([
      supabase.from("scrape_runs").select("*").eq("id", runId).maybeSingle(),
      supabase.from("leads").select("*").eq("run_id", runId).order("score", { ascending: false }).order("scraped_at", { ascending: true }),
    ]);
    setRun((r as ScrapeRun | null) ?? null);
    setLeads((l ?? []) as Lead[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`leads-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `run_id=eq.${runId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const filtered = leads.filter((l) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return [l.name, l.phone, l.address, l.category, l.city].some((v) => (v ?? "").toLowerCase().includes(f));
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  }

  async function exportXlsx() {
    setBusy(true);
    try {
      const { filename, base64 } = await exportFn({ data: { runId } });
      const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function pushSelected() {
    if (selected.size === 0) return toast.error("Select leads to push");
    setBusy(true);
    try {
      const res = await pushFn({ data: { leadIds: Array.from(selected) } });
      if (res.ok) toast.success(`Pushed ${res.pushed} leads to CRM`);
      else toast.error(res.error ?? "CRM push failed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} leads?`)) return;
    const { error } = await supabase.from("leads").delete().in("id", Array.from(selected));
    if (error) toast.error(error.message);
    else {
      setSelected(new Set());
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link to="/history" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> All runs
          </Link>
          <h1 className="text-2xl font-bold">{run?.query ?? "Run"}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            {run?.sources?.map((s) => <Badge key={s} variant="secondary">{SOURCE_LABELS[s as Source]}</Badge>)}
            <Badge variant="outline">{leads.length} leads</Badge>
            {run?.status && <Badge variant={run.status === "done" ? "default" : "outline"}>{run.status}</Badge>}
          </div>
          {run?.error && <p className="text-xs text-destructive mt-2">{run.error}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportXlsx} disabled={busy || leads.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Excel
          </Button>
          <Button onClick={pushSelected} disabled={busy || selected.size === 0}>
            <Send className="h-4 w-4 mr-2" /> Push {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Input placeholder="Filter by name, phone, address…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={deleteSelected}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete {selected.size}
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} shown</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 w-10">
                  <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                </th>
                <th className="p-2">Name</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Address</th>
                <th className="p-2">Category</th>
                <th className="p-2">Rating</th>
                <th className="p-2">Source</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t hover:bg-accent/30">
                  <td className="p-2">
                    <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                  </td>
                  <td className="p-2 font-medium">
                    {l.name ?? "—"}
                    {l.pushed_to_crm_at && <Badge variant="secondary" className="ml-2 text-xs">CRM</Badge>}
                  </td>
                  <td className="p-2 tabular-nums">{l.phone ?? "—"}</td>
                  <td className="p-2 max-w-xs truncate" title={l.address ?? ""}>{l.address ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{l.category ?? "—"}</td>
                  <td className="p-2 tabular-nums">{l.rating ?? "—"}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{SOURCE_LABELS[l.source]}</Badge></td>
                  <td className="p-2">
                    {l.website && (
                      <a href={l.website} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">No leads.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
