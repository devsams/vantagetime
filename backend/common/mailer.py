"""Real email sending for the actor/crew availability flow.

Talks to whatever's at MAILPIT_HOST:MAILPIT_PORT — a local SMTP catcher
(Mailpit, https://mailpit.axllent.org) by default for dev, where nothing
actually leaves the machine, or a real SMTP relay (e.g. Gmail's
smtp.gmail.com:587) in production once SMTP_USER/SMTP_PASSWORD are set.
Same code path either way; only the env vars change.

Best-effort by design: a mail failure (Mailpit not running, wrong
host/port, bad credentials) must never break registration, confirmation,
or proposing dates — those are the real actions; the email is a courtesy
copy of what already happened.
"""
import logging
import os
import smtplib
from email.mime.text import MIMEText

logger = logging.getLogger("vantagetime.mailer")

MAILPIT_HOST = os.environ.get("MAILPIT_HOST", "localhost")
MAILPIT_PORT = int(os.environ.get("MAILPIT_PORT", "1025"))
MAIL_FROM = os.environ.get("MAIL_FROM", "VantageTime <noreply@vantagetime.local>")

# Only set for a real relay (Mailpit needs neither) — presence of
# SMTP_USER is what decides whether we authenticate/STARTTLS at all, so
# local dev against Mailpit keeps working with zero config.
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
# Defaults to on whenever credentials are present (every real relay
# worth using requires it on 587); set SMTP_USE_TLS=false to force off
# for a relay that's plaintext-only on its configured port.
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true" if SMTP_USER else "false").lower() == "true"


def send_email(to: str, subject: str, body: str) -> dict:
    """Sends a plain-text email via SMTP to MAILPIT_HOST:MAILPIT_PORT.

    Returns {"sent": True} on success, or {"sent": False, "reason": str}
    on any failure (no recipient, connection refused, bad auth, etc.) —
    callers should treat this as informational, never as a reason to
    fail the request that triggered it.
    """
    to = (to or "").strip()
    if not to:
        return {"sent": False, "reason": "no recipient address on file"}

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = MAIL_FROM
    msg["To"] = to

    try:
        with smtplib.SMTP(MAILPIT_HOST, MAILPIT_PORT, timeout=10) as server:
            if SMTP_USE_TLS:
                server.starttls()
            if SMTP_USER:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        return {"sent": True}
    except Exception as e:
        logger.warning("send_email to %s failed: %s", to, e)
        return {"sent": False, "reason": str(e)}
