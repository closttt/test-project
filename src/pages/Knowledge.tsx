import { useEffect, useMemo, useState } from "react";
import { BookMarked, ExternalLink, RefreshCw, Search, List, LayoutGrid, Trash2, X, ImageIcon, Link2, FolderTree, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";

import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { FilterChip } from "@/components/ui/filter-chip";
import { IconAction } from "@/components/ui/icon-action";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskTag } from "@/components/TaskTag";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/store/ToastProvider";
import { tagColor } from "@/lib/tags";
import { formatDate, formatDateTime, isToday, addDays } from "@/lib/format";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured, fetchKnowledgeCards, deleteKnowledgeCard, updateKnowledgeCardSource } from "@/lib/supabase";
import { ShimmerSkeleton } from "@/components/unlumen-ui/shimmer-skeleton";
import { ProgressiveBlur } from "@/components/unlumen-ui/progressive-blur";
import { extractLinks } from "@/lib/links";
import {
  loadCategoryOverrides,
  setCategoryOverride,
  resolveCategory,
  allCategories,
  groupByCategory,
  UNSORTED,
  type CategoryOverrides,
} from "@/lib/knowledgeCategory";
import type { KnowledgeCard } from "@/types";

const POLL_MS = 60_000;
type ViewMode = "cards" | "table";
type SortMode = "newest" | "oldest" | "title" | "titleDesc" | "image";
type GroupMode = "date" | "category";

function NotConfigured() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Supabase не подключён</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          Эта страница показывает карточки, которые Hermes Agent создаёт из пересланных постов Telegram.
          Чтобы включить: 1) создайте проект на supabase.com, 2) выполните <code className="rounded bg-secondary px-1 py-0.5">supabase/knowledge_cards.sql</code>{" "}
          в SQL Editor, 3) скопируйте <code className="rounded bg-secondary px-1 py-0.5">.env.example</code> → <code className="rounded bg-secondary px-1 py-0.5">.env.local</code> и
          впишите <code className="rounded bg-secondary px-1 py-0.5">VITE_SUPABASE_URL</code> / <code className="rounded bg-secondary px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code>, 4) перезапустите{" "}
          <code className="rounded bg-secondary px-1 py-0.5">npm run dev</code>.
        </p>
      </CardContent>
    </Card>
  );
}

/** "Сегодня" / "Вчера" / "13 июл." — same day-grouping language as the rest of the app. */
function dayLabel(iso: string): string {
  const key = iso.slice(0, 10);
  if (isToday(key)) return "Сегодня";
  if (key === addDays(new Date(), -1)) return "Вчера";
  return formatDate(iso);
}

