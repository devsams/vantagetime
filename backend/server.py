"""
Thin REST wrapper around our ADK agent(s), for the Next.js frontend to call.

Uses ADK's own get_fast_api_app() helper — the same function `adk api_server`
calls internally — so we get the standard ADK REST endpoints (session
creation, /run) plus CORS configured for our frontend's origin.

Run from backend/ with:
    uvicorn server:app --port 8000 --reload
"""
import logging
import os

from dotenv import load_dotenv

# Must run before anything below reads os.environ — ADK's own agent
# loader reads backend/.env internally for the orchestrator/
# roster_extractor agents (which is why those have always worked
# without this), but that loading is private to ADK's own client
# construction and never touches the real process environment. Any
# code outside that path — like chat_routes.py's direct genai.Client()
# call — sees an empty environment unless we load it here ourselves.
load_dotenv()

from fastapi import Request
from fastapi.responses import JSONResponse
from google.adk.cli.fast_api import get_fast_api_app

from common.availability_routes import router as availability_router
from common.chat_routes import router as chat_router
from common.location_outreach_routes import router as location_outreach_router
from common.projects_routes import router as projects_router
from common.roster_import import router as roster_router

logger = logging.getLogger("vantagetime.server")

AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# Comma-separated list, e.g. "http://localhost:3000,https://vantagetime-frontend-xyz.run.app"
# Default covers a small range of local dev ports, not just 3000 — `next
# dev` silently auto-increments to 3001/3002/... whenever the previous
# port is still occupied (common with several projects' dev servers
# running at once), and a mismatched origin here fails as an opaque
# "Failed to fetch" in the browser with no CORS error message to point
# at the real cause. Set ALLOWED_ORIGINS explicitly for anything beyond
# local dev (e.g. the deployed frontend's real origin).
_DEFAULT_ORIGINS = ",".join(f"http://localhost:{p}" for p in range(3000, 3006))
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    allow_origins=ALLOWED_ORIGINS,
    web=False,  # production-safe endpoints only, no dev UI
)

# Plain REST routes for the actor availability magic-link flow — not part
# of the ADK agent pipeline, see common/availability_routes.py.
app.include_router(availability_router)

# Plain REST route for starting a production from a spreadsheet instead
# of a script — see common/roster_import.py.
app.include_router(roster_router)

# Plain REST route for the right-rail chat command center — mounted at
# /assistant, not /chat (see chat_routes.py for why) — see
# common/chat_routes.py.
app.include_router(chat_router)

# Plain REST route for emailing a location owner/contact from the
# Autopilot flow — see common/location_outreach_routes.py.
app.include_router(location_outreach_router)

# Durable Project/AppSettings persistence — replaces localStorage as the
# source of truth, see common/project_store.py for why and how.
app.include_router(projects_router)


# Without this, an unhandled exception mid-request drops the connection
# with no response body at all — the browser just reports "Failed to
# fetch" with zero information. This turns that into a real JSON 500 the
# frontend can show, with the traceback logged server-side.
@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )
