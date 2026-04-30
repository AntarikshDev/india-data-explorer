
# Final Development Plan — EdSetu Lead Engine

Combines the **v2 sales-pipeline plan** (scraper hardening → call queue → CRM sync) with the **geo-aware auto-run agent** (Noida → UP → next state) into one phased build.

End state: every morning the system has a fresh, scored, deduped queue of UP coaching-class leads ready to dial, the CRM is in sync, and when UP saturates, you click one button to expand to the next state.

---

## Phase 1 — Scraper hardening (foundation)

Make the data we already pull trustworthy before we build anything on top of it.

- **Phone reveal action** — Firecrawl `actions: [{type:'click', selector:'Show Number'}]` on JustDial; raises phone coverage from ~60% → ~95%.
- **Pagination** — multi-page fetch (page 1–N) per source, capped by `results_per_source`.
- **Schema split** — distinguish `business_website` from `listing_url` (JustDial profile).
- **City strict-mode** — prompt enforces locality match; rejects out-of-area results.
- **Per-run cost preview** — show estimated Firecrawl credits before the user confirms.
- **Better error surfacing** — partial success per source, not all-or-nothing.

Ship: existing `/` search page + `/results/$runId` work better. No new pages.

---

## Phase 2 — Geo dataset (Pan-India locations)

Ship the location backbone the agent needs.

- New tables: `geo_states` (36), `geo_districts` (~780, with `hq_lat`/`hq_lng`), `geo_localities` (sectors/areas, seeded with Noida + top UP cities ~50 entries; grows over time).
- Migration loads from a bundled `src/data/india-geo.json` (~80 KB).
- **Not** copying LNJ SDMS villages — wrong grain for B2B scraping (businesses don't list at panchayat level) and would bloat DB by 600k rows for no benefit. Keep district + locality.
- Cascading dropdowns component (state → district → locality) reusable across forms.

Ship: dropdowns work; no user-visible feature yet.

---

## Phase 3 — Enrichment & lead scoring

Turn raw rows into "warm enough to call".

- **Enrichment**: when website exists, scrape it for email + WhatsApp + owner name (one extra Firecrawl call per lead, gated by setting).
- **Scoring** — 0–100 based on: has phone (+30), has email (+15), rating ≥ 4 (+15), reviews ≥ 20 (+10), recent activity (+10), website live (+10), category match (+10).
- New columns on `leads`: `email_enriched`, `whatsapp`, `owner_name`, `score`, `score_reasons jsonb`.
- Sort/filter by score on results page; default sort = score DESC.

Ship: results table now ranks high-value leads first.

---

## Phase 4 — Call Queue (the dialer screen)

The screen you actually live in.

- New route `/queue` — one lead at a time, full-screen card: name, phone (click-to-call `tel:`), WhatsApp button, score, address, map preview, category, rating, source link.
- Keyboard shortcuts: `c` connected, `v` voicemail, `r` not interested, `f` follow-up + date, `s` skip, `n` next.
- Notes textarea autosaves per lead.
- Outcomes write to new `call_attempts` table (lead_id, outcome, notes, next_action_at, created_at).
- Queue is built from highest-score un-contacted leads in your active campaign; respects per-day call cap.

Ship: open `/queue`, dial, log outcome, next. The product is now *useful for sales* end-to-end.

---

## Phase 5 — Campaigns & the geo planner

Saved searches with auto-routing.

- New tables: `campaigns`, `campaign_targets`, `campaign_state_progress` (full schema in earlier plan).
- New routes:
  - `/campaigns` — list with coverage bars per state.
  - `/campaigns/new` — wizard: name, query template, sources, **start anchor** (Noida → Gautam Buddha Nagar → UP), thresholds (coverage %, per-district cap, exhaustion streak), schedule.
  - `/campaigns/$id` — planned route table (past + upcoming targets), drag-reorder, skip, "Run agent now" button.
- `nextTarget()` planner (server fn): locality → next nearest locality → next nearest district by Haversine from current district HQ → state coverage check.
- "Done" district = N consecutive runs <5 new leads OR cap hit.

Ship: click "Run now" and the agent walks Noida → Greater Noida → Ghaziabad → Hapur → Meerut → … logging each run.

---

## Phase 6 — Daily cron + state-expansion approval

Hands-free mode.

- `pg_cron` job → `POST /api/public/hooks/run-daily-agent` at 06:00 IST, secured with `AGENT_CRON_SECRET`.
- Per-campaign daily cap (e.g., 5 targets/day) honouring global Firecrawl credit cap.
- When state coverage ≥ threshold (default 80%): campaign goes to `awaiting_next_state`, suggestions = top 3 nearest unscraped states by border distance (Bihar / Delhi / Uttarakhand for UP).
- Dashboard banner: *"UP is 82% covered (62/75 districts). Continue with: **Bihar** · **Delhi NCR** · **Uttarakhand**"* → one click resumes.
- New `notifications` table for the approval prompt + future alerts.

Ship: set it once, leads arrive every morning.

---

## Phase 7 — CRM sync (push + pull-back)

Close the loop with EdSetu Command.

- **Push**: existing one-shot push extended to auto-push high-score leads (≥ threshold) on insert.
- **Pull-back**: nightly job pulls status updates from EdSetu Command (`contacted`, `meeting_set`, `won`, `lost`) and writes to `lead_crm_status` so the queue can hide already-handled leads.
- Conflict rule: CRM is source of truth for outcomes; scraper is source of truth for contact data.

Ship: leads you push become trackable; queue auto-hides what sales has already worked.

---

## Phase 8 — Insights dashboard

Optimise what to scrape next.

- New route `/insights`: leads/day, conversion by source, conversion by district, avg score per category, credit spend vs leads-touched.
- "Best ROI districts" widget → suggests where to deepen vs move on.

Ship: data-driven decisions on where the agent should focus.

---

## Cross-cutting

- **Auth**: single user, Supabase email/password (already done).
- **RLS**: every new table scoped by `user_id`.
- **Realtime**: subscriptions on `leads`, `campaign_targets`, `notifications`.
- **Secrets to add**: `AGENT_CRON_SECRET` (Phase 6), `EDSETU_CRM_TOKEN` (Phase 7, if not already in `crm_settings`).

## What we're NOT building (stay focused)

- Village/panchayat-grain scraping (wrong grain for B2B; LNJ uses it for ground mobilisers, different problem).
- WhatsApp/email outreach from inside the app (use existing tools; we just expose the buttons).
- Multi-user / team roles (single-user for now).
- Map UI for route plan (table is enough for v1).
- Google Places API fallback (only if Firecrawl on Maps proves too flaky in Phase 1 testing).

## Suggested ship cadence

| Pass | Phases | Outcome |
|------|--------|---------|
| 1 | 1 + 2 + 3 | Better data, ranked, with location backbone ready. |
| 2 | 4 + 5 | Dialer screen + manual-trigger geo agent. **Product is sales-usable.** |
| 3 | 6 + 7 | Hands-free daily runs + CRM round-trip. |
| 4 | 8 | Insights polish. |

---

Approve and I'll start **Pass 1 (Phases 1–3)**: scraper hardening, geo dataset migration, and lead scoring.
