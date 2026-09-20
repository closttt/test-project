import { useEffect, useMemo, useState } from "react";
import { Heart, LayoutGrid, List, Plus, Search, Star, ExternalLink, Library as LibraryIcon } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { FilterChip } from "@/components/ui/filter-chip";
import { TaskTag } from "@/components/TaskTag";
import { EmptyState } from "@/components/EmptyState";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { ShimmerSkeleton } from "@/components/unlumen-ui/shimmer-skeleton";
import { tagColor } from "@/lib/tags";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  LIBRARY_TYPES,
  LIBRARY_TYPE_ORDER,
  LIBRARY_STATUSES,
  LIBRARY_STATUS_ORDER,
  matchesLibraryQuery,
  sortLibrary,
  libraryTagCounts,
  newDraft,
  type LibraryItem,
  type LibraryDraft,
  type LibraryType,
  type LibraryStatus,
  type LibrarySort,
} from "@/lib/library";
import { TYPE_ICON, TYPE_STYLE, STATUS_DOT } from "@/components/library/libraryMeta";
import { LibraryItemDialog } from "@/components/library/LibraryItemDialog";
import type { LibraryState } from "@/components/library/useLibrary";

const VIEW_KEY = "crm-library-view-v1";

interface Props {
  lib: LibraryState;
  /** Deep-link: open this item's card once (command palette, dashboard widget). */
  openId?: string | null;
  /** Deep-link: start the «добавить» form from this draft once (Share Target, «→ в Библиотеку»). */
  pendingDraft?: LibraryDraft | null;
  onConsumed?: () => void;
}

/**
 * The «Библиотека» tab: counter, search, type/status/tag filters, grid or list of items, and the
 * add/edit dialog. All filtering is client-side over the loaded list — a personal library is a
 * few thousand items at most, and the whole point is that finding something takes one keystroke.
 */
