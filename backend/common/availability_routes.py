"""Plain REST routes for the actor availability magic-link flow.

Deliberately NOT part of the ADK agent pipeline — an actor clicking a
link days later has nothing to do with the filmmaker's chat session, so
this is ordinary deterministic backend code: generate a token, remember
what it points to, record a cancellation (and, if they have one, a set
of real alternative dates) when one comes in.

Storage is in-memory and resets on server restart. That's fine for a
hackathon demo (single process); a real deployment would swap `_TOKENS`,
`_CANCELLATIONS`, and `_PROPOSALS` for a real datastore (e.g. Firestore)
without changing any route below.
"""
import secrets
import time
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from .mailer import send_email

router = APIRouter(prefix="/availability", tags=["availability"])

_TOKENS: dict[str, dict] = {}  # token -> {session_id, project_name, actor_name, days}
_CANCELLATIONS: dict[str, list[dict]] = {}  # session_id -> [{actor_name, day_number, cancelled_at}]
_PROPOSALS: dict[str, list[dict]] = {}  # session_id -> [{actor_name, day_number, dates, submitted_at}]
_CONFIRMATIONS: dict[str, list[dict]] = {}  # session_id -> [{actor_name, day_number, confirmed_at}]

# Registration order per session, across cast/crew/other alike — the
# priority ladder is this list sorted by priority flag (stable, so ties
# keep registration order). Combined with _TOKENS[token]["priority"].
_SESSION_TOKEN_ORDER: dict[str, list[str]] = {}

# One shoot-date window per session: the production team's candidate
# range, any blackout dates to avoid, and the (up to 3) real N-day
# blocks that actually fit — real date arithmetic, never a guess.
_WINDOWS: dict[str, dict] = {}

# An actor proposing alternatives is only useful if there's real overlap
# to look for — one date isn't a negotiation, it's a demand. Requiring a
# few options is what lets the filmmaker actually find a date that
# works across everyone who flagged a conflict on the same day.
_MIN_PROPOSED_DATES = 3


def _record_cancellation(session_id: str, actor_name: str, day_number: int) -> None:
    """Adds a cancellation only if this actor hasn't already flagged this
    exact day — keeps the list free of duplicates if they submit twice."""
    existing = _CANCELLATIONS.setdefault(session_id, [])
    if any(c["actor_name"] == actor_name and c["day_number"] == day_number for c in existing):
        return
    existing.append({"actor_name": actor_name, "day_number": day_number, "cancelled_at": time.time()})
    # Confirming, then later cancelling the same day, should actually
    # flip the status — an explicit "can't make it" always wins.
    confirmations = _CONFIRMATIONS.get(session_id, [])
    confirmations[:] = [
        c for c in confirmations if not (c["actor_name"] == actor_name and c["day_number"] == day_number)
    ]


def _record_confirmation(session_id: str, actor_name: str, day_number: int) -> None:
    """Adds a positive confirmation only if this actor hasn't already
    confirmed this exact day."""
    existing = _CONFIRMATIONS.setdefault(session_id, [])
    if any(c["actor_name"] == actor_name and c["day_number"] == day_number for c in existing):
        return
    existing.append({"actor_name": actor_name, "day_number": day_number, "confirmed_at": time.time()})


def _priority_rank(session_id: str) -> list[str]:
    """The combined cast/crew/other date-picking ladder for a session:
    every registered token, priority people first, ties broken by
    registration order (stable sort) — never re-judged, just the flag
    the filmmaker already set on each person/location/item."""
    order = _SESSION_TOKEN_ORDER.get(session_id, [])
    return sorted(
        (t for t in order if t in _TOKENS),
        key=lambda t: not _TOKENS[t].get("priority", False),
    )


def _generate_candidate_blocks(
    start: str, end: str, blackout_dates: set[str], num_days: int, num_options: int = 3
) -> list[list[str]]:
    """Real date arithmetic, never a guess: finds every run of `num_days`
    consecutive calendar dates inside [start, end] that avoids every
    blackout date, then returns up to `num_options` of them spread
    evenly across the valid range (early/middle/late) so the choices
    are genuinely different, not clustered at one end."""
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
    except (ValueError, TypeError):
        return []
    if num_days < 1 or e < s:
        return []

    valid_starts: list[list[str]] = []
    cursor = s
    while cursor + timedelta(days=num_days - 1) <= e:
        block = [(cursor + timedelta(days=i)).isoformat() for i in range(num_days)]
        if not any(d in blackout_dates for d in block):
            valid_starts.append(block)
        cursor += timedelta(days=1)

    if len(valid_starts) <= num_options:
        return valid_starts

    picks: list[list[str]] = []
    for i in range(num_options):
        idx = round(i * (len(valid_starts) - 1) / (num_options - 1)) if num_options > 1 else 0
        picks.append(valid_starts[idx])

    seen: set[tuple] = set()
    result: list[list[str]] = []
    for block in picks:
        key = tuple(block)
        if key not in seen:
            seen.add(key)
            result.append(block)
    return result


