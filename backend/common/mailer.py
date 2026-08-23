"""Real email sending for the actor/crew availability flow, via any local
SMTP catcher (Mailpit by default) — deliberately NOT a transactional email
service, since this project never needs to reach a real inbox: Mailpit
catches everything sent to it and shows it in a local web UI (localhost:8025
by default) instead of actually delivering it, which is exactly what you
want while testing an outreach flow without spamming real people.

Best-effort by design: a mail failure (Mailpit not running, wrong
host/port) must never break registration, confirmation, or proposing
dates — those are the real actions; the email is a courtesy copy of
what already happened.
"""
import logging
import os
import smtplib
from email.mime.text import MIMEText

logger = logging.getLogger("vantagetime.mailer")

MAILPIT_HOST = os.environ.get("MAILPIT_HOST", "localhost")
MAILPIT_PORT = int(os.environ.get("MAILPIT_PORT", "1025"))
MAIL_FROM = os.environ.get("MAIL_FROM", "VantageTime <noreply@vantagetime.local>")


def send_email(to: str, subject: str, body: str) -> dict:
    """Sends a plain-text email via SMTP to MAILPIT_HOST:MAILPIT_PORT.

    Returns {"sent": True} on success, or {"sent": False, "reason": str}
    on any failure (no recipient, connection refused, etc.) — callers
    should treat this as informational, never as a reason to fail the
    request that triggered it.
    """
    to = (to or "").strip()
    if not to:
        return {"sent": False, "reason": "no recipient address on file"}

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = MAIL_FROM
    msg["To"] = to

    try:
        with smtplib.SMTP(MAILPIT_HOST, MAILPIT_PORT, timeout=5) as server:
            server.send_message(msg)
        return {"sent": True}
    except Exception as e:
        logger.warning("send_email to %s failed: %s", to, e)
        return {"sent": False, "reason": str(e)}
