import { Book, Newspaper, Video, Mic, GraduationCap, Wrench, Sparkles, type LucideIcon } from "lucide-react";

import type { LibraryType } from "@/lib/library";

/** Icon + colour per item type. Colours are DS tokens / the same Tailwind hues the app already uses. */
export const TYPE_ICON: Record<LibraryType, LucideIcon> = {
  book: Book,
  article: Newspaper,
  video: Video,
  podcast: Mic,
  course: GraduationCap,
  tool: Wrench,
  other: Sparkles,
};

export const TYPE_STYLE: Record<LibraryType, { chip: string; plate: string }> = {
  book: { chip: "bg-amber-500/15 text-amber-400", plate: "from-amber-500/30 to-amber-500/5 text-amber-400" },
  article: { chip: "bg-brand/15 text-brand", plate: "from-brand/30 to-brand/5 text-brand" },
  video: { chip: "bg-rose-500/15 text-rose-400", plate: "from-rose-500/30 to-rose-500/5 text-rose-400" },
  podcast: { chip: "bg-violet-500/15 text-violet-400", plate: "from-violet-500/30 to-violet-500/5 text-violet-400" },
  course: { chip: "bg-success/15 text-success", plate: "from-success/30 to-success/5 text-success" },
  tool: { chip: "bg-secondary text-muted-foreground", plate: "from-muted-foreground/25 to-muted-foreground/5 text-muted-foreground" },
  other: { chip: "bg-secondary text-muted-foreground", plate: "from-muted-foreground/25 to-muted-foreground/5 text-muted-foreground" },
};

export const STATUS_DOT: Record<"want" | "doing" | "done", string> = {
  want: "bg-muted-foreground/50",
  doing: "bg-brand",
  done: "bg-success",
};