class ScheduledDay(BaseModel):
    day_number: int
    locations: list[str]
    date: str = ""  # "YYYY-MM-DD", empty if no shoot window has been set yet
    hours_needed: float = 0


class ProposedPeriod(BaseModel):
    start: str  # "YYYY-MM-DD"
    end: str  # "YYYY-MM-DD"


class RegisterActor(BaseModel):
    name: str
    scheduled_days: list[ScheduledDay]
    # Optional — if present, the filmmaker's real address for this
    # person, plus the draft the Availability Agent already wrote. When
    # all three are present, register() actually sends the outreach
    # email (via Mailpit or whatever SMTP catcher MAILPIT_HOST points
    # at); when any are missing, registration still succeeds and the
    # frontend falls back to "Copy email" — nothing here is required.
    email: str = ""
    email_subject: str = ""
    email_body: str = ""
    # Filmmaker-flagged priority (same flag already used for locations
    # and "Other" items) — determines this person's place in the
    # combined cast/crew/other date-picking ladder below.
    priority: bool = False


class RegisterRequest(BaseModel):
    session_id: str
    project_name: str
    actors: list[RegisterActor]
    # A soft target window the filmmaker is aiming for, shown to every
    # actor/crew member on this call so their availability answers have
    # real context — distinct from the hard per-day "date" fields above,
    # which only exist once assign_calendar_dates has actually run.
    proposed_period: ProposedPeriod | None = None
    # The frontend's own origin (e.g. "https://vantagetime.example.com"),
    # used only to build the real "/availability/<token>" link inside
    # the outreach email — the backend has no other way to know it.
    frontend_base_url: str = ""


class RegisterResponseItem(BaseModel):
    name: str
    token: str
    email_sent: bool = False
    email_status: str = ""  # e.g. "no email on file", "SMTP connection refused"


@router.post("/register", response_model=list[RegisterResponseItem])
def register(req: RegisterRequest) -> list[RegisterResponseItem]:
    """Generates one fresh token per actor and remembers their scheduled
    days. Re-registering the same project overwrites nothing — old
    tokens for a prior schedule version stay valid but point at stale
    day lists, which is an acceptable tradeoff for a demo (a real
    deployment would invalidate old tokens on reschedule).

    If an actor has a real email plus drafted subject/body, this also
    sends the actual outreach email — best-effort, never blocks
    registration if the send fails."""
    result = []
    for actor in req.actors:
        token = secrets.token_urlsafe(8)
        _TOKENS[token] = {
            "session_id": req.session_id,
            "project_name": req.project_name,
            "actor_name": actor.name,
            "actor_email": actor.email,
            "priority": actor.priority,
            "days": [d.model_dump() for d in actor.scheduled_days],
            "proposed_period": req.proposed_period.model_dump() if req.proposed_period else None,
        }
        _SESSION_TOKEN_ORDER.setdefault(req.session_id, []).append(token)

        email_sent = False
        email_status = "no email on file"
        if actor.email and actor.email_subject and actor.email_body:
            link_line = (
                f"\n\nLet us know here: {req.frontend_base_url}/availability/{token}"
                if req.frontend_base_url
                else ""
            )
            outcome = send_email(actor.email, actor.email_subject, actor.email_body + link_line)
            email_sent = outcome["sent"]
            email_status = "sent" if email_sent else outcome.get("reason", "send failed")

        result.append(
            RegisterResponseItem(name=actor.name, token=token, email_sent=email_sent, email_status=email_status)
        )
    return result


# --- Shoot-date window: production team sets a candidate range, the
# backend computes real N-day options, and the highest-priority
# registered person locks one — all deterministic, no LLM involved. ---


class SetWindowRequest(BaseModel):
    session_id: str
    start: str  # "YYYY-MM-DD"
    end: str  # "YYYY-MM-DD"
    blackout_dates: list[str] = []
    num_shoot_days: int


class WindowResponse(BaseModel):
    start: str
    end: str
    blackout_dates: list[str]
    num_shoot_days: int
    candidate_blocks: list[list[str]]
    locked_block: list[str] | None
    error: str = ""


