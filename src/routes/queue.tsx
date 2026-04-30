import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import {
  getQueue,
  logCallAttempt,
  getTodayCallLog,
  updateCallNotes,
  type CallOutcome,
} from "@/server/queue.functions";
import { listLeadSets } from "@/server/leadsets.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { SOURCE_LABELS, type Lead } from "@/lib/leadTypes";
import { toast } from "sonner";
import {
  Phone,
  MessageCircle,
  Globe,
  MapPin,
  Star,
  ExternalLink,
  Loader2,
  CheckCircle2,
  PhoneOff,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Play,
  Pause,
  Filter,
  HelpCircle,
  ListChecks,
  Pencil,
  Save,
} from "lucide-react";

export const Route = createFileRoute("/queue")({
  component: () => (
    <AppShell>
      <QueuePage />
    </AppShell>
  ),
  head: () => ({
    meta: [
      { title: "Call Queue — EdSetu Lead Scraper" },
      { name: "description", content: "Auto-dial high-score leads, log outcomes fast." },
    ],
  }),
});

interface OutcomeAction {
  key: CallOutcome;
  label: string;
  hotkey: string;
  tone: "ok" | "warn" | "bad" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  needsFollowUp?: boolean;
}

const OUTCOMES: OutcomeAction[] = [
  { key: "connected", label: "Connected", hotkey: "c", tone: "ok", icon: CheckCircle2 },
  { key: "voicemail", label: "Voicemail", hotkey: "v", tone: "neutral", icon: PhoneOff },
  { key: "not_interested", label: "Not interested", hotkey: "r", tone: "bad", icon: XCircle },
  { key: "follow_up", label: "Follow-up", hotkey: "f", tone: "warn", icon: Clock, needsFollowUp: true },
  { key: "wrong_number", label: "Wrong #", hotkey: "w", tone: "bad", icon: AlertTriangle },
  { key: "skip", label: "Skip", hotkey: "s", tone: "neutral", icon: ChevronRight },
];

const toneClass: Record<OutcomeAction["tone"], string> = {
  ok: "bg-black text-white hover:bg-black/85 border-black",
  bad: "bg-red-600 text-white hover:bg-red-600/90 border-red-600",
  warn: "bg-white text-black border-black hover:bg-neutral-100",
  neutral: "bg-white text-black border-neutral-300 hover:bg-neutral-100",
};

interface GeoState { code: string; name: string }
interface GeoDistrict { id: string; state_code: string; name: string }
interface GeoLocality { id: string; district_id: string; name: string }
interface LeadSet {
  id: string;
  name: string;
  state_code: string | null;
  district_id: string | null;
  locality_id: string | null;
  ready_count: number;
}

