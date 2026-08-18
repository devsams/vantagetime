# VantageTime

A script-to-schedule-to-call-sheet tool for indie filmmakers, YouTubers, and film students — the cheap, mobile-first alternative to StudioBinder/Filmustage/Yamdu ($30-100+/month). Built for Google's Agentic Cinema hackathon (Parallel track).

Upload a script. VantageTime breaks it into scenes, builds a shoot schedule, validates it against real-world constraints, researches your filming locations, generates a call sheet, drafts cast/crew outreach, collects real availability through actor-facing links, and tracks who's actually locked in — all through a coordinated team of agents and deterministic tools, not a single prompt.

## Why agentic

Every stage is a real agent doing real work, not a form wizard with an LLM bolted on. The pipeline (`orchestrator/agent.py`, an ADK `SequentialAgent`) runs:

1. **Script Breakdown Agent** — reads the script PDF natively (no OCR step) and extracts scenes, cast, props, and locations into structured data. Every later stage builds on this rather than re-reading the script.
2. **Location Research Agents** — a `ParallelAgent` fan-out, one instance per distinct script location, each firing a live [Parallel](https://parallel.ai) web search for permit requirements, weather norms, and shooting logistics. Runs before scheduling so the Scheduling Agent has real seasonal context when it later assigns dates.
3. **Scheduling Agent** — proposes a shoot order and groups scenes by location, then hands its grouping to a **deterministic Python validator** (`validate_schedule`) that checks for cast double-bookings, day-length overloads, and multi-location days — real arithmetic, not LLM estimation. Given a real shoot window, it also calls `assign_calendar_dates` (real date math) and `get_weather` (a live forecast or a genuine multi-year historical average from Open-Meteo) per day, and `estimate_cast_hours` to compute each cast member's real share of a day's pages.
4. **Call Sheet Generator** — synthesizes breakdown + validated schedule + location research into one call sheet per shoot day, flagging anything it can't fill in rather than guessing.
5. **Availability Agent** — drafts a personal outreach message per cast member with their real scheduled days, dates, and hours. Drafting only; everything after that (tokens, magic links, tracking responses) is deterministic backend code, described below.

Same principle throughout: the agent proposes, a real tool checks or computes, and the agent must report the tool's output verbatim rather than reason about feasibility, dates, or hours itself.

## Beyond the pipeline: getting a shoot actually locked in

A validated schedule isn't a plan yet — cast and crew still have to confirm they can make it, and locations have to actually be free on the days you pick. The frontend adds a deterministic layer on top of the agent pipeline for that:

- **Actor/crew magic links** — a plain FastAPI router (`backend/common/availability_routes.py`), deliberately *not* part of the ADK pipeline, since an actor clicking a link days later has nothing to do with the filmmaker's chat session. Each person gets a token and a personal page (`/availability/[token]`): if a day isn't dated yet, they must submit at least 3 real candidate dates (a single date isn't a negotiation); once a day has a real date, they get an explicit "I can make it" confirm or a reject-with-alternatives flow.
- **Planning tab** — pulls every response live and organizes it into Location, Actor, Crew, and Other sub-tabs: per-location availability rules (days of week, a date window, preferred dates, an optional preferred time, and a priority flag), a Conflicts panel that flags cast/crew still booked on a day they've rejected or a location outside its own rules (with a one-click fix to the next date that actually works), and Alternative Date Suggestions — real overlap-counting across everyone's submitted dates, weighted priority-people first, then cast, then crew.
- **Status tab** — one table for the production house: every cast/crew member's response status (locked in, awaiting final dates, pending, or unavailable), computed from the same real response data, with a single banner answering "is everyone actually locked in yet?"
- **Dates tab** — sets the real shoot window (assigned via the deterministic `assign_calendar_dates` tool) and syncs each dated day to Google Calendar (pre-filled quick-add links, no OAuth required).

## Frontend

Next.js 16 / React 19 / Tailwind, dark terminal-product aesthetic (near-black background, single lime accent). Nine tabs per project, in workflow order: **Breakdown → Scheduling → Validator → Locations → Call Sheet → Status → Planning → Availability → Dates**. Project state persists to `localStorage`; live data (actor responses, location research, call sheets) comes from the backend per session.

## Setup

Reuses the same Google Cloud project, Vertex AI credentials, and Parallel API key as CinePulse — no new account setup required.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in PARALLEL_API_KEY
uvicorn server:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000, expects the backend on :8000
```

Run `gcloud auth application-default login` once locally if you haven't for this machine. Both `backend/` and `frontend/` have a `Dockerfile` ready for Cloud Run; **neither service is deployed yet** — see Status below.

## Status

Feature-complete for the hackathon scope: the full pipeline (breakdown → location research → scheduling/validation → call sheet → availability drafting), plus the actor/crew availability, planning, status, and date-locking layer described above, all work end to end locally.

Honest gaps before submission:
- **Not deployed.** Both services are Docker/Cloud-Run-ready but currently local-dev only — no live URL yet.
- **In-memory response storage.** `_TOKENS`/`_CANCELLATIONS`/`_PROPOSALS`/`_CONFIRMATIONS` in `availability_routes.py` live in a single process's memory and reset on restart — fine for a demo, but a Cloud Run deploy needs `min-instances=1` (or a swap to Firestore) so actor links don't go stale mid-demo.
- **No demo video or Devpost submission text yet.**

See `PLAN.md` for the original build plan and timeline.

## License

MIT — see `LICENSE`.
