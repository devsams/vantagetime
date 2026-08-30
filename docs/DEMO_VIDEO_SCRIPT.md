# VantageTime — Demo Video Script

Target: 4 minutes total, for the All Things Agentic Hackathon submission (Taskmaster category).

## Timing budget

| Section | Time | Status |
|---|---|---|
| 1. Problem | ~20s | Drafted below |
| 2. Value proposition | ~20s | Drafted below |
| 3. Demo of the app in action | ~2:30 | Shot list drafted below — needs screen recording |
| 4. Proof it's running on Google Cloud | ~30s | Shot list drafted below — needs actual Cloud Run deploy first |

---

## 1. Problem (read this on camera or as voiceover, ~20 seconds)

> Every indie film starts the same way. A script, a deadline, and one person — usually the director — drowning in spreadsheets. Breaking the script into scenes by hand. Guessing at a shoot schedule. Texting a dozen actors one by one to find out who's actually free. Building a call sheet at midnight before the shoot.
>
> The tools that solve this — StudioBinder, Yamdu, Filmustage — are built for productions with a full crew and a software budget. They're not built for two people making a $2,000 short.

*(~65 words, reads naturally in about 20 seconds)*

## 2. Value proposition (~20 seconds)

> VantageTime is the production coordinator that budget can't afford to hire. Upload a script, and a real team of Gemini agents takes over: one breaks it into scenes and cast, others research real permits and weather for every location, a scheduler builds and validates the shoot days with actual math — never a guess — and it drafts outreach to every actor and location owner.
>
> It's not a chatbot that talks about your schedule. It's an agent that builds it, checks it, and sends it.

*(~75 words, about 20-22 seconds)*

Combined, sections 1+2 are one continuous ~40-45 second cold open before you switch to screen recording — no need for a hard cut between "problem" and "value prop" on camera, they read as one thought.

---

## 3. Demo of the app in action — shot list (~2:30)

This is the section that carries the most judging weight ("Proof of Action: does the video show an unedited, live execution of the agent performing its task"). Screen-record these in order, narrating over each:

1. **Upload** (10s) — Autopilot tab, upload a real script PDF. Say what's about to happen: "This kicks off a five-stage agent pipeline — no manual data entry after this."
2. **Breakdown** (15s) — Show the Breakdown tab populate with real scenes/cast/locations extracted from the PDF. Point out it's structured data, not a summary.
3. **Location research** (20s) — Production Plan → Location Research sub-tab. Show a real location's permit/weather/hours notes with cited sources — this is the proof the Parallel web-search agent actually ran, not canned data.
4. **Schedule + validator catching something** (25s) — Production Plan → Scheduling sub-tab. This is the single best "agentic, not chatbot" beat in the whole demo: show the validator flagging a real conflict (a double-booked scene, or a 3+ location day now that it's a hard error) and the schedule correcting itself. Narrate: "The agent doesn't just guess a schedule — a deterministic checker validates it, and if it's wrong, the agent fixes it and shows its work." **Not yet verified live this session** — see punch list; the two test scripts in `test_data/` may be too simple (1 scene / 2 days, single location each) to naturally trigger this. Worth a quick manual test before recording, or writing a short 3-location-in-one-day test script specifically to trigger it on cue.
5. **Call sheet** (15s) — Show a generated call sheet with real weather, sunrise/sunset, cast call times.
6. **Outreach → actor confirms** (20s) — Show a drafted cast email, then cut to the actor-facing magic-link page confirming a day. This is the "sends the right info to the right places" Taskmaster beat.
7. **Stripboard / Time Cards / Dashboard** (20s) — Quick pass through 2-3 of the newer features to show breadth: drag a scene on the Stripboard, show a time card computing real pay, show the Dashboard's locked-in status.
8. **Autopilot recap** (15s) — End back on Autopilot showing several steps checked off — ties back to the value prop line "it builds it, checks it, and sends it."

---

## 4. Proof it's running on Google Cloud — shot list (~30s)

Mandatory per the rules — do this *after* you've actually deployed (see `README.md`'s "Deploy to Cloud Run" section; you still need to run this).

1. Show the real `.run.app` URL in the browser address bar while using the live app (not localhost).
2. Cut to the Google Cloud Console — Cloud Run dashboard, showing both `vantagetime-backend` and `vantagetime-frontend` services as green/healthy.
3. Cut to one service's Logs tab showing real request logs from the actions you just performed.
4. Optional but strong: Vertex AI / Gemini API usage showing recent `gemini-3.5-flash` calls, proving the pipeline is really hitting the model, not mocked.

Narrate something like: "This isn't running on my laptop — it's deployed on Cloud Run, backed by Firestore and Cloud Storage, calling Gemini 3.5 Flash through Vertex AI."

---

## Notes

- Total script word count for sections 1+2 is ~140 words — read them together as a cold open before cutting to screen recording.
- Section 3's validator-catching-a-conflict beat (item 4) is the single most important shot for the "Innovation & Operational Utility" and "Architectural Discipline" judging criteria — don't cut it for time if something has to give.
- Section 4 is a hard submission requirement, not optional — the video must show real Cloud Run evidence, not just the local app.