function QueuePage() {
  const getQueueFn = useServerFn(getQueue);
  const logFn = useServerFn(logCallAttempt);
  const todayFn = useServerFn(getTodayCallLog);
  const updateNotesFn = useServerFn(updateCallNotes);
  const listSetsFn = useServerFn(listLeadSets);

  // Filters
  const [stateCode, setStateCode] = useState<string>("");
  const [districtId, setDistrictId] = useState<string>("");
  const [localityId, setLocalityId] = useState<string>("");
  const [setId, setSetId] = useState<string>("");
  const [states, setStates] = useState<GeoState[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [localities, setLocalities] = useState<GeoLocality[]>([]);
  const [sets, setSets] = useState<LeadSet[]>([]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);

  // Auto-dial
  const [autoMode, setAutoMode] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  // Call timer
  const [callStart, setCallStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const dialedRef = useRef<string | null>(null);

  // Today log + help
  const [showHelp, setShowHelp] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Load states + sets
  useEffect(() => {
    supabase
      .from("geo_states")
      .select("*")
      .order("name")
      .then(({ data }) => setStates((data ?? []) as GeoState[]));
    listSetsFn().then((r) => setSets((r.sets ?? []) as LeadSet[]));
  }, [listSetsFn]);

  // Cascade
  useEffect(() => {
    if (!stateCode) {
      setDistricts([]);
      return;
    }
    supabase
      .from("geo_districts")
      .select("*")
      .eq("state_code", stateCode)
      .order("name")
      .then(({ data }) => setDistricts((data ?? []) as GeoDistrict[]));
  }, [stateCode]);
  useEffect(() => {
    if (!districtId) {
      setLocalities([]);
      return;
    }
    supabase
      .from("geo_localities")
      .select("*")
      .eq("district_id", districtId)
      .order("name")
      .then(({ data }) => setLocalities((data ?? []) as GeoLocality[]));
  }, [districtId]);

  async function refresh() {
    setLoading(true);
    const res = await getQueueFn({
      data: {
        stateCode: stateCode || null,
        districtId: districtId || null,
        localityId: localityId || null,
        setId: setId || null,
        limit: 50,
      },
    });
    setLeads((res.leads ?? []) as unknown as Lead[]);
    setIdx(0);
    resetForm();
    setLoading(false);
  }

  function resetForm() {
    setNotes("");
    setFollowUpDate("");
    setCallStart(null);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = leads[idx];

  // Tick once per second while a call is in progress
  useEffect(() => {
    if (!callStart) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [callStart]);

  // Auto-dial trigger
  useEffect(() => {
    if (!autoMode || !current?.phone) return;
    if (dialedRef.current === current.id) return;
    dialedRef.current = current.id;
    setCallStart(Date.now());
    window.location.href = `tel:+91${current.phone}`;
    // Notes opens when user returns (visibility) — see below
  }, [autoMode, current]);

  // iOS visibility: when user returns to the tab (call ended on iPhone),
  // open notes modal automatically.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== "visible") return;
      if (!callStart) return;
      // small debounce so the tab fully settles
      setTimeout(() => setNotesOpen(true), 250);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [callStart]);

  // Auto-advance safety: if a "call" is open >5min without notes, surface modal
  useEffect(() => {
    if (!callStart) return;
    const t = setTimeout(() => setNotesOpen(true), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [callStart]);

  function manualDial() {
    if (!current?.phone) return;
    setCallStart(Date.now());
    window.location.href = `tel:+91${current.phone}`;
  }

  async function submitOutcome(outcome: CallOutcome) {
    if (!current || logging) return;
    if (outcome === "follow_up" && !followUpDate) {
      toast.error("Pick a follow-up date");
      return;
    }
    setLogging(true);
    const durationSec = callStart ? Math.floor((Date.now() - callStart) / 1000) : 0;
    const res = await logFn({
      data: {
        leadId: current.id,
        outcome,
        notes: notes.trim() || null,
        nextActionAt:
          outcome === "follow_up" && followUpDate
            ? new Date(followUpDate).toISOString()
            : null,
        durationSec,
      },
    });
    setLogging(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not log");
      return;
    }
    toast.success(`Logged: ${outcome.replace("_", " ")}`);
    setNotesOpen(false);
    resetForm();
    if (idx + 1 >= leads.length) await refresh();
    else setIdx(idx + 1);
  }

  function handleOutcomeClick(outcome: CallOutcome) {
    if (outcome === "follow_up" && !followUpDate) {
      setNotesOpen(true);
      return;
    }
    submitOutcome(outcome);
  }

  // Hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const match = OUTCOMES.find((o) => o.hotkey === e.key.toLowerCase());
      if (match) {
        e.preventDefault();
        handleOutcomeClick(match.key);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (idx + 1 < leads.length) setIdx(idx + 1);
      } else if (e.key === " ") {
        e.preventDefault();
        setAutoMode((v) => !v);
      } else if (e.key === "?") {
        setShowHelp((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, leads, idx, notes, followUpDate, logging, autoMode]);

  const remaining = useMemo(() => Math.max(0, leads.length - idx), [leads, idx]);
  const elapsed = callStart ? Math.floor((now - callStart) / 1000) : 0;
  const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="max-w-2xl mx-auto px-3 py-3 space-y-3 overflow-x-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold leading-tight">Call Queue</h1>
          <p className="text-xs text-muted-foreground">
            {remaining} ready · oldest scraped first
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setShowLog((v) => !v)} aria-label="Today log">
            <ListChecks className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setShowHelp((v) => !v)} aria-label="Shortcuts">
            <HelpCircle className="h-4 w-4" />
          </Button>
          {leads.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {idx + 1}/{leads.length}
            </Badge>
          )}
        </div>
      </div>

      {/* Filters / Set selector */}
      <Card className="p-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5 px-1">
          <Filter className="h-3 w-3" /> Filter
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <Select
            value={setId || "__none__"}
            onValueChange={(v) => {
              setSetId(v === "__none__" ? "" : v);
              if (v !== "__none__") {
                // a set defines its own filters; clear manual
                setStateCode("");
                setDistrictId("");
                setLocalityId("");
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Saved set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— No set —</SelectItem>
              {sets.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {s.ready_count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={stateCode || "__any__"}
            onValueChange={(v) => {
              setStateCode(v === "__any__" ? "" : v);
              setDistrictId("");
              setLocalityId("");
              setSetId("");
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All states</SelectItem>
              {states.map((s) => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={districtId || "__any__"}
            onValueChange={(v) => {
              setDistrictId(v === "__any__" ? "" : v);
              setLocalityId("");
              setSetId("");
            }}
            disabled={!stateCode}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="District" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All districts</SelectItem>
              {districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select
            value={localityId || "__any__"}
            onValueChange={(v) => {
              setLocalityId(v === "__any__" ? "" : v);
              setSetId("");
            }}
            disabled={!districtId}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Locality" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">All localities</SelectItem>
              {localities.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end mt-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={refresh}>
            Apply
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !current ? (
        <Card className="p-8 text-center space-y-2">
          <h2 className="font-bold">Queue is clear 🎉</h2>
          <p className="text-xs text-muted-foreground">
            No un-contacted leads matching this filter.
          </p>
          <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
        </Card>
      ) : (
        <>
          {/* Lead card */}
          <Card className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold truncate">
                    {current.name ?? "Unnamed lead"}
                  </h2>
                  <Badge className="h-5 px-1.5 text-[10px]">{current.score}</Badge>
                  {callStart && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono border-red-500 text-red-600">
                      ● {elapsedStr}
                    </Badge>
                  )}
                </div>
                {current.category && (
                  <p className="text-xs text-muted-foreground truncate">
                    {current.category}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {SOURCE_LABELS[current.source]}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setAutoMode((v) => !v)}
                size="icon"
                className={
                  autoMode
                    ? "h-12 w-12 rounded-full bg-red-600 hover:bg-red-600/90"
                    : "h-12 w-12 rounded-full bg-black hover:bg-black/85"
                }
                aria-label={autoMode ? "Pause auto-dial" : "Start auto-dial"}
              >
                {autoMode ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              {current.phone ? (
                <Button
                  onClick={manualDial}
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 rounded-full"
                  aria-label="Call"
                  title={`Call +91 ${current.phone}`}
                >
                  <Phone className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="icon" variant="outline" disabled className="h-10 w-10 rounded-full" title="No phone">
                  <Phone className="h-4 w-4" />
                </Button>
              )}
              {current.phone && (
                <Button asChild size="icon" variant="outline" className="h-10 w-10 rounded-full" aria-label="WhatsApp" title="Open WhatsApp">
                  <a href={`https://wa.me/91${current.phone}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {current.website && (
                <Button asChild size="icon" variant="outline" className="h-10 w-10 rounded-full" aria-label="Website" title={current.website}>
                  <a href={current.website} target="_blank" rel="noreferrer">
                    <Globe className="h-4 w-4" />
                  </a>
                </Button>
              )}
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {current.phone ? `••• ••• ${current.phone.slice(-4)}` : "no phone"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {(current.district_name || current.city) && (
                <span className="flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[260px]">
                    {[current.locality_name, current.district_name ?? current.city, current.state_code]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              )}
              {typeof current.rating === "number" && (
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  <span className="text-foreground font-medium">{current.rating}</span>
                  {current.reviews_count != null && <span>({current.reviews_count})</span>}
                </span>
              )}
              {current.listing_url && (
                <a
                  href={current.listing_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  source <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </Card>

          {/* Outcome buttons */}
          <Card className="p-2">
            <div className="grid grid-cols-3 gap-1.5">
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.key}
                    onClick={() => handleOutcomeClick(o.key)}
                    disabled={logging}
                    className={`flex items-center justify-center gap-1 rounded-md border h-9 text-xs font-medium transition disabled:opacity-50 touch-manipulation ${toneClass[o.tone]}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{o.label}</span>
                    <kbd className="hidden sm:inline text-[9px] opacity-60 font-mono">
                      {o.hotkey.toUpperCase()}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* Today log slide-down */}
      {showLog && (
        <TodayLog
          getTodayCallLog={todayFn}
          updateCallNotes={updateNotesFn}
          onClose={() => setShowLog(false)}
        />
      )}

      {/* Help dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Shortcuts</DialogTitle>
          </DialogHeader>
          <ul className="text-sm space-y-1.5">
            <li><kbd className="px-1 border rounded text-[10px]">Space</kbd> Play / pause auto-dial</li>
            <li><kbd className="px-1 border rounded text-[10px]">N</kbd> Next without logging</li>
            {OUTCOMES.map((o) => (
              <li key={o.key}>
                <kbd className="px-1 border rounded text-[10px]">{o.hotkey.toUpperCase()}</kbd> {o.label}
              </li>
            ))}
            <li><kbd className="px-1 border rounded text-[10px]">?</kbd> Toggle this help</li>
          </ul>
        </DialogContent>
      </Dialog>

      {/* Notes modal */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Log this call {callStart && <span className="text-xs font-mono text-red-600 ml-2">{elapsedStr}</span>}
            </DialogTitle>
            <DialogDescription className="truncate">
              {current?.name ?? "Lead"} · {current?.phone ? `••• ${current.phone.slice(-4)}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What happened on the call?"
                rows={3}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followup" className="text-xs">
                Follow-up date (only for follow-up outcome)
              </Label>
              <Input
                id="followup"
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.key}
                    onClick={() => submitOutcome(o.key)}
                    disabled={logging}
                    className={`flex items-center justify-center gap-1 rounded-md border h-9 text-xs font-medium transition disabled:opacity-50 ${toneClass[o.tone]}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNotesOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            {logging && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AttemptRow {
  id: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  lead?: { name: string | null; phone: string | null } | null;
}

function TodayLog({
  getTodayCallLog,
  updateCallNotes,
  onClose,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTodayCallLog: (args?: any) => Promise<{ rows: AttemptRow[]; error: string | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateCallNotes: (args?: any) => Promise<{ ok: boolean; error: string | null }>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function load() {
    const r = await getTodayCallLog({ data: { limit: 50 } });
    setRows((r.rows ?? []) as AttemptRow[]);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Today's calls ({rows.length})</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="max-h-72 overflow-y-auto space-y-1.5">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">No calls yet today.</p>}
        {rows.map((a) => (
          <div key={a.id} className="border rounded-md p-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{a.lead?.name ?? "—"}</span>
              <Badge variant="outline" className="text-[10px]">{a.outcome.replace("_", " ")}</Badge>
            </div>
            <div className="text-muted-foreground text-[10px]">
              {new Date(a.created_at).toLocaleTimeString()} · ••• {a.lead?.phone?.slice(-4) ?? ""}
            </div>
            {editing === a.id ? (
              <div className="flex gap-1.5">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-7 text-xs"
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={async () => {
                    await updateCallNotes({ data: { attemptId: a.id, notes: draft } });
                    setEditing(null);
                    load();
                    toast.success("Note updated");
                  }}
                >
                  <Save className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-1.5">
                <p className="flex-1 text-foreground whitespace-pre-wrap break-words">
                  {a.notes ?? <span className="text-muted-foreground italic">No notes</span>}
                </p>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditing(a.id);
                    setDraft(a.notes ?? "");
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
