"""Plain REST route for notifying a location owner/contact by email —
part of the Autopilot flow (see frontend AutopilotSection.tsx).

Deliberately NOT an ADK agent: the email subject/body are drafted
client-side from real project data (location name, dates, contact name
— see lib/locationOutreach.ts), and the filmmaker reviews/edits before
sending. This endpoint's only job is the actual SMTP send, via the same
best-effort mailer the cast/crew availability flow already uses (see
mailer.py) — so location outreach lands in the same local Mailpit
catcher during development, no separate email infrastructure needed.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from .mailer import send_email

router = APIRouter(prefix="/locations", tags=["locations"])


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
