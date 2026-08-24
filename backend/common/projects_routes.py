"""Plain REST routes for durable Project/AppSettings persistence — see
project_store.py for the storage itself. This is the server-side
replacement for what used to live only in the browser's localStorage.

Deliberately schema-loose: a Project's shape has kept growing all
through this app's development (new fields backfilled onto old saved
data — see frontend/src/lib/storage.ts), so these routes accept and
return plain JSON dicts rather than a rigid Pydantic model that would
need updating every time the frontend adds a field. The one exception
is the request/response wrapper shapes below, which are stable.

No auth yet — every project is visible to anyone who can reach this
API, same as today's no-login reality (see PLAN.md). Fine for a single
filmmaker's own deployment; revisit before this is ever multi-tenant.
"""
from typing import Any

from fastapi import APIRouter, HTTPException

from .project_store import get_store

router = APIRouter(tags=["projects"])


@router.get("/projects")
def list_projects() -> list[dict]:
    return get_store().list_projects()


@router.get("/projects/{project_id}")
def get_project(project_id: str) -> dict:
    project = get_store().get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/projects/{project_id}")
def upsert_project(project_id: str, payload: dict[str, Any]) -> dict:
    """Full-document upsert — the frontend always sends the complete,
    current Project object, same as it currently writes the complete
    object to localStorage on every change. Creates the project if this
    id hasn't been seen before."""
    return get_store().upsert_project(project_id, payload)


@router.delete("/projects/{project_id}")
def delete_project(project_id: str) -> dict:
    get_store().delete_project(project_id)
    return {"deleted": True}


@router.get("/settings")
def get_settings() -> dict:
    settings = get_store().get_settings()
    return settings if settings is not None else {}


@router.put("/settings")
def put_settings(payload: dict[str, Any]) -> dict:
    return get_store().put_settings(payload)
