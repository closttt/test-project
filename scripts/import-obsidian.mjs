/**
 * One-off: moves an Obsidian vault into «Конспекты» (Supabase `knowledge_notes`) together with
 * its pictures and files. The in-app import only reads .md text; this one also
 *   - uploads every attachment a note uses (![[x.png]], [[photo.jpg]], ![](x.png), ![[doc.pdf]])
 *     to the public `library-covers` bucket under `notes/` and points the note at it;
 *   - turns [[Note]] / [[Note|alias]] into links that open that note inside the CRM;
 *   - drops a YAML frontmatter block, skips `.obsidian/`, `.trash/` and the task folders.
 *
 *   node scripts/import-obsidian.mjs "C:\Users\me\Documents\Obsidian Vault" --dry   # preview
 *   node scripts/import-obsidian.mjs "C:\Users\me\Documents\Obsidian Vault"         # import
 *
 * Refuses to run when the vault already has notes (pass --force to import on top anyway).
 * Uploads are content-addressed, so a re-run reuses the files already in the bucket.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const VAULT = args.find((a) => !a.startsWith("--"));
if (!VAULT || !fs.existsSync(VAULT)) {
  console.error("Usage: node scripts/import-obsidian.mjs <vault folder> [--dry] [--force]");
  process.exit(1);
}

/** Folders that hold Obsidian plugin data (TaskNotes tasks, the kanban), not notes. */
const SKIP_DIRS = new Set(["TaskNotes", "✅ Kanban-доска"]);
const BUCKET = "library-covers";
const PREFIX = "notes";
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp", pdf: "application/pdf", mp4: "video/mp4",
  mov: "video/quicktime", mp3: "audio/mpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ── Supabase ──────────────────────────────────────────────────────────────────────────────

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// ── Walk the vault ────────────────────────────────────────────────────────────────────────

const notes = []; // { rel, dir, name, abs, stat }
const files = []; // attachments: { rel, name, abs }
(function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".")) continue;
    const abs = path.join(dir, d.name);
    const rel = path.relative(VAULT, abs).split(path.sep).join("/");
    if (d.isDirectory()) {
      if (!SKIP_DIRS.has(d.name)) walk(abs);
    } else if (/\.md$/i.test(d.name)) {
      notes.push({ rel, dir: path.posix.dirname(rel), name: d.name.replace(/\.md$/i, ""), abs, stat: fs.statSync(abs) });
    } else if (!/\.base$/i.test(d.name)) {
      files.push({ rel, name: d.name, abs });
    }
  }
})(VAULT);
notes.sort((a, b) => a.rel.localeCompare(b.rel, "ru", { numeric: true }));

// Obsidian resolves [[x]] by a path or, most often, by the bare file name.
const key = (s) => s.normalize("NFC").toLowerCase();
const noteBy = new Map();
for (const n of notes) {
  n.id = randomUUID();
  noteBy.set(key(n.rel.replace(/\.md$/i, "")), n);
  if (!noteBy.has(key(n.name))) noteBy.set(key(n.name), n);
}
const fileBy = new Map();
for (const f of files) {
  fileBy.set(key(f.rel), f);
  if (!fileBy.has(key(f.name))) fileBy.set(key(f.name), f);
}

// ── Folders: every directory that holds a note ───────────────────────────────────────────

const now = new Date().toISOString();
const folders = new Map(); // rel dir → row
function folderId(dir) {
  if (dir === ".") return null;
  if (folders.has(dir)) return folders.get(dir).id;
  const parent = folderId(path.posix.dirname(dir));
  const row = { id: randomUUID(), kind: "folder", parent_id: parent, title: path.posix.basename(dir), content: "", created_at: now, updated_at: now };
  folders.set(dir, row);
  return row.id;
}

// ── Attachments ───────────────────────────────────────────────────────────────────────────

const uploaded = new Map(); // abs → public url
const missing = new Set();
async function urlFor(f) {
  if (uploaded.has(f.abs)) return uploaded.get(f.abs);
  const buf = fs.readFileSync(f.abs);
  const ext = (f.name.split(".").pop() || "bin").toLowerCase();
  const object = `${PREFIX}/${createHash("sha1").update(buf).digest("hex").slice(0, 16)}.${ext}`;
  if (!DRY) {
    const { error } = await db.storage.from(BUCKET).upload(object, buf, { contentType: MIME[ext] ?? "application/octet-stream", upsert: false });
    if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`${f.rel}: ${error.message}`);
  }
  const url = db.storage.from(BUCKET).getPublicUrl(object).data.publicUrl;
  uploaded.set(f.abs, url);
  return url;
}

