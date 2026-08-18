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
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

router = APIRouter(prefix="/availability", tags=["availability"])

_TOKENS: dict[str, dict] = {}  # token -> {session_id, project_name, actor_name, days}
_CANCELLATIONS: dict[str, list[dict]] = {}  # session_id -> [{actor_name, day_number, cancelled_at}]
_PROPOSALS: dict[str, list[dict]] = {}  # session_id -> [{actor_name, day_number, dates, submitted_at}]
_CONFIRMATIONS: dict[str, list[dict]] = {}  # session_id -> [{actor_name, day_number, confirmed_at}]

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


class RegisterRequest(BaseModel):
    session_id: str
    project_name: str
    actors: list[RegisterActor]
    # A soft target window the filmmaker is aiming for, shown to every
    # actor/crew member on this call so their availability answers have
    # real context — distinct from the hard per-day "date" fields above,
    # which only exist once assign_calendar_dates has actually run.
    proposed_period: ProposedPeriod | None = None


class RegisterResponseItem(BaseModel):
    name: str
    token: str


@router.post("/register", response_model=list[RegisterResponseItem])
def register(req: RegisterRequest) -> list[RegisterResponseItem]:
    """Generates one fresh token per actor and remembers their scheduled
    days. Re-registering the same project overwrites nothing — old
    tokens for a prior schedule version stay valid but point at stale
    day lists, which is an acceptable tradeoff for a demo (a real
    deployment would invalidate old tokens on reschedule)."""
    result = []
    for actor in req.actors:
        token = secrets.token_urlsafe(8)
        _TOKENS[token] = {
            "session_id": req.session_id,
            "project_name": req.project_name,
            "actor_name": actor.name,
            "days": [d.model_dump() for d in actor.scheduled_days],
            "proposed_period": req.proposed_period.model_dump() if req.proposed_period else None,
        }
        result.append(RegisterResponseItem(name=actor.name, token=token))
    return result


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

    return {
        "project_name": record["project_name"],
        "actor_name": record["actor_name"],
        "proposed_period": record.get("proposed_period"),
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