function CardSkeleton() {
  return (
    <div className="mb-4 flex flex-col gap-3 overflow-hidden rounded-lg border border-border break-inside-avoid">
      <ShimmerSkeleton className="h-36 w-full" rounded="none" />
      <div className="flex flex-col gap-2 p-4 pt-0">
        <ShimmerSkeleton className="h-4 w-3/4" />
        <ShimmerSkeleton className="h-3 w-full" />
        <ShimmerSkeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function CardThumb({ url, name }: { url?: string; name: string }) {
  if (!url) {
    return (
      <div className="flex h-36 w-full items-center justify-center bg-secondary/40 text-muted-foreground">
        <ImageIcon className="h-6 w-6" />
      </div>
    );
  }
  return (
    <div className="relative">
      <img src={url} alt={name} className="block h-auto w-full" />
      {/* Permanent (not hover-only) fade so the image settles into the card body below it,
          instead of ending on a hard edge — same treatment on every card, not a hover reveal. */}
      <ProgressiveBlur side="bottom" size={48} strength={6} tintStrength={0.9} />
    </div>
  );
}

export default function Knowledge() {
  const configured = isSupabaseConfigured();
  const { toast } = useToast();
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);
  const [view, setView] = useState<ViewMode>("cards");
  const [sortBy, setSortBy] = useState<SortMode>("newest");
  const [groupMode, setGroupMode] = useState<GroupMode>("date");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [opened, setOpened] = useState<KnowledgeCard | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<KnowledgeCard | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  // Client-side category ("раздел") overrides per card — one level of hierarchy over flat tags.
  const [categories, setCategories] = useState<CategoryOverrides>(() => loadCategoryOverrides());
  const [categoryDraft, setCategoryDraft] = useState("");

  function assignCategory(card: KnowledgeCard, value: string | null) {
    setCategories((prev) => setCategoryOverride(prev, card.id, value));
    setCategoryDraft("");
  }

  /** Attach/clear the source link by hand (private-channel fallback). */
  async function saveSource(card: KnowledgeCard, url: string | null) {
    setSavingSource(true);
    try {
      await updateKnowledgeCardSource(card.id, url);
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, sourceUrl: url ?? undefined } : c)));
      setOpened((o) => (o && o.id === card.id ? { ...o, sourceUrl: url ?? undefined } : o));
      setSourceDraft("");
      toast(url ? "Ссылка привязана" : "Ссылка убрана");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить ссылку");
    } finally {
      setSavingSource(false);
    }
  }

  async function load() {
    if (!configured) return;
    setLoading(true);
    try {
      setCards(await fetchKnowledgeCards());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (!configured) return;
    const id = setInterval(load, POLL_MS);

    // Coming back to the tab refetches immediately. Without this, a card sent from the phone
    // could sit invisible for up to a minute on an already-open tab — the poll alone makes the
    // "открыл сайт, а там всё" promise feel unreliable exactly when the user is looking.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    cards.forEach((c) => c.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [cards]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return cards
      .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q))
      .filter((c) => !activeTag || c.tags.includes(activeTag))
      .sort((a, b) => {
        if (sortBy === "oldest") return a.createdAt.localeCompare(b.createdAt);
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "titleDesc") return b.title.localeCompare(a.title);
        if (sortBy === "image") {
          // Cards with a cover first (visual browsing), newest-first within each group.
          const ai = a.imageUrl ? 0 : 1;
          const bi = b.imageUrl ? 0 : 1;
          return ai - bi || b.createdAt.localeCompare(a.createdAt);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [cards, q, activeTag, sortBy]);

  const groups = useMemo(() => {
    // Group by category ("раздел") when chosen, else by day — same {label, items} shape either way.
    if (groupMode === "category") {
      return groupByCategory(visible, categories).map((g) => ({ label: g.category, items: g.cards }));
    }
    const out: { label: string; items: KnowledgeCard[] }[] = [];
    for (const c of visible) {
      const label = dayLabel(c.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [visible, groupMode, categories]);

  // Existing categories offered as quick picks in the card's category selector.
  const knownCategories = useMemo(() => allCategories(cards, categories).filter((c) => c !== UNSORTED), [cards, categories]);

  function handleDelete(c: KnowledgeCard) {
    setConfirmTarget(c);
  }

  async function confirmDeleteCard() {
    if (!confirmTarget) return;
    const c = confirmTarget;
    try {
      await deleteKnowledgeCard(c.id);
      setCards((prev) => prev.filter((x) => x.id !== c.id));
      if (opened?.id === c.id) setOpened(null);
      toast("Карточка удалена");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось удалить");
    }
  }

  function renderCard(c: KnowledgeCard) {
    return (
      <StaggerItem key={c.id} className="mb-4 break-inside-avoid">
        <motion.div whileHover={{ y: -3 }} transition={spring}>
          <Card className="group flex cursor-pointer flex-col overflow-hidden" onClick={() => setOpened(c)}>
            <div className="relative">
              <CardThumb url={c.imageUrl} name={c.title} />
              <IconAction
                icon={X}
                label={`Удалить карточку: ${c.title}`}
                tone="danger"
                onClick={() => handleDelete(c)}
                reveal
                className="absolute right-2 top-2 h-7 w-7 rounded-full bg-background/80 p-0 backdrop-blur"
                iconClassName="h-4 w-4"
              />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="line-clamp-2 text-base">{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {c.description && <p className="line-clamp-4 text-sm text-muted-foreground">{c.description}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {c.tags.map((t) => (
                  <TaskTag key={t} tag={t} />
                ))}
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </StaggerItem>
    );
  }

  function renderRow(c: KnowledgeCard) {
    return (
      <div
        key={c.id}
        onClick={() => setOpened(c)}
        className="group flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-secondary/40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary/40 text-muted-foreground">
          {c.imageUrl ? <img src={c.imageUrl} alt={c.title} className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
        <div className="hidden items-center gap-1.5 sm:flex">
          {c.tags.map((t) => (
            <TaskTag key={t} tag={t} />
          ))}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
        {c.sourceUrl && (
          <a
            href={c.sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-muted-foreground hover:text-brand"
            title="Перейти к посту"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <IconAction
          icon={Trash2}
          label={`Удалить карточку: ${c.title}`}
          tone="danger"
          onClick={() => handleDelete(c)}
          reveal
          className="p-1"
          iconClassName="h-4 w-4"
        />
      </div>
    );
  }

  return (
    <AppShell
      title="База знаний"
      description="Карточки из Telegram, собранные Hermes Agent"
      actions={
        configured ? (
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Обновить
          </Button>
        ) : undefined
      }
    >
      {!configured ? (
        <NotConfigured />
      ) : error ? (
        <Card className="border-risk/30">
          <CardContent className="p-4 text-sm text-risk">{error}</CardContent>
        </Card>
      ) : loading && cards.length === 0 ? (
        <div className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
          {Array.from({ length: 10 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Пока пусто"
          description="Перешлите пост в Telegram-бота Hermes Agent — карточка появится здесь автоматически."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по карточкам…" className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {tagCounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterChip
                    active={activeTag === null}
                    onClick={() => setActiveTag(null)}
                    count={cards.length}
                  >
                    Все
                  </FilterChip>
                  {tagCounts.map(([tag, count]) => (
                    <FilterChip
                      key={tag}
                      active={tag === activeTag}
                      activeClassName={tagColor(tag)}
                      onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                      count={count}
                    >
                      #{tag}
                    </FilterChip>
                  ))}
                </div>
              )}
              <Segmented
                ariaLabel="Группировка карточек"
                value={groupMode}
                onChange={setGroupMode}
                options={[
                  { value: "date", label: <CalendarDays className="h-4 w-4" />, title: "По дате" },
                  { value: "category", label: <FolderTree className="h-4 w-4" />, title: "По разделам" },
                ]}
              />
              {groupMode === "date" && (
                <Segmented
                  ariaLabel="Сортировка карточек"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: "newest", label: "Новые" },
                    { value: "oldest", label: "Старые" },
                    { value: "title", label: "А-Я" },
                    { value: "titleDesc", label: "Я-А" },
                    { value: "image", label: "С фото", title: "Сначала карточки с изображением" },
                  ]}
                />
              )}
              <Segmented
                ariaLabel="Вид базы знаний"
                value={view}
                onChange={setView}
                options={[
                  { value: "cards", label: <LayoutGrid className="h-4 w-4" />, title: "Карточки" },
                  { value: "table", label: <List className="h-4 w-4" />, title: "Таблица" },
                ]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Ничего не найдено.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((g) => (
                <div key={g.label} className="flex flex-col gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  {view === "cards" ? (
                    <StaggerList className="columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5">
                      {g.items.map(renderCard)}
                    </StaggerList>
                  ) : (
                    <div className="flex flex-col gap-1.5">{g.items.map(renderRow)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={!!opened} onOpenChange={(v) => !v && setOpened(null)}>
        <DialogContent>
          {opened && (
            <>
              {opened.imageUrl && (
                <img src={opened.imageUrl} alt={opened.title} className="-mx-6 -mt-6 mb-2 h-auto w-[calc(100%+3rem)] max-w-none rounded-t-lg" />
              )}
              <DialogHeader>
                {opened.tags[0] && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" /> #{opened.tags[0]}
                  </span>
                )}
                <DialogTitle>{opened.title}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {opened.description && (
                  <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border bg-secondary/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                    <p className="whitespace-pre-wrap">{opened.description}</p>
                  </div>
                )}

                {/* Every link found in the card text, surfaced as clean domain chips (arbitrary
                    links, not just the manual source fallback). Full OG/image previews need a
                    server-side fetch — browsers block cross-origin HTML — so v1 shows them by domain. */}
                {extractLinks(opened.description).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Link2 className="h-3.5 w-3.5" /> Ссылки в тексте
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {extractLinks(opened.description).map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand"
                          title={l.url}
                        >
                          <Link2 className="h-3 w-3" /> {l.domain}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {opened.tags.map((t) => (
                    <TaskTag key={t} tag={t} />
                  ))}
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    {opened.tags[0] && <span className="rounded-full border border-border px-2 py-0.5">#{opened.tags[0]}</span>}
                    {formatDateTime(opened.createdAt)}
                  </span>
                </div>

                {/* Раздел (category) — one level of hierarchy over flat tags, stored client-side. */}
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FolderTree className="h-3.5 w-3.5" /> Раздел
                    <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-foreground">
                      {resolveCategory(opened, categories)}
                    </span>
                    {categories[opened.id] && (
                      <button
                        onClick={() => assignCategory(opened, null)}
                        className="text-muted-foreground/60 hover:text-foreground"
                        title="Сбросить к тегу"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {knownCategories
                      .filter((cat) => cat !== resolveCategory(opened, categories))
                      .map((cat) => (
                        <button
                          key={cat}
                          onClick={() => assignCategory(opened, cat)}
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
                        >
                          {cat}
                        </button>
                      ))}
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={categoryDraft}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && categoryDraft.trim() && assignCategory(opened, categoryDraft)}
                        placeholder="новый раздел…"
                        className="h-8 w-40 text-xs"
                      />
                      <Button size="sm" variant="outline" className="h-8" disabled={!categoryDraft.trim()} onClick={() => assignCategory(opened, categoryDraft)}>
                        Задать
                      </Button>
                    </div>
                  </div>
                </div>
                {opened.sourceUrl ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={opened.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm text-brand underline underline-offset-2"
                    >
                      <ExternalLink className="h-4 w-4" /> Перейти к источнику
                    </a>
                    <IconAction
                      icon={X}
                      label="Убрать ссылку на источник"
                      tone="danger"
                      onClick={() => saveSource(opened, null)}
                      className="p-1"
                    />
                  </div>
                ) : (
                  // Telegram gives no public link for PRIVATE channels, so Hermes leaves this empty
                  // by design — this is the manual fallback.
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={sourceDraft}
                        onChange={(e) => setSourceDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveSource(opened, sourceDraft.trim() || null)}
                        placeholder="https://t.me/… — ссылка на источник"
                        className="h-9"
                      />
                      <Button size="sm" className="h-9 shrink-0" onClick={() => saveSource(opened, sourceDraft.trim() || null)} disabled={!sourceDraft.trim() || savingSource}>
                        {savingSource ? "…" : "Привязать"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground/70">
                      Ссылка не долетела — так бывает с приватными каналами: у них нет публичного t.me-адреса. Можно вписать вручную.
                    </p>
                  </div>
                )}
                <Button variant="ghost" size="sm" className="w-fit text-risk hover:text-risk" onClick={() => handleDelete(opened)}>
                  <Trash2 className="h-4 w-4" /> Удалить карточку
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(v) => !v && setConfirmTarget(null)}
        title={`Удалить карточку «${confirmTarget?.title}»?`}
        description="Действие необратимо — карточка хранится в Supabase, вернуть её из приложения будет нельзя."
        onConfirm={confirmDeleteCard}
      />
    </AppShell>
  );
}
