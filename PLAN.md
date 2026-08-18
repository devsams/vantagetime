# VantageTime — Build Plan

Hackathon: Google Agentic Cinema (Parallel track), agentic-cinema.devpost.com
Deadline: Sep 9, 2026, 2:00pm PDT (per official rules — see below)
Today: Aug 18, 2026 (~3 weeks out)

## Product

Upload a script (PDF) → get a scene breakdown → get a validated shoot schedule → get location research → get a call sheet. Priced for the audience incumbents ignore: YouTubers, TikTokers, film students, ultra-low-budget indie filmmakers. Target $10/month, mobile-first, radically simpler than StudioBinder/Filmustage/Yamdu/Celtx.

## Agent architecture

```
orchestrator (root)
  └─ production_pipeline (SequentialAgent)
       ├─ script_breakdown_agent        — Gemini native PDF parsing → scenes/cast/props/locations JSON
       ├─ scheduling_agent              — proposes shoot order + day groupings
       │    └─ validate_schedule (tool) — deterministic Python: cast conflicts, day-length limits, location-jump feasibility
       ├─ location_research_pipeline (ParallelAgent)
       │    └─ one location_research_agent instance per distinct location — Parallel search for permits/weather/amenities
       └─ call_sheet_generator          — synthesizes breakdown + validated schedule + location research, never invents facts
```

Same "never trust the LLM's arithmetic" principle as CinePulse's `compute_financials`: the Scheduling Agent proposes, the Validator tool checks with real code, and the agent must report the validator's output verbatim rather than reason about feasibility itself.

## Design reference

Visual direction pulled from the uploaded "Cine Agent Prototype" artifact (confirmed via live render, since the uploaded HTML file itself was an unparseable compiled bundle):

- Near-black background, single lime/chartreuse accent color (buttons, active-stage dot, big stat numbers)
- Bold, condensed, all-caps display type for titles ("SALT & ASH")
- Small-caps, letter-spaced, muted-gray labels for metadata ("YOUR PROJECTS", "FEATURE FILM", "SCENES")
- Card-based project list; big numeric stats (scene count, shoot days, locations, cast) laid out in a row
- Pipeline progress shown as a row of pill badges per stage (Breakdown, Scheduling, Validator, Locations, Call Sheet), checkmark = done, dot = pending

This is the direction for the frontend build in Phase 3 below — a cleaner, more product-y evolution of CinePulse's dark terminal look, not a rebuild of it.

## Timeline

### Week 1 (Aug 18–24) — Script Breakdown Agent
- Backend scaffold (done): FastAPI + ADK server, shared GCP/Parallel config, placeholder orchestrator.
- Build `script_breakdown_agent`: Gemini native PDF ingestion, structured scene/cast/prop/location extraction schema.
- Checkpoint: upload a real script PDF via `adk web`, confirm clean structured output.

### Week 2 (Aug 25–31) — Scheduling + Validator + Location Research
- Build `scheduling_agent` + `validate_schedule` deterministic tool (cast conflicts, day-length caps, location-jump feasibility).
- Build `location_research_agent` + wrap in a `ParallelAgent` fan-out, one instance per distinct script location, using the existing `search_market`-style Parallel tool pattern.
- Wire orchestrator: `SequentialAgent(script_breakdown_agent, scheduling_agent, location_research_pipeline)`.
- Checkpoint: full pipeline run end-to-end via `adk web` on a real script, validator catching at least one deliberately-introduced conflict.

### Week 3 (Sep 1–7) — Call Sheet + Frontend + Ship
- Build `call_sheet_generator`.
- Frontend: Next.js scaffold, dark/lime design system per prototype reference above, project list + pipeline-stage view + call sheet view, mobile-first layout.
- Deploy backend + frontend to Cloud Run (same GCP project as CinePulse).
- End-to-end test on 2-3 real short-film scripts.
- Demo video, README polish, Devpost submission text, track confirmation.
- Buffer: last 1-2 days reserved for fixing whatever breaks in the full run-through — do not schedule new features here.

## Open questions
- CinePulse's own submission status (deploy, README, demo video, Devpost text) was never explicitly closed out when attention shifted here — decide before deadline whether to still finish/submit it alongside VantageTime.
