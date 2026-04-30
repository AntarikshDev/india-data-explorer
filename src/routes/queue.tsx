import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getQueue, logCallAttempt, type CallOutcome } from "@/server/queue.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

function QueuePage() {
  const getQueueFn = useServerFn(getQueue);
  const logFn = useServerFn(logCallAttempt);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);

  // Auto-dial flow
  const [autoMode, setAutoMode] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [pendingOutcome, setPendingOutcome] = useState<CallOutcome | null>(null);

  const current = leads[idx];
  const dialedRef = useRef<string | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await getQueueFn({ data: { limit: 25 } });
    setLeads((res.leads ?? []) as unknown as Lead[]);
    setIdx(0);
    resetForm();
    setLoading(false);
  }

  function resetForm() {
    setNotes("");
    setFollowUpDate("");
    setPendingOutcome(null);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dial: when autoMode flips on or current lead changes (and we're in auto mode),
  // trigger the tel: link and open the notes modal.
  useEffect(() => {
    if (!autoMode || !current?.phone) return;
    if (dialedRef.current === current.id) return;
    dialedRef.current = current.id;

    // Trigger native call
    window.location.href = `tel:+91${current.phone}`;

    // Open notes modal so user can log outcome when call ends
    const t = setTimeout(() => setNotesOpen(true), 800);
    return () => clearTimeout(t);
  }, [autoMode, current]);

  async function submitOutcome(outcome: CallOutcome) {
    if (!current || logging) return;
    if (outcome === "follow_up" && !followUpDate) {
      toast.error("Pick a follow-up date");
      return;
    }
    setLogging(true);
    const res = await logFn({
      data: {
        leadId: current.id,
        outcome,
        notes: notes.trim() || null,
        nextActionAt:
          outcome === "follow_up" && followUpDate
            ? new Date(followUpDate).toISOString()
            : null,
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

    if (idx + 1 >= leads.length) {
      await refresh();
    } else {
      setIdx(idx + 1);
    }
    // dialedRef will not match next lead → auto effect dials again if autoMode is on
  }

  // Direct outcome (used when not in auto mode, or from the modal buttons)
  function handleOutcomeClick(outcome: CallOutcome) {
    if (outcome === "follow_up" && !followUpDate) {
      setPendingOutcome("follow_up");
      setNotesOpen(true);
      return;
    }
    submitOutcome(outcome);
  }

  // Keyboard shortcuts (disabled when typing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, leads, idx, notes, followUpDate, logging, autoMode]);

  const remaining = useMemo(() => Math.max(0, leads.length - idx), [leads, idx]);

  if (loading) {
    return (
      <div className="grid place-items-center py-32 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="max-w-xl mx-auto text-center py-24 space-y-4 px-4">
        <h1 className="text-2xl font-bold">Queue is clear 🎉</h1>
        <p className="text-muted-foreground">
          You've worked through every un-contacted lead.
        </p>
        <Button onClick={refresh} variant="outline">
          Refresh
        </Button>
      </div>
    );
  }

  const maskedPhone = current.phone
    ? `••• ••• ${current.phone.slice(-4)}`
    : "";

  return (
    <div className="max-w-2xl mx-auto px-3 py-3 space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold leading-tight">Call Queue</h1>
          <p className="text-xs text-muted-foreground">
            {remaining} left · sorted by score
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {idx + 1} / {leads.length}
        </Badge>
      </div>

      {/* Lead card — compact */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold truncate">
                {current.name ?? "Unnamed lead"}
              </h2>
              <Badge className="h-5 px-1.5 text-[10px]">{current.score}</Badge>
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

        {/* Compact action row */}
        <div className="flex items-center gap-2">
          {/* Play/Pause auto-dial */}
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

          {/* Manual call */}
          {current.phone && (
            <Button asChild size="icon" variant="outline" className="h-10 w-10 rounded-full" aria-label="Call">
              <a href={`tel:+91${current.phone}`}>
                <Phone className="h-4 w-4" />
              </a>
            </Button>
          )}
          {current.phone && (
            <Button asChild size="icon" variant="outline" className="h-10 w-10 rounded-full" aria-label="WhatsApp">
              <a href={`https://wa.me/91${current.phone}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
          )}
          {current.website && (
            <Button asChild size="icon" variant="outline" className="h-10 w-10 rounded-full" aria-label="Website">
              <a href={current.website} target="_blank" rel="noreferrer">
                <Globe className="h-4 w-4" />
              </a>
            </Button>
          )}

          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {maskedPhone}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {current.address && (
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[220px]">{current.address}</span>
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

      {/* Outcome buttons — small, red/white/black, no scroll */}
      <Card className="p-2">
        <div className="grid grid-cols-3 gap-1.5">
          {OUTCOMES.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.key}
                onClick={() => handleOutcomeClick(o.key)}
                disabled={logging}
                className={`flex items-center justify-center gap-1 rounded-md border h-9 text-xs font-medium transition disabled:opacity-50 ${toneClass[o.tone]}`}
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
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Space = play/pause · N = next without logging
        </p>
      </Card>

      {/* Notes modal — opens after auto-dial or on follow-up */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log this call</DialogTitle>
            <DialogDescription className="truncate">
              {current.name ?? "Lead"} · {maskedPhone}
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
