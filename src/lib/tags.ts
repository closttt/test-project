/** The only tags surfaced for picking (existing data may still carry older free-form tags). */
export const FIXED_TAGS = ["личное", "работа"] as const;

/** Stable colour per tag string — deterministic hash into a small palette. */
const PALETTE = [
  "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "bg-amber-500/15 text-amber-400 border-amber-500/20",
  "bg-violet-500/15 text-violet-400 border-violet-500/20",
  "bg-rose-500/15 text-rose-400 border-rose-500/20",
  "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
];

export function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