export function LibraryPanel({ lib, openId, pendingDraft, onConsumed }: Props) {
  const { items, loading, error } = lib;
  const [view, setView] = useState<"grid" | "list">(() => (localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"));
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<LibraryType | null>(null);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [onlyFav, setOnlyFav] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [opened, setOpened] = useState<LibraryItem | null>(null);
  const [draft, setDraft] = useState<LibraryDraft | null>(null);

  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  // Deep links: open an item / start a draft once the list is here, then tell the parent it's used.
  useEffect(() => {
    if (openId && !loading) {
      const it = items.find((i) => i.id === openId);
      if (it) setOpened(it);
      onConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading]);
  useEffect(() => {
    if (pendingDraft) { setDraft(pendingDraft); onConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraft]);

  // Keep the open card in sync with autosaved edits.
  const openedLive = opened ? items.find((i) => i.id === opened.id) ?? null : null;

  const tagCounts = useMemo(() => libraryTagCounts(items), [items]);
  const typeCounts = useMemo(() => {
    const m: Partial<Record<LibraryType, number>> = {};
    items.forEach((i) => { m[i.type] = (m[i.type] ?? 0) + 1; });
    return m;
  }, [items]);
  const statusCounts = useMemo(() => {
    const m: Record<LibraryStatus, number> = { want: 0, doing: 0, done: 0 };
    items.forEach((i) => { m[i.status] += 1; });
    return m;
  }, [items]);

  const visible = useMemo(() => {
    const filtered = items.filter(
      (i) =>
        (!type || i.type === type) &&
        (!status || i.status === status) &&
        (!onlyFav || i.favorite) &&
        (!tag || i.tags.includes(tag)) &&
        matchesLibraryQuery(i, query)
    );
    return sortLibrary(filtered, sort);
  }, [items, type, status, onlyFav, tag, query, sort]);

  const hasFilters = !!(type || status || onlyFav || tag || query.trim());

  function startAdd() {
    setDraft(newDraft());
  }

  function card(i: LibraryItem) {
    const Icon = TYPE_ICON[i.type];
    const style = TYPE_STYLE[i.type];
    return (
      <StaggerItem key={i.id} className="mb-4 break-inside-avoid">
        <motion.div whileHover={{ y: -3 }} transition={spring}>
          <Card className="group flex cursor-pointer flex-col overflow-hidden" onClick={() => setOpened(i)}>
            <div className={cn("relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-gradient-to-br", style.plate)}>
              {i.coverUrl ? <img src={i.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon className="h-9 w-9 opacity-80" />}
              <span className={cn("absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium backdrop-blur", style.chip, "bg-background/70")}>
                <Icon className="h-3 w-3" /> {LIBRARY_TYPES[i.type].label}
              </span>
              <button
                type="button"
                aria-label={i.favorite ? "Убрать из избранного" : "В избранное"}
                onClick={(e) => { e.stopPropagation(); lib.update(i.id, { favorite: !i.favorite }); }}
                className={cn(
                  "absolute right-2 top-2 rounded-full bg-background/70 p-1.5 backdrop-blur transition-opacity",
                  i.favorite ? "text-rose-400" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                )}
              >
                <Heart className={cn("h-3.5 w-3.5", i.favorite && "fill-current")} />
              </button>
            </div>
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex items-start gap-2">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_DOT[i.status])} title={LIBRARY_STATUSES[i.status].label} />
                <span className="line-clamp-2 text-sm font-medium leading-snug">{i.title}</span>
              </div>
              {(i.author || i.domain) && (
                <p className="truncate text-xs text-muted-foreground">{i.author ?? i.domain}</p>
              )}
              {i.description && <p className="line-clamp-2 text-xs text-muted-foreground/80">{i.description}</p>}
              {(i.tags.length > 0 || i.rating) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {i.tags.slice(0, 3).map((t) => <TaskTag key={t} tag={t} />)}
                  {i.rating && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-xs text-amber-400">
                      <Star className="h-3 w-3 fill-current" /> {i.rating}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </StaggerItem>
    );
  }

  function row(i: LibraryItem) {
    const Icon = TYPE_ICON[i.type];
    const style = TYPE_STYLE[i.type];
    return (
      <div
        key={i.id}
        onClick={() => setOpened(i)}
        className="group flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-secondary/40"
      >
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-gradient-to-br", style.plate)}>
          {i.coverUrl ? <img src={i.coverUrl} alt="" className="h-full w-full object-cover" /> : <Icon className="h-4 w-4" />}
        </span>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[i.status])} title={LIBRARY_STATUSES[i.status].label} />
        <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
        <span className="hidden max-w-[12rem] truncate text-xs text-muted-foreground md:inline">{i.author ?? i.domain}</span>
        <span className={cn("hidden rounded-full px-2 py-0.5 text-[0.65rem] font-medium sm:inline", style.chip)}>{LIBRARY_TYPES[i.type].label}</span>
        <div className="hidden items-center gap-1.5 lg:flex">{i.tags.slice(0, 3).map((t) => <TaskTag key={t} tag={t} />)}</div>
        {i.rating && <span className="inline-flex items-center gap-0.5 text-xs text-amber-400"><Star className="h-3 w-3 fill-current" />{i.rating}</span>}
        <button
          type="button"
          aria-label={i.favorite ? "Убрать из избранного" : "В избранное"}
          onClick={(e) => { e.stopPropagation(); lib.update(i.id, { favorite: !i.favorite }); }}
          className={cn("rounded p-1", i.favorite ? "text-rose-400" : "text-muted-foreground/40 hover:text-foreground")}
        >
          <Heart className={cn("h-3.5 w-3.5", i.favorite && "fill-current")} />
        </button>
        {i.url && (
          <a href={i.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-brand" title="Открыть источник">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Counter strip — the «2437» from the reel: one number that grows as you read. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-secondary/20 px-4 py-3">
        <span className="flex items-center gap-2">
          <LibraryIcon className="h-5 w-5 text-brand" />
          <span className="text-2xl font-semibold tabular-nums">{items.length}</span>
          <span className="text-sm text-muted-foreground">в библиотеке</span>
        </span>
        {LIBRARY_STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? null : s)}
            className={cn("flex items-center gap-1.5 text-sm transition-colors", status === s ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
            <span className="tabular-nums font-medium">{statusCounts[s]}</span> {LIBRARY_STATUSES[s].label.toLowerCase()}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {!lib.cloud && <span className="text-xs text-muted-foreground" title={error ?? "Supabase не настроен"}>локально</span>}
          <Button size="sm" className="gap-1.5" onClick={startAdd}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </span>
      </div>

      {error && <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: название, автор, заметки, теги…" className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Segmented<LibrarySort>
            ariaLabel="Сортировка библиотеки"
            value={sort}
            onChange={setSort}
            options={[
              { value: "newest", label: "Новые" },
              { value: "oldest", label: "Старые" },
              { value: "title", label: "А-Я" },
              { value: "rating", label: "Оценка" },
            ]}
          />
          <Segmented<"grid" | "list">
            ariaLabel="Вид библиотеки"
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: <LayoutGrid className="h-4 w-4" />, title: "Сетка" },
              { value: "list", label: <List className="h-4 w-4" />, title: "Список" },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={type === null && !onlyFav} onClick={() => { setType(null); setOnlyFav(false); }} count={items.length}>Все</FilterChip>
        {LIBRARY_TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => {
          const I = TYPE_ICON[t];
          return (
            <FilterChip key={t} active={type === t} activeClassName={TYPE_STYLE[t].chip} onClick={() => setType(type === t ? null : t)} count={typeCounts[t]}>
              <I className="mr-1 h-3 w-3" />{LIBRARY_TYPES[t].plural}
            </FilterChip>
          );
        })}
        <FilterChip active={onlyFav} activeClassName="bg-rose-500/15 text-rose-400" onClick={() => setOnlyFav((v) => !v)} count={items.filter((i) => i.favorite).length || undefined}>
          <Heart className="mr-1 h-3 w-3" />Избранное
        </FilterChip>
        {tagCounts.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
        {tagCounts.slice(0, 14).map(([t, n]) => (
          <FilterChip key={t} active={tag === t} activeClassName={tagColor(t)} onClick={() => setTag(tag === t ? null : t)} count={n}>
            #{t}
          </FilterChip>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="columns-1 gap-4 sm:columns-2 md:columns-3 xl:columns-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="mb-4 flex flex-col gap-3 overflow-hidden rounded-lg border border-border break-inside-avoid">
              <ShimmerSkeleton className="h-32 w-full" rounded="none" />
              <div className="flex flex-col gap-2 p-3 pt-0"><ShimmerSkeleton className="h-4 w-3/4" /><ShimmerSkeleton className="h-3 w-1/2" /></div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={LibraryIcon}
          title="Библиотека пуста"
          description="Книги, статьи, видео, подкасты, курсы — всё, что прочитали или хотите. Вставьте ссылку, остальное подтянется."
          actionLabel="Добавить первое"
          onAction={startAdd}
        />
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Ничего не найдено{hasFilters ? " по этим фильтрам" : ""}.
        </div>
      ) : view === "grid" ? (
        <StaggerList className="columns-1 gap-4 sm:columns-2 md:columns-3 xl:columns-4">{visible.map(card)}</StaggerList>
      ) : (
        <div className="flex flex-col gap-1.5">{visible.map(row)}</div>
      )}

      <LibraryItemDialog
        open={!!openedLive}
        onOpenChange={(v) => !v && setOpened(null)}
        item={openedLive}
        onUpdate={lib.update}
        onDelete={lib.remove}
        knownTags={tagCounts.map(([t]) => t)}
      />
      <LibraryItemDialog
        open={!!draft}
        onOpenChange={(v) => !v && setDraft(null)}
        draft={draft}
        onCreate={async (d) => { await lib.add(d); }}
        knownTags={tagCounts.map(([t]) => t)}
      />
    </div>
  );
}
