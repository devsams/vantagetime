# Devpost Submission — VantageTime

Draft text for the **All Things Agentic Hackathon** submission form (allthingsagentichackathon.devpost.com). Copy each section into the matching field. Fill in the bracketed placeholders before submitting.

---

## Category

**Collaborative Partner**

Rationale: Autopilot is the spine of VantageTime — it doesn't just execute a workflow silently, it leads the filmmaker step by step (Members → Shoot dates → Check locations → Notify location owners → Notify actors → Full plan → Tasks → Time cards), asks for exactly what's missing at each step (a location address, a missing actor email, an unset pay rate) with an inline fix, and adapts its own state as the filmmaker responds. The chat assistant (`/assistant`) layers a second collaborative surface on top: it reads the live project state and executes the same edit actions the UI itself uses, so it's a genuine second way to work the plan rather than a bolted-on Q&A box.

---

## Project URL (hosted)

`[FILL IN — Cloud Run frontend URL after deploy, e.g. https://vantagetime-frontend-xxxxx.us-central1.run.app]`

## Code repository

`https://github.com/devsams/vantagetime`

Spin-up instructions are in the repo's `README.md` (local dev) and `README.md`'s "Deploy to Cloud Run" section (cloud deploy).

## Architecture diagram

`docs/architecture-diagram.svg` in the repo (also embedded in `docs/DEVELOPER_OVERVIEW.md`).

---

## Text description

### What it does

VantageTime turns a screenplay PDF into a running production: a scene breakdown, a validated shoot schedule, real location research, a call sheet, cast/crew outreach, and a full availability-confirmation loop — then keeps going into a drag-and-drop stripboard, a Day-Out-of-Days report, and payroll/time cards. It targets the filmmaker StudioBinder/Filmustage/Yamdu/Celtx don't: a solo indie filmmaker, a two-person crew, a film-school short, or a YouTube narrative shoot who needs the same coordination a line producer provides but has neither the budget nor the time for enterprise production software.

Rather than nine disconnected tabs, **Autopilot** is the guided spine of the product: one step-by-step flow that walks the filmmaker through the whole production in order, tells them exactly what's blocking the next step, and lets them fix it inline — add a missing email, correct a location address, set a pay rate — without leaving the flow.

### How it works

A Google ADK `SequentialAgent` (`production_pipeline`) runs five stages on **Gemini 3.5 Flash**: a Script Breakdown Agent reads the script PDF natively (no OCR) and extracts scenes/cast/props/locations; a `ParallelAgent` fans out up to five Location Research Agents, each firing a live Parallel web search for permits, weather norms, and logistics; a Scheduling Agent proposes a shoot order and hands it to deterministic Python tools — `validate_schedule` (cast conflicts, day-length caps, location-jump feasibility), `assign_calendar_dates` (real date math), `get_weather` (a live Open-Meteo forecast or a genuine multi-year historical average), and `estimate_cast_hours` (real page-count math) — because arithmetic is never trusted to the LLM; a Call Sheet Generator synthesizes everything into one call sheet per shoot day; and an Availability Agent drafts personal outreach messages. Everything after that — actors confirming real dates through magic links, the stripboard, Day-Out-of-Days, payroll — is deterministic backend/frontend code, not agent output, because an actor clicking a link three days later has nothing to do with the filmmaker's original chat session.

### Technologies used

Gemini 3.5 Flash (Gemini API/Vertex AI) · Google Agent Development Kit (`SequentialAgent`, `ParallelAgent`, `Agent`) · FastAPI/Python backend · Firestore (project persistence) · Cloud Storage (uploaded-script blobs) · Cloud Run (deploy target for both services) · Next.js 16 / React 19 / TypeScript / Tailwind v4 frontend · Parallel Web Search API (location research) · Open-Meteo (weather, free/no-key) · Mailpit/SMTP (outreach email).

### Data sources

The uploaded script PDF (or a roster PDF/DOCX/CSV on the alternate entry path) is the only user-supplied data source. Everything else — location permit/logistics data, weather forecasts and historical norms — comes from live calls to the Parallel Web Search API and Open-Meteo at run time; nothing is hardcoded or pre-scraped.

### Findings and learnings

The most useful decision was drawing a hard line between what the LLM is allowed to do (read unstructured text, draft messages) and what it isn't (arithmetic, date math, feasibility judgments) — every agent that touches a number hands off to a real deterministic tool and must report that tool's output verbatim, which turned "the AI got the schedule wrong" from a recurring risk into a non-issue. The harder problem turned out to be everything *after* the pipeline: an actor confirming a date three days later, or a location owner replying to an email, has nothing to do with the original agent session, so that whole layer (magic links, response tracking, conflict detection) had to be built as plain deterministic backend state rather than folded into the agent framework — a good reminder that "agentic" doesn't mean everything should run through an LLM. We also learned mid-build that keeping that response state in-memory (fine for local dev) doesn't survive a real multi-instance Cloud Run deploy without either `--min-instances 1` or a move to Firestore — the latter is the more correct fix and is still open.

---

## Optional developer contributions (not yet done)

- [ ] Blog/video post about how VantageTime was built
- [ ] Social post with #AllThingsAgenticHackathon
- [ ] Additional Google AI model integration (Gemma / Veo / Lyria)
