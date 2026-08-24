"""Storage for large binary blobs — specifically the uploaded script/
roster PDFs kept on Project.sourceDocument. These routinely run into the
hundreds of KB, well past Firestore's 1MiB-per-document cap, so they
can't live inline in the same document as the rest of the project. This
module stores just the bytes, keyed by an opaque key; project_store.py
is what decides when to call it.

Two implementations, selected automatically:
  - GCSBlobStore, when GCS_BUCKET is set — real Cloud Storage, for a
    real deployment (Cloud Run instances have no durable local disk of
    their own, so this is required once actually deployed, not
    optional).
  - LocalBlobStore, otherwise — plain files under backend/data/blobs/,
    for local dev and the sandbox this was built in, where there's no
    GCS bucket or credentials to reach one.

Either way, callers never touch a URL or a filesystem path directly —
save() returns an opaque key, load() takes that key back. Swapping
implementations never changes projects_routes.py.
"""
import logging
import os
from pathlib import Path
from typing import Protocol

logger = logging.getLogger("vantagetime.blob_store")

GCS_BUCKET = os.environ.get("GCS_BUCKET", "").strip()
_LOCAL_BLOB_DIR = Path(os.path.dirname(os.path.abspath(__file__))).parent / "data" / "blobs"


class BlobStore(Protocol):
    def save(self, key: str, data: bytes) -> None: ...
    def load(self, key: str) -> bytes | None: ...
    def delete(self, key: str) -> None: ...


class LocalBlobStore:
    """Plain files on local disk. Fine for local dev — NOT fine for a
    real Cloud Run deployment, where local disk doesn't survive a
    restart or scale-out to a second instance. Set GCS_BUCKET before
    deploying for real; see GCSBlobStore below."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Keys are always our own generated uuids (see project_store.py) —
        # never derived from user-controlled filenames — so this is safe
        # from path traversal without needing to sanitize further.
        return self.root / key

    def save(self, key: str, data: bytes) -> None:
        self._path(key).write_bytes(data)

    def load(self, key: str) -> bytes | None:
        path = self._path(key)
        if not path.exists():
            return None
        return path.read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class GCSBlobStore:
    """Real Cloud Storage — what a deployed instance actually needs,
    since Cloud Run containers have no durable local disk. Requires the
    google-cloud-storage package and real credentials (Application
    Default Credentials — `gcloud auth application-default login`
    locally, or the Cloud Run service's own service account once
    deployed)."""

    def __init__(self, bucket_name: str):
        from google.cloud import storage  # deferred: only imported if actually used

        self._client = storage.Client()
        self._bucket = self._client.bucket(bucket_name)

    def save(self, key: str, data: bytes) -> None:
        self._bucket.blob(key).upload_from_string(data)

    def load(self, key: str) -> bytes | None:
        blob = self._bucket.blob(key)
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    def delete(self, key: str) -> None:
        blob = self._bucket.blob(key)
        if blob.exists():
            blob.delete()


_store: BlobStore | None = None


def get_blob_store() -> BlobStore:
    global _store
    if _store is None:
        if GCS_BUCKET:
            logger.info("blob_store: using GCS bucket %s", GCS_BUCKET)
            _store = GCSBlobStore(GCS_BUCKET)
        else:
            logger.info("blob_store: no GCS_BUCKET set, using local disk at %s", _LOCAL_BLOB_DIR)
            _store = LocalBlobStore(_LOCAL_BLOB_DIR)
    return _store
