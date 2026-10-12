// Design lab: take a READ-ONLY snapshot of production data for the redesign previews.
//   node scripts/design-lab-snapshot.mjs
// Only GET requests. Writes design-lab/.data/snapshot.json (gitignored — personal data).
import fs from "fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const TABLES = [
  ["app_state", "id=eq.main&select=data,updated_at"],
  ["knowledge_cards", "select=*&order=created_at.desc"],
  ["knowledge_notes", "select=*"],
  ["knowledge_links", "select=*"],
  ["knowledge_link_sections", "select=*"],
  ["library_items", "select=*"],
  ["incoming_meetings", "select=*"],
];

const out = { takenAt: new Date().toISOString() };
for (const [table, query] of TABLES) {
  const r = await fetch(`${url}/rest/v1/${table}?${query}`, { method: "GET", headers });
  out[table] = r.ok ? await r.json() : [];
  console.log(table, r.status, Array.isArray(out[table]) ? out[table].length : "");
}
fs.mkdirSync("design-lab/.data", { recursive: true });
fs.writeFileSync("design-lab/.data/snapshot.json", JSON.stringify(out));
console.log("→ design-lab/.data/snapshot.json");
