# VantageTime

A script-to-schedule-to-call-sheet AI tool for indie filmmakers, YouTubers, and film students — the radically cheaper, mobile-first alternative to StudioBinder/Filmustage/Yamdu/Celtx ($30-100+/month). Built for Google's **All Things Agentic Hackathon** (submitted in the **Taskmaster** category).

Upload a script. VantageTime breaks it into scenes, builds a shoot schedule, validates it against real-world constraints, researches your filming locations, generates a call sheet, drafts cast/crew outreach, collects real availability through actor-facing links, tracks who's actually locked in, and now also handles a drag-and-drop stripboard, a Day-Out-of-Days report, and payroll/time cards — all through a coordinated team of agents and deterministic tools, not a single prompt.

**New here?** Start with [`docs/DEVELOPER_OVERVIEW.md`](docs/DEVELOPER_OVERVIEW.md) — vision, full tech stack, architecture, data model, and a tab-by-tab tour. The system architecture diagram referenced there is [`docs/architecture-diagram.svg`](docs/architecture-diagram.svg).

## Why agentic

Every stage is a real agent doing real work, not a form wizard with an LLM bolted on. The pipeline (`backend/common/agents.py`, an ADK `SequentialAgent` called `production_pipeline`) runs on **Gemini 3.5 Flash**:

1. **Script Breakdown Agent** — reads the script PDF natively (no OCR step) and extracts scenes, cast, props, and locations into structured data. Every later stage builds on this rather than re-reading the script.
2. **Location Research Agents** — a `ParallelAgent` fan-out (up to 5 concurrent slots), one instance per distinct script location, each firing a live [Parallel](https://parallel.ai) web search for permit requirements, weather norms, and shooting logistics. Runs before scheduling so the Scheduling Agent has real seasonal context when it later assigns dates.
3. **Scheduling Agent** — proposes a shoot order and groups scenes by location, then hands its grouping to a **deterministic Python validator** (`validate_schedule`) that checks for cast double-bookings, day-length overloads, and multi-location days — real arithmetic, not LLM estimation. Given a real shoot window, it also calls `assign_calendar_dates` (real date math) and `get_weather` (a live forecast or a genuine multi-year historical average from Open-Meteo) per day, and `estimate_cast_hours` to compute each cast member's real share of a day's pages.
4. **Call Sheet Generator** — synthesizes breakdown + validated schedule + location research into one call sheet per shoot day, flagging anything it can't fill in rather than guessing.
5. **Availability Agent** — drafts a personal outreach message per cast member with their real scheduled days, dates, and hours. Drafting only; everything after that (tokens, magic links, tracking responses) is deterministic backend code, described below.

Same principle throughout: the agent proposes, a real tool checks or computes, and the agent must report the tool's output verbatim rather than reason about feasibility, dates, or hours itself. A separate, non-sequential ADK app (`roster_extraction_agent`) handles the alternate "I already have production data" entry path (PDF/DOCX roster import).

## Beyond the pipeline: getting a shoot actually locked in

A validated schedule isn't a plan yet — cast and crew still have to confirm they can make it, and locations have to actually be free on the days you pick. The frontend adds a deterministic layer on top of the agent pipeline for that:

- **Actor/crew magic links** — a plain FastAPI router (`backend/common/availability_routes.py`), deliberately *not* part of the ADK pipeline, since an actor clicking a link days later has nothing to do with the filmmaker's chat session. Each person gets a token and a personal page (`/availability/[token]`): if a day isn't dated yet, they must submit at least 3 real candidate dates (a single date isn't a negotiation); once a day has a real date, they get an explicit "I can make it" confirm or a reject-with-alternatives flow.
- **Dates tab** (Location Research + Roster sub-tabs) — pulls every response live: per-location availability rules (days of week, a date window, preferred dates, an optional preferred time, and a priority flag), a Conflicts panel that flags cast/crew still booked on a day they've rejected or a location outside its own rules (with a one-click fix to the next date that actually works), and Alternative Date Suggestions — real overlap-counting across everyone's submitted dates, weighted priority-people first, then cast, then crew.
- **Dashboard tab** — one table for the production house: every cast/crew member's response status (locked in, awaiting final dates, pending, or unavailable), computed from the same real response data, with a printable production-wide availability report.
- **Stripboard + Day-Out-of-Days** (Dates tab) — a native drag-and-drop stripboard for manually reordering scenes with industry-standard color coding, and a printable Day-Out-of-Days report showing every cast member's real work/hold days across the whole shoot.
- **Time Cards / Payroll** — day-rate or hourly pay per person, configurable OT/2× thresholds, real midnight-crossing-aware hours computed from call/wrap/meal-break times, CSV export.
- **Autopilot** — the guided, step-by-step flow that walks a filmmaker through all of the above in order (Members → Shoot dates → Check locations → Notify location owners → Notify actors → Full plan → Tasks → Time cards), surfacing exactly what's blocking each step with an inline fix.

## Frontend

Next.js 16 / React 19 / TypeScript / Tailwind v4, warm cream-and-orange product aesthetic. Eight tabs per project, in workflow order: **Autopilot → Breakdown → Members → Dates → Call Sheet → Task Master → Time Cards → Dashboard**, plus Settings. Project state is held in one `Project` object, persisted to `localStorage` for a fast/offline copy and synced best-effort to the backend's Firestore-backed store.

## Tech stack & Google Cloud usage

- **Gemini 3.5 Flash** via the Gemini API/Vertex AI — every pipeline agent and the `/assistant` chat endpoint (`backend/common/model_config.py`).
- **Google Agent Development Kit (ADK)** — `SequentialAgent`/`ParallelAgent`/`Agent` compose the production pipeline (`backend/common/agents.py`).
- **Google Cloud infrastructure** — Firestore backs project persistence (`ProjectStore`, auto-selected whenever `GOOGLE_CLOUD_PROJECT` is set) and Cloud Storage backs large uploaded-script blobs (`BlobStore`), both with an in-memory/local fallback for offline dev. Both backend and frontend ship with Cloud Run-ready Dockerfiles.
- **Parallel Web Search API** for real location permit/logistics research; **Open-Meteo** (free, no key) for real weather; **Mailpit/SMTP** for outreach email.

## Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in PARALLEL_API_KEY; GOOGLE_CLOUD_PROJECT enables real Vertex AI + Firestore + GCS
uvicorn server:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000, expects the backend on :8000
```

Run `gcloud auth application-default login` once locally if you haven't for this machine. Without `GOOGLE_CLOUD_PROJECT` set, the backend falls back to in-memory storage automatically — no GCP project required to try it locally.

## Deploy to Cloud Run

```bash
# Backend
cd backend
gcloud run deploy vantagetime-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=True,GOOGLE_CLOUD_PROJECT=<your-project-id>,GOOGLE_CLOUD_LOCATION=us-central1,PARALLEL_API_KEY=<key> \
  --min-instances 1   # keeps in-memory magic-link/outreach state alive across requests — see note below

# Frontend (pass the backend's deployed URL in at build time)
cd ../frontend
gcloud run deploy vantagetime-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-build-env-vars NEXT_PUBLIC_API_URL=https://<vantagetime-backend-url>
```

The deploying service account needs Firestore and Cloud Storage access in `<your-project-id>` (`roles/datastore.user`, `roles/storage.objectAdmin`), and Firestore must be enabled in Native mode for that project.

## Status

Feature-complete: the full pipeline (breakdown → location research → scheduling/validation → call sheet → availability drafting), plus Autopilot, Stripboard/DOOD, Time Cards/Payroll, and the actor/crew availability + date-locking layer described above, all work end to end locally.

Honest gaps:
- **Magic-link/outreach response state is still in-memory only.** `_TOKENS`/`_CANCELLATIONS`/`_PROPOSALS`/`_CONFIRMATIONS` in `availability_routes.py` live in a single process's memory and reset on restart — unlike `Project` data, which now persists to Firestore (see `backend/common/project_store.py`). `--min-instances 1` on Cloud Run works around this for a live deploy; migrating this state to Firestore too is the real fix and hasn't been done yet.
- **No auth / multi-user.** Every project is local to whoever's browser it's in, plus a best-effort backend sync — there's no login, no team accounts, no permissions model.
- **No script format import beyond PDF** (no Fountain/Final Draft `.fdx` import), and no budgeting/line-item cost tracking beyond the Time Cards labor-cost total.

See `PLAN.md` for the original build plan and timeline, and `docs/DEVPOST_SUBMISSION.md` for the hackathon submission text.

## License

MIT — see `LICENSE`.
