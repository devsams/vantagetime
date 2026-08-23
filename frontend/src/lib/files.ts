/** Helpers for keeping a viewable copy of an uploaded document around.
 *
 * The file is stored as a data URL (so it round-trips through
 * localStorage as plain JSON, same as everything else in Project
 * state) — but a multi-megabyte data URL is a bad thing to actually
 * navigate the browser to directly (very large URLs can hit browser
 * limits, and it bloats the address bar). So storage uses a data URL,
 * while VIEWING converts it to a short-lived blob: URL just-in-time. */

// localStorage is commonly capped around 5-10MB per origin, shared
// across every project. Base64 inflates a file by ~33%, and this is
// only ONE convenience feature — not worth risking the whole app's
// saved state over a single large upload, so anything bigger than this
// just doesn't get a stored copy (everything else about it still works
// normally; only "view original document" is unavailable).
const MAX_STORED_DOCUMENT_BYTES = 4 * 1024 * 1024;

export function shouldStoreDocument(file: File): boolean {
  return file.size <= MAX_STORED_DOCUMENT_BYTES;
}

export function toDataUrl(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`;
}

/** Converts a stored data URL back into a real, openable URL. Always
 * revoke the result with URL.revokeObjectURL once the viewer/tab using
 * it is closed, so these don't leak for the life of the page. */
export async function dataUrlToObjectUrl(dataUrl: string): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
