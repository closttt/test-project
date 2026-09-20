import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Shuffle, Play, ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchLibrary, updateLibraryItem, LIBRARY_TYPES, type LibraryItem } from "@/lib/library";
import { TYPE_ICON, TYPE_STYLE } from "@/components/library/libraryMeta";

/**
 * Dashboard widget «Прочитать сегодня»: one item from the «Хочу» shelf, chosen deterministically
 * per day (so it doesn't change on every render) with a «Другое» reroll. The nudge is the point —
 * a library you never open is a graveyard.
 */
export function ReadingWidget() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    fetchLibrary().then(setItems).catch(() => fetchLibrary().then(setItems).catch(() => {})).finally(() => setLoaded(true));
  }, []);

  const queue = useMemo(() => {
    const want = items.filter((i) => i.status === "want");
    const doing = items.filter((i) => i.status === "doing");
    // Things already in progress come first — finish before starting — then the wishlist.
    return [...doing, ...want];
  }, [items]);

  const pick = useMemo(() => {
    if (queue.length === 0) return null;
    const seed = [...todayStr()].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return queue[(seed + skip) % queue.length];
  }, [queue, skip]);

  async function start(item: LibraryItem) {
    setItems(await updateLibraryItem(items, item.id, { status: "doing" }).catch(() => items));
  }

  const Icon = pick ? TYPE_ICON[pick.type] : BookOpen;
  const style = pick ? TYPE_STYLE[pick.type] : null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" /> Прочитать сегодня
          {queue.length > 1 && (
            <button type="button" onClick={() => setSkip((n) => n + 1)} className="ml-auto rounded p-0.5 text-muted-foreground/60 hover:text-foreground" title="Другое" aria-label="Показать другое">
              <Shuffle className="h-3.5 w-3.5" />
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : !pick ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-2 text-sm text-muted-foreground">
            <p>Полка «Хочу» пуста. Добавьте книгу, статью или видео — и они будут по одному появляться здесь.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/knowledge" state={{ tab: "library" }}>В библиотеку <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        ) : (
          <>
            <Link to="/knowledge" state={{ tab: "library", openLibraryId: pick.id }} className="flex gap-3 rounded-md transition-colors hover:bg-secondary/40">
              <span className={cn("flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br", style?.plate)}>
                {pick.coverUrl ? <img src={pick.coverUrl} alt="" className="h-full w-full object-cover" /> : <Icon className="h-6 w-6" />}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className={cn("w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-medium", style?.chip)}>
                  {LIBRARY_TYPES[pick.type].label}{pick.status === "doing" ? " · в процессе" : ""}
                </span>
                <span className="line-clamp-2 text-sm font-medium leading-snug">{pick.title}</span>
                {(pick.author || pick.domain) && <span className="truncate text-xs text-muted-foreground">{pick.author ?? pick.domain}</span>}
              </span>
            </Link>
            <div className="mt-auto flex flex-wrap gap-2">
              {pick.status === "want" && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => start(pick)}>
                  <Play className="h-3.5 w-3.5" /> Начать
                </Button>
              )}
              {pick.url && (
                <Button size="sm" variant="ghost" className="gap-1.5" asChild>
                  <a href={pick.url} target="_blank" rel="noreferrer">Открыть источник <ArrowRight className="h-3.5 w-3.5" /></a>
                </Button>
              )}
              <span className="ml-auto self-center text-xs text-muted-foreground tabular-nums">{queue.length} в очереди</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
