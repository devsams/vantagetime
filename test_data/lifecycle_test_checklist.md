# VantageTime — full lifecycle test (2-person, 2-day script)

Run this on your Mac — the sandbox I work in can't reach Vertex AI or Google
Cloud (network-blocked), so I verified the servers boot and the email flow
works end to end (real SMTP send, confirmed against a local mail catcher),
but the actual Gemini pipeline needs to run on your machine.

Test fixture: `test_data/two_person_two_day_script.pdf` — 2 characters
(MAYA, DEV), 4 scenes across 2 locations (Maya's Apartment, Lake House),
sized so the Scheduling Agent's "one location per day" rule should produce
exactly 2 shoot days.

## 0. Setup — three terminals

```bash
# Terminal 1 — Mailpit (real SMTP catcher, web UI at localhost:8025)
brew install mailpit && mailpit

# Terminal 2 — backend
cd ~/Projects/cinepulse/vantagetime/backend
source .venv/bin/activate
uvicorn server:app --reload --port 8000

# Terminal 3 — frontend
cd ~/Projects/cinepulse/vantagetime/frontend
npm run dev
```

Open `http://localhost:3000` and `http://localhost:8025` (Mailpit) side by side.

## 1. Breakdown — upload the test script

Upload `two_person_two_day_script.pdf`. Check:
- [ ] `page_count` / `scene_count` roughly match (4 scenes, ~2 pages)
- [ ] `cast` lists exactly MAYA and DEV
- [ ] `locations` collapses to exactly 2 (Maya's Apartment, Lake House) — confirms the INT./EXT. merge rule works
- [ ] Scene 3 (dusk exterior) is flagged `magic_hour`

**Contest alignment**: this is the Gemini-via-ADK call — confirms `google-adk`/Gemini is actually invoked at runtime, not just imported.

## 2. Scheduling + Validator

- [ ] Exactly 2 shoot days, one location each (not 3+ locations crammed together)
- [ ] Validator tab shows `valid: true`, no unresolved errors

Tabs are now: Breakdown, Scheduling, Validator, Call Sheet, **Dates**, Status, Availability.
"Locations" and "Planning" no longer exist as separate tabs — both are folded into **Dates**,
which has three sub-tabs: Shoot Window, Location Research, Roster & Availability.

## 3. Dates tab — Location Research sub-tab

- [ ] Each location shows permit/weather/logistics notes with real source URLs — confirms Parallel Search is actually called (the Parallel-track requirement)
- [ ] Nearest hospital + emergency contact appear if search surfaced them (empty is fine if it didn't — never a guess)

## 4. Call Sheet tab

- [ ] Day X of 2, with the real date (once dates are assigned in step 6 below)
- [ ] Weather, sunrise, and sunset show up per day with real numbers (not blank) — confirms `get_weather` (Open-Meteo) is live
- [ ] Page counts shown as fractions (e.g. "1 1/8")
- [ ] Fill in Production Info (company, UPM, safety officer, walkie channels) — persists across days
- [ ] Add a per-day custom field, confirm it saves

## 5. Dates tab — Roster & Availability sub-tab

- [ ] Location: add an address + a contact name/phone/email for one location
- [ ] Actor sub-tab (inside Roster): enter real-looking test emails for MAYA and DEV (e.g. `maya@test.local`, `dev@test.local`); mark one of them Priority: Yes
- [ ] Crew sub-tab: add one crew member with a real-looking email
- [ ] Other sub-tab: add one item (e.g. "RED Camera Package") with a real-looking contact email

## 6. Dates tab — Shoot Window sub-tab (the priority-ladder pick)

This is the new flow: the production team proposes a candidate range, then the single
highest-priority person across cast/crew/other picks one of up to 3 real N-day blocks —
that pick hard-locks the shoot dates for everyone.

- [ ] Set Start/End (e.g. a 3-week January range) and "Shoot days needed" = 2, click "Set window"
- [ ] Up to 3 candidate blocks appear, real consecutive-date ranges (never invented)
- [ ] Go to Roster & Availability → Cast Outreach card → click "Generate links"
- [ ] Each card shows "✓ Sent to ... — check Mailpit" (not "Not sent")
- [ ] Switch to Mailpit's web UI (localhost:8025) — real emails should be sitting there, one per person, each with a working `/availability/<token>` link
- [ ] Open the **priority** person's link — they should see "Pick your 2-day shoot window" with the candidate blocks as buttons
- [ ] Open the **non-priority** person's link — they should see "waiting on someone with higher priority" instead
- [ ] Back on the priority person's page, click a block — it locks immediately
- [ ] Refresh the non-priority person's page — it now shows "Shoot dates locked" with the real dates
- [ ] Back on the Dates tab's Shoot Window sub-tab, the window card shows "Locked" — click "Assign these dates to the schedule →"
- [ ] This re-runs the Scheduling Agent; `schedule.shoot_days[].date` should now be the real locked dates, and the Call Sheet tab (step 4) should show them
- [ ] Confirm Day 1 on one person's actor page; check Mailpit for the "you're confirmed" receipt
- [ ] On another person's actor page, submit 3 alternate dates instead of confirming; check Mailpit for the "dates received" receipt

## 7. Status tab vs. Availability tab

These are intentionally different views now — Status is per-person, Availability is aggregate.

- [ ] Status tab: the confirmed person shows "locked in"; the one who proposed alternates shows "awaiting final dates"; banner accurately reflects "not everyone is locked in yet"
- [ ] Availability tab: shows aggregate stat cards (headcount, links generated, % confirmed, flagged unavailable, no-email count), the locked shoot window, the priority list, and a per-day coverage bar — no send/generate actions here, it's read-only

## 8. Self-check against the judging criteria (Agentic Cinema)

- [ ] **Technological Implementation** — did every stage above actually call a real tool (ADK agent, Parallel Search, Open-Meteo, real SMTP) rather than a canned response?
- [ ] **Design** — does the flow feel like one coherent product, not five disconnected screens?
- [ ] **Potential Impact** — would a real 2-person indie shoot actually save time here versus a spreadsheet?
- [ ] **Quality of idea** — is anything here just an LLM chat wrapper, or does every step have a deterministic check behind it?

Report back what breaks (if anything) and I'll fix it from here.