function findFile(target, fromDir) {
  const t = target.replace(/^\.\//, "");
  return fileBy.get(key(path.posix.join(fromDir, t))) ?? fileBy.get(key(t)) ?? fileBy.get(key(path.posix.basename(t)));
}

// ── Note body ─────────────────────────────────────────────────────────────────────────────

async function replaceAsync(s, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(re)) {
    parts.push(s.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  return parts.join("") + s.slice(last);
}

const block = (md) => `\n\n${md}\n\n`;

async function convertText(text, n) {
  // [[target#heading|alias]] and ![[…]] — notes, pictures and files alike.
  text = await replaceAsync(text, /(!?)\[\[([^\]|#\n]*)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, async (whole, _bang, rawTarget, _hash, alias) => {
    const target = rawTarget.trim();
    const label = (alias ?? "").trim();
    if (/\.[a-z0-9]{2,5}$/i.test(target) && !/\.md$/i.test(target)) {
      const f = findFile(target, n.dir);
      if (!f) { missing.add(`${n.rel} → ${target}`); return whole; }
      const url = await urlFor(f);
      // A |300 alias is Obsidian's width, not a caption.
      const caption = label && !/^\d+(x\d+)?$/.test(label) ? label : f.name.replace(/\.[^.]+$/, "");
      return IMAGE.test(f.name) ? block(`![${caption}](${url})`) : `[📎 ${f.name}](${url})`;
    }
    const hit = target ? noteBy.get(key(target.replace(/\.md$/i, ""))) ?? noteBy.get(key(path.posix.basename(target).replace(/\.md$/i, ""))) : null;
    const shown = label || target || whole;
    return hit ? `[${shown}](#note-${hit.id})` : shown;
  });
  // ![alt](relative/path.png) — markdown embeds pointing into the vault.
  text = await replaceAsync(text, /!\[([^\]\n]*)\]\((?!https?:|data:)<?([^)>\n]+?)>?\)/g, async (whole, alt, target) => {
    let decoded = target;
    try { decoded = decodeURIComponent(target); } catch { /* keep as is */ }
    const f = findFile(decoded, n.dir);
    if (!f) { missing.add(`${n.rel} → ${decoded}`); return whole; }
    return block(`![${alt || f.name.replace(/\.[^.]+$/, "")}](${await urlFor(f)})`);
  });
  return text.replace(/\n{3,}/g, "\n\n");
}

async function convert(n) {
  let md = fs.readFileSync(n.abs, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm && fm[1].split("\n").every((l) => /^[\w-]+:|^\s+|^\s*$/.test(l))) md = md.slice(fm[0].length);
  // Leave code untouched: fenced blocks are odd segments, inline code is skipped inside the rest.
  const segments = md.split(/(^```[\s\S]*?^```$)/m);
  for (let i = 0; i < segments.length; i += 2) {
    const pieces = segments[i].split(/(`[^`\n]+`)/);
    for (let j = 0; j < pieces.length; j += 2) pieces[j] = await convertText(pieces[j], n);
    segments[i] = pieces.join("");
  }
  return segments.join("").trim() + "\n";
}

// ── Run ───────────────────────────────────────────────────────────────────────────────────

const { count, error: countError } = await db.from("knowledge_notes").select("id", { count: "exact", head: true });
if (countError) throw new Error(`knowledge_notes: ${countError.message} — run supabase/knowledge_notes.sql first`);
if (count && !FORCE && !DRY) {
  console.error(`«Конспекты» already hold ${count} entries — pass --force to import on top of them.`);
  process.exit(1);
}

const rows = [];
for (const n of notes) {
  const parent_id = folderId(n.dir);
  const content = await convert(n);
  rows.push({
    id: n.id, kind: "note", parent_id, title: n.name, content,
    created_at: (n.stat.birthtime.getTime() ? n.stat.birthtime : n.stat.mtime).toISOString(),
    updated_at: n.stat.mtime.toISOString(),
  });
  process.stdout.write(".");
}
console.log();

// Parents before children, so the parent_id foreign key always resolves.
const depth = (dir) => dir.split("/").length;
const folderRows = [...folders.entries()].sort((a, b) => depth(a[0]) - depth(b[0])).map(([, r]) => r);
const all = [...folderRows, ...rows];

if (DRY) {
  const out = path.join(process.env.TMP ?? ".", "obsidian-import-preview.json");
  fs.writeFileSync(out, JSON.stringify(all, null, 2));
  console.log(`dry run → ${out}`);
} else {
  for (let i = 0; i < all.length; i += 50) {
    const { error } = await db.from("knowledge_notes").insert(all.slice(i, i + 50));
    if (error) throw new Error(`insert: ${error.message}`);
  }
}

console.log(`${folderRows.length} folders, ${rows.length} notes, ${uploaded.size} attachments ${DRY ? "(not uploaded — dry run)" : "uploaded"}`);
if (missing.size) console.log(`Not found in the vault (left as text):\n  ${[...missing].join("\n  ")}`);
