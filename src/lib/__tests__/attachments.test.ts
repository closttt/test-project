import { describe, it, expect } from "vitest";
import { collectAttachmentIds, blobToBase64, base64ToBlob } from "@/lib/attachments";
import type { Task, Project } from "@/types";

function task(attachmentIds: string[]): Task {
  return {
    id: "t1",
    title: "t",
    done: false,
    tags: [],
    important: false,
    priority: 0,
    spentMin: 0,
    links: [],
    comments: [],
    recurrence: "none",
    order: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    subtasks: [],
    attachments: attachmentIds.map((id) => ({ id, name: id, type: "image/png", size: 1, createdAt: "2026-01-01T00:00:00.000Z" })),
  } as Task;
}

function project(overrides: Partial<Project>): Project {
  return {
    id: "p1",
    name: "p",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Project;
}

describe("collectAttachmentIds", () => {
  it("gathers task attachment ids", () => {
    expect(collectAttachmentIds([task(["a", "b"])], [])).toEqual(["a", "b"]);
  });

  it("gathers project cover/photos/files ids", () => {
    const p = project({
      coverAttachmentId: "cover1",
      photos: [{ id: "photo1", name: "x", type: "image/png", size: 1, createdAt: "2026-01-01T00:00:00.000Z" }],
      files: [{ id: "file1", name: "y", type: "application/pdf", size: 1, createdAt: "2026-01-01T00:00:00.000Z" }],
    });
    expect(collectAttachmentIds([], [p]).sort()).toEqual(["cover1", "file1", "photo1"].sort());
  });

  it("de-duplicates ids referenced more than once", () => {
    const p = project({ coverAttachmentId: "shared" });
    const t = task(["shared"]);
    expect(collectAttachmentIds([t], [p])).toEqual(["shared"]);
  });

  it("returns [] when nothing has attachments", () => {
    expect(collectAttachmentIds([task([])], [project({})])).toEqual([]);
  });

  it("tolerates projects with no photos/files arrays at all (older saves)", () => {
    const p = project({ coverAttachmentId: undefined });
    expect(collectAttachmentIds([], [p])).toEqual([]);
  });
});

describe("blobToBase64 / base64ToBlob round-trip", () => {
  it("round-trips small text content byte-for-byte", async () => {
    const original = new Blob(["hello world"], { type: "text/plain" });
    const b64 = await blobToBase64(original);
    const restored = base64ToBlob(b64, "text/plain");
    expect(restored.type).toBe("text/plain");
    expect(await restored.text()).toBe("hello world");
  });

  it("round-trips arbitrary binary bytes (including 0x00 and high bytes) exactly", async () => {
    const bytes = new Uint8Array(300);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const original = new Blob([bytes], { type: "application/octet-stream" });
    const b64 = await blobToBase64(original);
    const restored = base64ToBlob(b64, "application/octet-stream");
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    expect(restoredBytes).toEqual(bytes);
  });

  it("round-trips a blob larger than the 0x8000 chunk boundary without corruption", async () => {
    const size = 0x8000 * 3 + 17; // spans multiple chunks, not a clean multiple
    const bytes = new Uint8Array(size);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    const original = new Blob([bytes], { type: "image/png" });
    const b64 = await blobToBase64(original);
    const restored = base64ToBlob(b64, "image/png");
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    expect(restoredBytes.length).toBe(bytes.length);
    expect(restoredBytes).toEqual(bytes);
  });

  it("round-trips an empty blob", async () => {
    const original = new Blob([], { type: "text/plain" });
    const b64 = await blobToBase64(original);
    const restored = base64ToBlob(b64, "text/plain");
    expect(restored.size).toBe(0);
  });
});
