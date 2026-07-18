/** Local file attachments — blobs live in IndexedDB (not localStorage, which can't hold binary at scale). */

import type { Project, Task } from "@/types";

const DB_NAME = "crm-attachments-v1";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAttachmentBlob(id: string, file: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadAttachmentBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

export async function deleteAttachmentBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Soft cap so one attachment can't quietly blow up IndexedDB usage — surfaced in the UI as a rejection reason. */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB

// ── JSON export/import: attachment blobs don't live in AppData/localStorage, so a plain JSON
// backup silently drops every photo/file/cover — this bridges IndexedDB blobs into the export
// file and back. ─────────────────────────────────────────────────────────────────────────────

export interface AttachmentBlobDump {
  /** Base64-encoded blob bytes. */
  data: string;
  /** Original MIME type, so the re-created Blob round-trips as the same file. */
  type: string;
}

/** Every blob id referenced anywhere in the data model — task attachments, project cover/photos/files. */
export function collectAttachmentIds(tasks: Task[], projects: Project[]): string[] {
  const ids = new Set<string>();
  tasks.forEach((t) => t.attachments.forEach((a) => ids.add(a.id)));
  projects.forEach((p) => {
    if (p.coverAttachmentId) ids.add(p.coverAttachmentId);
    (p.photos ?? []).forEach((a) => ids.add(a.id));
    (p.files ?? []).forEach((a) => ids.add(a.id));
  });
  return [...ids];
}

/** btoa(String.fromCharCode(...bytes)) blows the call stack on large files — encode in chunks instead. */
export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  });
}

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Reads every listed blob out of IndexedDB and base64-encodes it for the JSON export file.
 * A ref'd id with no matching blob (e.g. IndexedDB was cleared separately from localStorage) is
 * skipped rather than failing the whole export — the metadata stays, just without a blob to restore. */
export async function exportAttachmentBlobs(ids: string[]): Promise<Record<string, AttachmentBlobDump>> {
  const out: Record<string, AttachmentBlobDump> = {};
  for (const id of ids) {
    const blob = await loadAttachmentBlob(id);
    if (!blob) continue;
    out[id] = { data: await blobToBase64(blob), type: blob.type };
  }
  return out;
}

/** Writes every dumped blob back into IndexedDB on import, keyed by its original id. */
export async function importAttachmentBlobs(dump: Record<string, AttachmentBlobDump>): Promise<void> {
  for (const [id, { data, type }] of Object.entries(dump)) {
    await saveAttachmentBlob(id, base64ToBlob(data, type));
  }
}
