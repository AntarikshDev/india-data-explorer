import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { getQueue, logCallAttempt, type CallOutcome } from "@/server/queue.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      { name: "description", content: "Dial high-score leads, log outcomes, move to the next call." },
    ],
  }),
});

interface OutcomeAction {
  key: CallOutcome;
  label: string;
  hotkey: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ComponentType<{ className?: string }>;
  needsFollowUp?: boolean;
}

const OUTCOMES: OutcomeAction[] = [
  { key: "connected", label: "Connected", hotkey: "c", variant: "default", icon: CheckCircle2 },
  { key: "voicemail", label: "Voicemail", hotkey: "v", variant: "secondary", icon: PhoneOff },
  { key: "not_interested", label: "Not interested", hotkey: "r", variant: "destructive", icon: XCircle },
  { key: "follow_up", label: "Follow-up", hotkey: "f", variant: "outline", icon: Clock, needsFollowUp: true },
  { key: "wrong_number", label: "Wrong number", hotkey: "w", variant: "destructive", icon: AlertTriangle },
  { key: "skip", label: "Skip", hotkey: "s", variant: "outline", icon: ChevronRight },
];

function QueuePage() {
  const getQueueFn = useServerFn(getQueue);
  const logFn = useServerFn(logCallAttempt);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const current = leads[idx];

  async function refresh() {
    setLoading(true);
    const res = await getQueueFn({ data: { limit: 25 } });
    setLeads((res.leads ?? []) as unknown as Lead[]);
    setIdx(0);
    setNotes("");
    setFollowUpDate("");
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOutcome(outcome: CallOutcome) {
    if (!current || logging) return;
    if (outcome === "follow_up" && !followUpDate) {
      toast.error("Pick a follow-up date first");
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
    // Advance
    setNotes("");
    setFollowUpDate("");
    if (idx + 1 >= leads.length) {
      await refresh();
    } else {
      setIdx(idx + 1);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const match = OUTCOMES.find((o) => o.hotkey === e.key.toLowerCase());
      if (match) {
        e.preventDefault();
        handleOutcome(match.key);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (idx + 1 < leads.length) setIdx(idx + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, leads, idx, notes, followUpDate, logging]);

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
      <div className="max-w-xl mx-auto text-center py-24 space-y-4">
        <h1 className="text-2xl font-bold">Queue is clear 🎉</h1>
        <p className="text-muted-foreground">
          You've worked through every un-contacted lead. Run a new scrape or come back tomorrow.
        </p>
        <Button onClick={refresh} variant="outline">
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Call Queue</h1>
          <p className="text-sm text-muted-foreground">
            {remaining} lead{remaining === 1 ? "" : "s"} in this batch · sorted by score
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {idx + 1} / {leads.length}
        </Badge>
      </div>

      <Card className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{current.name ?? "Unnamed lead"}</h2>
              <Badge>{current.score}</Badge>
            </div>
            {current.category && (
              <p className="text-sm text-muted-foreground">{current.category}</p>
            )}
          </div>
          <Badge variant="outline">{SOURCE_LABELS[current.source]}</Badge>
        </div>

        {/* Contact actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {current.phone && (
            <Button asChild size="lg" className="h-14">
              <a href={`tel:+91${current.phone}`}>
                <Phone className="mr-2 h-5 w-5" />
                <span className="font-mono text-lg">{current.phone}</span>
              </a>
            </Button>
          )}
          {current.phone && (
            <Button asChild size="lg" variant="secondary" className="h-14">
              <a href={`https://wa.me/91${current.phone}`} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" /> WhatsApp
              </a>
            </Button>
          )}
          {current.website && (
            <Button asChild size="lg" variant="outline" className="h-14">
              <a href={current.website} target="_blank" rel="noreferrer">
                <Globe className="mr-2 h-5 w-5" /> Website
              </a>
            </Button>
          )}
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {current.address && (
            <div className="col-span-2 sm:col-span-3 flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{current.address}</span>
            </div>
          )}
          {typeof current.rating === "number" && (
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
              <span className="font-medium">{current.rating}</span>
              {current.reviews_count != null && (
                <span className="text-muted-foreground">({current.reviews_count})</span>
              )}
            </div>
          )}
        </div>

        {current.listing_url && (
          <a
            href={current.listing_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View source listing <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Quick notes from the call…"
            rows={3}
          />
        </div>

        {/* Follow-up date */}
        <div className="space-y-2">
          <Label htmlFor="followup">Follow-up date (for follow-up outcome)</Label>
          <Input
            id="followup"
            type="datetime-local"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </Card>

      {/* Outcome buttons */}
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {OUTCOMES.map((o) => {
            const Icon = o.icon;
            return (
              <Button
                key={o.key}
                variant={o.variant}
                onClick={() => handleOutcome(o.key)}
                disabled={logging}
                className="h-auto py-3 flex-col gap-1"
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{o.label}</span>
                <kbd className="text-[10px] opacity-60 font-mono">{o.hotkey.toUpperCase()}</kbd>
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Tip: press the highlighted keys to log fast · <kbd className="font-mono">N</kbd> to skip ahead without logging
        </p>
      </Card>
    </div>
  );
}
