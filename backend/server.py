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

from fastapi import Request
from fastapi.responses import JSONResponse
from google.adk.cli.fast_api import get_fast_api_app

from common.availability_routes import router as availability_router

logger = logging.getLogger("vantagetime.server")

AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# Comma-separated list, e.g. "http://localhost:3000,https://vantagetime-frontend-xyz.run.app"
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    allow_origins=ALLOWED_ORIGINS,
    web=False,  # production-safe endpoints only, no dev UI
)

# Plain REST routes for the actor availability magic-link flow — not part
# of the ADK agent pipeline, see common/availability_routes.py.
app.include_router(availability_router)


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