@router.post("/dates/window", response_model=WindowResponse)
def set_window(req: SetWindowRequest) -> WindowResponse:
    """Sets (or replaces) this session's candidate shoot window and
    computes real candidate blocks — never invented, never LLM-estimated.
    Replacing an existing window clears any prior lock; that's correct,
    since a changed window invalidates whatever was locked before."""
    blackout = set(req.blackout_dates)
    blocks = _generate_candidate_blocks(req.start, req.end, blackout, req.num_shoot_days)
    error = (
        ""
        if blocks
        else (
            f"No {req.num_shoot_days}-day run fits between {req.start} and {req.end} "
            "once blackout dates are excluded — widen the window or remove a blackout date."
        )
    )
    _WINDOWS[req.session_id] = {
        "start": req.start,
        "end": req.end,
        "blackout_dates": req.blackout_dates,
        "num_shoot_days": req.num_shoot_days,
        "candidate_blocks": blocks,
        "locked_block": None,
    }
    return WindowResponse(
        start=req.start,
        end=req.end,
        blackout_dates=req.blackout_dates,
        num_shoot_days=req.num_shoot_days,
        candidate_blocks=blocks,
        locked_block=None,
        error=error,
    )


@router.get("/dates/{session_id}", response_model=WindowResponse)
def get_window(session_id: str) -> WindowResponse:
    w = _WINDOWS.get(session_id)
    if not w:
        raise HTTPException(status_code=404, detail="No date window set for this session yet.")
    return WindowResponse(**w, error="")


class LockRequest(BaseModel):
    block_index: int


@router.post("/dates/{session_id}/lock/{token}")
def lock_window(session_id: str, token: str, req: LockRequest) -> dict:
    """Only the single highest-priority registered person (cast, crew,
    or other — one combined ladder) may lock a block, and only while
    nothing is locked yet. Once locked, it's final — everyone else's
    view flips from "waiting" to the normal confirm/flag-a-conflict
    flow against these real dates."""
    record = _TOKENS.get(token)
    if not record or record["session_id"] != session_id:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    w = _WINDOWS.get(session_id)
    if not w:
        raise HTTPException(status_code=404, detail="No date window set for this session yet.")
    if w["locked_block"]:
        raise HTTPException(status_code=409, detail="Dates are already locked.")

    ladder = _priority_rank(session_id)
    if not ladder or ladder[0] != token:
        raise HTTPException(
            status_code=403,
            detail="It's not your turn to pick yet — someone with higher priority hasn't picked.",
        )
    if req.block_index < 0 or req.block_index >= len(w["candidate_blocks"]):
        raise HTTPException(status_code=400, detail="Invalid option.")

    w["locked_block"] = w["candidate_blocks"][req.block_index]
    locked = w["locked_block"]

    # Locking a block is itself a real response, but it lives entirely in
    # `_WINDOWS` — the dashboards (Status, Availability) only ever look at
    # `_CANCELLATIONS`/`_CONFIRMATIONS`/`_PROPOSALS`, so without the two
    # steps below, the person who just locked the shoot dates would
    # silently vanish from every "who's responded" view in the app.
    #
    # 1. Backfill real per-day dates for EVERY registered person in this
    #    session (day N -> the Nth date in the locked block, in order) —
    #    until now those days were permanently "" because the old
    #    Scheduling Agent flow that used to fill them in predates the
    #    priority-ladder window entirely.
    for other_token in _SESSION_TOKEN_ORDER.get(session_id, []):
        other_record = _TOKENS.get(other_token)
        if not other_record:
            continue
        for d in other_record["days"]:
            idx = d["day_number"] - 1
            if 0 <= idx < len(locked) and not d.get("date"):
                d["date"] = locked[idx]

    # 2. The person who locked it in has, by definition, just confirmed
    #    their own availability for whichever days they're on.
    for d in record["days"]:
        _record_confirmation(session_id, record["actor_name"], d["day_number"])

    return {"ok": True, "locked_block": w["locked_block"]}


@router.get("/{token}")
def get_actor_view(token: str) -> dict:
    record = _TOKENS.get(token)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    session_id = record["session_id"]
    cancelled_days = {
        c["day_number"]
        for c in _CANCELLATIONS.get(session_id, [])
        if c["actor_name"] == record["actor_name"]
    }
    confirmed_days = {
        c["day_number"]
        for c in _CONFIRMATIONS.get(session_id, [])
        if c["actor_name"] == record["actor_name"]
    }
    # Latest proposal per day, in case they ever submit more than once.
    proposed_by_day: dict[int, list[str]] = {}
    for p in _PROPOSALS.get(session_id, []):
        if p["actor_name"] == record["actor_name"]:
            proposed_by_day[p["day_number"]] = p["dates"]

    w = _WINDOWS.get(session_id)
    ladder = _priority_rank(session_id)
    is_next = bool(ladder) and ladder[0] == token
    window_info = None
    if w:
        already_locked = bool(w["locked_block"])
        window_info = {
            "num_shoot_days": w["num_shoot_days"],
            "locked_block": w["locked_block"],
            "can_pick": is_next and not already_locked and bool(w["candidate_blocks"]),
            "waiting_on_higher_priority": (not is_next) and not already_locked,
            "candidate_blocks": w["candidate_blocks"] if (is_next and not already_locked) else [],
        }

    return {
        "project_name": record["project_name"],
        "actor_name": record["actor_name"],
        "proposed_period": record.get("proposed_period"),
        # The frontend needs this to call the lock endpoint
        # (POST /dates/{session_id}/lock/{token}) — the token alone
        # doesn't tell it which session's window to lock.
        "session_id": session_id,
        "window": window_info,
        "days": [
            {
                **d,
                "cancelled": d["day_number"] in cancelled_days,
                "confirmed": d["day_number"] in confirmed_days,
                "proposed_dates": proposed_by_day.get(d["day_number"], []),
            }
            for d in record["days"]
        ],
    }


class CancelRequest(BaseModel):
    day_number: int


@router.post("/{token}/cancel")
def cancel_day(token: str, req: CancelRequest) -> dict:
    record = _TOKENS.get(token)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    _record_cancellation(record["session_id"], record["actor_name"], req.day_number)
    return {"ok": True}


class ProposeRequest(BaseModel):
    day_number: int
    dates: list[str]
    # True when this is a rejection of an already-assigned day ("can't
    # make it, here's what would work instead"); False when it's just
    # normal upfront availability-gathering before any date is set,
    # which isn't a cancellation of anything real yet.
    also_cancel: bool = False

    @field_validator("dates")
    @classmethod
    def _validate_dates(cls, value: list[str]) -> list[str]:
        deduped = sorted(set(value))
        if len(deduped) < _MIN_PROPOSED_DATES:
            raise ValueError(f"At least {_MIN_PROPOSED_DATES} distinct dates are required.")
        for d in deduped:
            try:
                date.fromisoformat(d)
            except ValueError:
                raise ValueError(f"Invalid date: {d!r} — expected YYYY-MM-DD.") from None
        return deduped


def _send_receipt(record: dict, subject: str, body: str) -> None:
    """Best-effort confirmation receipt back to the person who just took
    an action — a courtesy copy, never a condition of the action itself.
    Silently does nothing if they have no email on file."""
    email = record.get("actor_email")
    if email:
        send_email(email, subject, body)


@router.post("/{token}/propose")
def propose_dates(token: str, req: ProposeRequest) -> dict:
    """Records a real set of dates this person says they ARE available —
    this is what lets the filmmaker later look for a date that overlaps
    across everyone's availability instead of guessing. Only also
    records a cancellation if this was an explicit rejection of an
    already-assigned day (also_cancel=True), not a plain availability
    submission before any date exists."""
    record = _TOKENS.get(token)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    session_id = record["session_id"]
    if req.also_cancel:
        _record_cancellation(session_id, record["actor_name"], req.day_number)
    _PROPOSALS.setdefault(session_id, []).append(
        {
            "actor_name": record["actor_name"],
            "day_number": req.day_number,
            "dates": req.dates,
            "submitted_at": time.time(),
        }
    )
    _send_receipt(
        record,
        f"{record['project_name']} — dates received for Day {req.day_number}",
        (
            f"Hi {record['actor_name']},\n\nWe received your proposed dates for "
            f"Day {req.day_number}: {', '.join(req.dates)}.\n\nWe'll confirm a "
            "final date once it's locked in."
        ),
    )
    return {"ok": True}


@router.post("/{token}/confirm")
def confirm_day(token: str, req: CancelRequest) -> dict:
    """Records an explicit "I can make it" — the positive counterpart to
    cancelling, so the filmmaker sees a real signal instead of just
    silence for every day nobody complained about."""
    record = _TOKENS.get(token)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    _record_confirmation(record["session_id"], record["actor_name"], req.day_number)
    day = next((d for d in record["days"] if d["day_number"] == req.day_number), None)
    date_str = day["date"] if day and day.get("date") else "TBD"
    _send_receipt(
        record,
        f"{record['project_name']} — you're confirmed for Day {req.day_number}",
        (
            f"Hi {record['actor_name']},\n\nThanks for confirming Day {req.day_number} "
            f"({date_str}). You're locked in — see you on set."
        ),
    )
    return {"ok": True}


@router.get("/session/{session_id}/cancellations")
def list_cancellations(session_id: str) -> list[dict]:
    return _CANCELLATIONS.get(session_id, [])


@router.get("/session/{session_id}/proposals")
def list_proposals(session_id: str) -> list[dict]:
    return _PROPOSALS.get(session_id, [])


@router.get("/session/{session_id}/confirmations")
def list_confirmations(session_id: str) -> list[dict]:
    return _CONFIRMATIONS.get(session_id, [])
