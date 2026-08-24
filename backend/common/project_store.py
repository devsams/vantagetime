"""Server-side persistence for Project and AppSettings.

Before this, every VantageTime project lived only in one browser's
localStorage — no backup, unreachable from a second device, and gone
the moment localStorage is cleared or its quota is hit (the frontend
already has a fallback that silently drops the uploaded script rather
than lose the rest of the project when that happens). This module is
the durable copy. The frontend still keeps localStorage as a fast local
cache for instant paint on load, but this is now the source of truth —
every write goes here first.

Two implementations, selected automatically by whether GOOGLE_CLOUD_PROJECT
is set:
  - FirestoreProjectStore — real Firestore, for an actual deployment.
    Chosen deliberately over a SQL database: Project's shape has kept
    growing all through this project's development (new fields backfilled
    onto old saved data over and over — see frontend/src/lib/storage.ts),
    and Firestore's schemaless documents absorb that without a migration
    every time, unlike a fixed SQL table.
  - InMemoryProjectStore — a plain dict, resetting on every server
    restart. Used automatically when there's no GCP project configured
    (local dev without cloud credentials, and the sandbox this was built
    and tested in) — same pattern availability_routes.py already uses
    for its own state, just applied to project data.

Project.sourceDocument (the uploaded script/roster PDF as a base64 data
URL) is too large to store inline in a Firestore document — routinely
hundreds of KB, past Firestore's 1MiB cap — so it's stripped out here
and handed to blob_store.py, replaced in the stored document by a
blobKey. Callers of this module (projects_routes.py) never see that
detail: get_project() hands back a project with sourceDocument.dataUrl
reconstituted, exactly the shape the frontend already expects.
"""
import base64
import logging
import os
import uuid
from typing import Protocol

from .blob_store import get_blob_store

logger = logging.getLogger("vantagetime.project_store")

GOOGLE_CLOUD_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
_SETTINGS_DOC_ID = "global"  # single shared settings doc — no auth/multi-user yet, see PLAN.md


class ProjectStore(Protocol):
    def list_projects(self) -> list[dict]: ...
    def get_project(self, project_id: str) -> dict | None: ...
    def upsert_project(self, project_id: str, data: dict) -> dict: ...
    def delete_project(self, project_id: str) -> None: ...
    def get_settings(self) -> dict | None: ...
    def put_settings(self, data: dict) -> dict: ...


def _preserve_source_document(existing: dict | None, incoming: dict) -> dict:
    """The uploaded PDF (routinely hundreds of KB, base64-encoded) never
    changes after the initial upload, so the frontend only sends it once
    on creation and omits it from every routine sync afterward — resending
    it on every save (a cast email, a task, anything) would be wasteful
    and slow. When the incoming payload's sourceDocument has no new bytes
    to store (no dataUrl, no existing blobKey of its own) but this project
    already has a stored document, keep the existing one instead of
    overwriting it with a stripped-down {name, mimeType} placeholder."""
    incoming = dict(incoming)
    new_doc = incoming.get("sourceDocument")
    if new_doc and not new_doc.get("dataUrl") and not new_doc.get("blobKey"):
        if existing and existing.get("sourceDocument"):
            incoming["sourceDocument"] = existing["sourceDocument"]
    return incoming


def _extract_source_document(data: dict) -> dict:
    """Pulls the base64 dataUrl (if any) out of a Project payload before
    it's stored, saving the bytes to the blob store and leaving a
    lightweight {name, mimeType, blobKey} reference behind instead.
    Mutates a copy, never the caller's dict."""
    data = dict(data)
    doc = data.get("sourceDocument")
    if not doc or not doc.get("dataUrl"):
        return data
    data_url: str = doc["dataUrl"]
    # "data:<mime>;base64,<payload>" — same format frontend/src/lib/files.ts
    # already produces; split defensively in case it's ever missing the prefix.
    b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
    raw = base64.b64decode(b64)
    blob_key = doc.get("blobKey") or f"{uuid.uuid4()}.bin"
    get_blob_store().save(blob_key, raw)
    data["sourceDocument"] = {"name": doc.get("name", ""), "mimeType": doc.get("mimeType", ""), "blobKey": blob_key}
    return data


def _hydrate_source_document(data: dict) -> dict:
    """The inverse of _extract_source_document — reads the blob back and
    rebuilds the data URL, so a caller reading a project back out never
    needs to know blob storage is involved at all."""
    doc = data.get("sourceDocument")
    if not doc or not doc.get("blobKey"):
        return data
    raw = get_blob_store().load(doc["blobKey"])
    if raw is None:
        logger.warning("sourceDocument blob %s missing from blob store", doc["blobKey"])
        return data
    data = dict(data)
    mime = doc.get("mimeType", "application/octet-stream")
    data["sourceDocument"] = {
        "name": doc.get("name", ""),
        "mimeType": mime,
        "dataUrl": f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}",
    }
    return data


class InMemoryProjectStore:
    """Resets on every server restart — fine for local dev/testing, not
    for a real deployment. See module docstring for when this is picked."""

    def __init__(self):
        self._projects: dict[str, dict] = {}
        self._settings: dict | None = None

    def list_projects(self) -> list[dict]:
        return [_hydrate_source_document(p) for p in self._projects.values()]

    def get_project(self, project_id: str) -> dict | None:
        p = self._projects.get(project_id)
        return _hydrate_source_document(p) if p is not None else None

    def upsert_project(self, project_id: str, data: dict) -> dict:
        existing = self._projects.get(project_id)
        data = _preserve_source_document(existing, data)
        stored = _extract_source_document(data)
        self._projects[project_id] = stored
        return _hydrate_source_document(stored)

    def delete_project(self, project_id: str) -> None:
        self._projects.pop(project_id, None)

    def get_settings(self) -> dict | None:
        return self._settings

    def put_settings(self, data: dict) -> dict:
        self._settings = data
        return data


class FirestoreProjectStore:
    """Real Firestore. Requires real credentials — Application Default
    Credentials locally (`gcloud auth application-default login`), or
    the Cloud Run service's own service account once deployed."""

    def __init__(self, project_id: str):
        from google.cloud import firestore  # deferred: only imported if actually used

        self._db = firestore.Client(project=project_id)
        self._projects = self._db.collection("projects")
        self._settings = self._db.collection("settings")

    def list_projects(self) -> list[dict]:
        return [_hydrate_source_document(doc.to_dict()) for doc in self._projects.stream()]

    def get_project(self, project_id: str) -> dict | None:
        snap = self._projects.document(project_id).get()
        if not snap.exists:
            return None
        return _hydrate_source_document(snap.to_dict())

    def upsert_project(self, project_id: str, data: dict) -> dict:
        doc_ref = self._projects.document(project_id)
        existing_snap = doc_ref.get()
        existing = existing_snap.to_dict() if existing_snap.exists else None
        data = _preserve_source_document(existing, data)
        stored = _extract_source_document(data)
        doc_ref.set(stored)
        return _hydrate_source_document(stored)

    def delete_project(self, project_id: str) -> None:
        self._projects.document(project_id).delete()

    def get_settings(self) -> dict | None:
        snap = self._settings.document(_SETTINGS_DOC_ID).get()
        return snap.to_dict() if snap.exists else None

    def put_settings(self, data: dict) -> dict:
        self._settings.document(_SETTINGS_DOC_ID).set(data)
        return data


_store: ProjectStore | None = None


def get_store() -> ProjectStore:
    global _store
    if _store is None:
        if GOOGLE_CLOUD_PROJECT:
            logger.info("project_store: using Firestore, project=%s", GOOGLE_CLOUD_PROJECT)
            _store = FirestoreProjectStore(GOOGLE_CLOUD_PROJECT)
        else:
            logger.info("project_store: no GOOGLE_CLOUD_PROJECT set, using in-memory store (resets on restart)")
            _store = InMemoryProjectStore()
    return _store
