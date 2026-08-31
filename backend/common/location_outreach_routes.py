"""Plain REST routes for the location owner flow — a direct "we'll draft
it, you send it" email (see frontend AutopilotSection.tsx) plus a magic
link a location owner can open themselves to confirm (or flag an issue
with) the shoot dates at their location, no email delivery required.

Deliberately NOT an ADK agent: the email subject/body are drafted
client-side from real project data (location name, dates, contact name
— see lib/locationOutreach.ts), and the filmmaker reviews/edits before
sending. The magic-link half below is a direct copy of the actor
availability flow's shape (see availability_routes.py) trimmed to what a
location actually needs — confirm/decline per scheduled day, no
priority-ladder date-picking, since locations don't participate in
that negotiation.

Storage is in-memory and resets on server restart — same tradeoff as
availability_routes.py, acceptable for a demo.
"""
import secrets
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .mailer import send_email

router = APIRouter(prefix="/locations", tags=["locations"])

_LOCATION_TOKENS: dict[str, dict] = {}  # token -> {session_id, project_name, location_name, location_email, days}
_LOCATION_CONFIRMATIONS: dict[str, list[dict]] = {}  # session_id -> [{location_name, day_number, confirmed_at}]
_LOCATION_DECLINES: dict[str, list[dict]] = {}  # session_id -> [{location_name, day_number, reason, declined_at}]


class NotifyRequest(BaseModel):
    session_id: str
    location: str
    to: str
    subject: str
    body: str


class NotifyResponse(BaseModel):
    sent: bool
    reason: str | None = None


@router.post("/notify", response_model=NotifyResponse)
def notify_location_owner(req: NotifyRequest) -> NotifyResponse:
    result = send_email(req.to, req.subject, req.body)
    return NotifyResponse(sent=result["sent"], reason=result.get("reason"))


# --- Location confirm magic-link flow ---


class LocationScheduledDay(BaseModel):
    day_number: int
    date: str = ""  # "YYYY-MM-DD", empty if no shoot window has been set yet
    hours_needed: float = 0


class RegisterLocation(BaseModel):
    name: str
    scheduled_days: list[LocationScheduledDay]
    # Same pattern as cast registration: all three present -> a real
    # email actually goes out (best-effort); any missing -> the token
    # still gets created and the frontend falls back to "Copy email".
    email: str = ""
    email_subject: str = ""
    email_body: str = ""


class RegisterLocationsRequest(BaseModel):
    session_id: str
    project_name: str
    locations: list[RegisterLocation]
    frontend_base_url: str = ""


class RegisterLocationResponseItem(BaseModel):
    name: str
    token: str
    email_sent: bool = False
    email_status: str = ""


@router.post("/register", response_model=list[RegisterLocationResponseItem])
def register_locations(req: RegisterLocationsRequest) -> list[RegisterLocationResponseItem]:
    """Generates one fresh token per location and remembers its scheduled
    days. Re-registering the same location overwrites nothing — same
    accepted tradeoff as cast registration."""
    result = []
    for loc in req.locations:
        token = secrets.token_urlsafe(8)
        _LOCATION_TOKENS[token] = {
            "session_id": req.session_id,
            "project_name": req.project_name,
            "location_name": loc.name,
            "location_email": loc.email,
            "days": [d.model_dump() for d in loc.scheduled_days],
        }

        email_sent = False
        email_status = "no email on file"
        if loc.email and loc.email_subject and loc.email_body:
            link_line = (
                f"\n\nConfirm here: {req.frontend_base_url}/locations/{token}"
                if req.frontend_base_url
                else ""
            )
            outcome = send_email(loc.email, loc.email_subject, loc.email_body + link_line)
            email_sent = outcome["sent"]
            email_status = "sent" if email_sent else outcome.get("reason", "send failed")

        result.append(
            RegisterLocationResponseItem(name=loc.name, token=token, email_sent=email_sent, email_status=email_status)
        )
    return result


@router.get("/confirm/{token}")
def get_location_view(token: str) -> dict:
    record = _LOCATION_TOKENS.get(token)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    session_id = record["session_id"]
    confirmed_days = {
        c["day_number"]
        for c in _LOCATION_CONFIRMATIONS.get(session_id, [])
        if c["location_name"] == record["location_name"]
    }
    declined_days = {
        c["day_number"]
        for c in _LOCATION_DECLINES.get(session_id, [])
        if c["location_name"] == record["location_name"]
    }

    return {
        "project_name": record["project_name"],
        "location_name": record["location_name"],
        "days": [
            {
                **d,
                "confirmed": d["day_number"] in confirmed_days,
                "declined": d["day_number"] in declined_days,
            }
            for d in record["days"]
        ],
    }


class LocationDayRequest(BaseModel):
    day_number: int


@router.post("/confirm/{token}/confirm")
def confirm_location_day(token: str, req: LocationDayRequest) -> dict:
    record = _LOCATION_TOKENS.get(token)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    session_id = record["session_id"]
    existing = _LOCATION_CONFIRMATIONS.setdefault(session_id, [])
    if not any(c["location_name"] == record["location_name"] and c["day_number"] == req.day_number for c in existing):
        existing.append(
            {"location_name": record["location_name"], "day_number": req.day_number, "confirmed_at": time.time()}
        )
    # A later confirm always wins over an earlier decline for the same day.
    declines = _LOCATION_DECLINES.get(session_id, [])
    declines[:] = [
        d for d in declines if not (d["location_name"] == record["location_name"] and d["day_number"] == req.day_number)
    ]
    return {"ok": True}


class LocationDeclineRequest(BaseModel):
    day_number: int
    reason: str = ""


@router.post("/confirm/{token}/decline")
def decline_location_day(token: str, req: LocationDeclineRequest) -> dict:
    record = _LOCATION_TOKENS.get(token)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown or expired link")

    session_id = record["session_id"]
    existing = _LOCATION_DECLINES.setdefault(session_id, [])
    if not any(d["location_name"] == record["location_name"] and d["day_number"] == req.day_number for d in existing):
        existing.append(
            {
                "location_name": record["location_name"],
                "day_number": req.day_number,
                "reason": req.reason,
                "declined_at": time.time(),
            }
        )
    confirmations = _LOCATION_CONFIRMATIONS.get(session_id, [])
    confirmations[:] = [
        c for c in confirmations if not (c["location_name"] == record["location_name"] and c["day_number"] == req.day_number)
    ]
    return {"ok": True}


@router.get("/session/{session_id}/confirmations")
def list_location_confirmations(session_id: str) -> list[dict]:
    return _LOCATION_CONFIRMATIONS.get(session_id, [])


@router.get("/session/{session_id}/declines")
def list_location_declines(session_id: str) -> list[dict]:
    return _LOCATION_DECLINES.get(session_id, [])
