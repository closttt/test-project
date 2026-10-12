import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Search, Trash2, X, Link2, Plus, GripVertical, Library as LibraryIcon, NotebookPen } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { IconAction } from "@/components/ui/icon-action";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/store/ToastProvider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured, fetchKnowledgeCards } from "@/lib/supabase";
import { linkColor, linkMonogram, faviconUrl, prettyDomain } from "@/lib/links";
import { LibraryPanel } from "@/components/library/LibraryPanel";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { useLibrary } from "@/components/library/useLibrary";
import { newDraft, detectType, type LibraryDraft } from "@/lib/library";
import {
  fetchShelf,
  addLinks,
  removeLink,
  moveLink,
  addSection,
  renameSection,
  removeSection,
  moveSection,
  linksOfSection,
  positionBetween,
  type SavedLink,
  type LinkSection,
  type LinkShelf,
} from "@/lib/knowledgeLinks";
import type { KnowledgeCard } from "@/types";

const POLL_MS = 60_000;
/** Telegram cards already moved into the library — so deleting the library item doesn't bring it back. */
const IMPORTED_KEY = "crm-knowledge-imported-v1";
type KnowledgeTab = "notes" | "library" | "links";

function loadImported(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(IMPORTED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markImported(id: string) {
  const s = loadImported();
  s.add(id);
  try { localStorage.setItem(IMPORTED_KEY, JSON.stringify([...s])); } catch { /* quota — the sourceCardId check still dedupes */ }
}

/**
 * Saved-link tile: the site's real logo (favicon) on a white chip, over a DS-accent plate whose
 * colour cycles by position so the grid reads as varied. The letter monogram is the FALLBACK — it
 * shows while the logo loads and stays if the site has none, so a card is never blank.
 */
function LinkThumb({ domain, index }: { domain: string; index: number }) {
  const c = linkColor(index);
  const [logoOk, setLogoOk] = useState(false);
  return (
    <div
      className="flex h-20 items-center justify-center"
      // Colour fills the plate; a soft light→dark sheen over it gives the flat fill some depth.
      style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.14), rgba(0,0,0,0.14)), ${c.fg}` }}
    >
      <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
        {/* Monogram sits underneath: visible until (and unless) the real logo loads over it. */}
        {!logoOk && (
          <span className="text-xl font-bold" style={{ color: c.fg }}>
            {linkMonogram(domain)}
          </span>
        )}
        <img
          src={faviconUrl(domain)}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          onLoad={() => setLogoOk(true)}
          className={cn("absolute h-7 w-7 object-contain", !logoOk && "opacity-0")}
        />
      </span>
    </div>
  );
}

export default function Knowledge() {
  const configured = isSupabaseConfigured();
  const { toast } = useToast();
  // Три раздела: «Конспекты» (папки и заметки, как в Obsidian), «Библиотека» (свой каталог с
  // заметками — сюда же сами падают посты, пересланные в Telegram-бота), полка ссылок.
  // Deep links: location.state.tab / openLibraryId (палитра, дашборд) и ?share (Share Target с телефона).
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const navState = (location.state ?? {}) as { tab?: KnowledgeTab; openLibraryId?: string };
  // Web Share Target (manifest.webmanifest) lands here as /knowledge?title=&text=&url= .
  const isShare = ["url", "text", "title"].some((k) => searchParams.has(k));
  const [tab, setTab] = useState<KnowledgeTab>(() =>
    isShare ? "library" : navState.tab === "library" || navState.tab === "links" ? navState.tab : "notes"
  );
  const lib = useLibrary();
  const [libOpenId, setLibOpenId] = useState<string | null>(navState.openLibraryId ?? null);
  const [pendingDraft, setPendingDraft] = useState<LibraryDraft | null>(() => {
    if (!isShare) return null;
    // Android puts the link into `text`, iOS into `url` — look in both.
    const d = newDraft([searchParams.get("url"), searchParams.get("text")].filter(Boolean).join(" "));
    const title = searchParams.get("title")?.trim();
    if (title && !d.url) d.title = title;
    return d;
  });
  useEffect(() => {
    // Consume the one-shot state so back/forward doesn't re-open things.
    if (isShare || navState.tab || navState.openLibraryId) navigate("/knowledge", { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A Telegram card becomes a library item: title, text, picture and tags carry over; the link
   * then fills in the rest (preview, domain) through the library's own unfurl. */
  function cardDraft(c: KnowledgeCard): LibraryDraft {
    const d = newDraft(c.description ?? "");
    d.title = c.title;
    d.description = c.description?.slice(0, 600) || undefined;
    d.coverUrl = c.imageUrl;
    d.tags = [...c.tags];
    d.sourceCardId = c.id;
    if (!d.url && c.sourceUrl) { d.url = c.sourceUrl; d.domain = prettyDomain(c.sourceUrl); }
    d.type = d.url ? detectType(d.url) : "article";
    return d;
  }

  // Posts forwarded to the Telegram bot land straight in the library — no separate «Карточки»
  // section. Polls like the old tab did, plus a refetch on return to the tab, so a post sent from
  // the phone shows up right when the user looks.
  const libRef = useRef(lib);
  libRef.current = lib;
  const importing = useRef<Set<string>>(new Set());
  async function importCards() {
    if (!configured || libRef.current.loading) return;
    let cards: KnowledgeCard[];
    try {
      cards = await fetchKnowledgeCards();
    } catch {
      return; // offline / SQL not run — the library itself still works
    }
    const imported = loadImported();
    const fresh = cards
      .filter((c) => !imported.has(c.id) && !importing.current.has(c.id))
      .filter((c) => !libRef.current.items.some((i) => i.sourceCardId === c.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest first → newest ends up on top
    for (const c of fresh) {
      importing.current.add(c.id);
      const item = await libRef.current.add(cardDraft(c));
      if (item) markImported(c.id);
      importing.current.delete(c.id);
    }
  }
  useEffect(() => {
    if (!configured || lib.loading) return;
    importCards();
    const id = setInterval(importCards, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") importCards(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, lib.loading]);

  const [shelf, setShelf] = useState<LinkShelf>({ sections: [], links: [] });
  const [shelfBusy, setShelfBusy] = useState(false);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
  const [newSection, setNewSection] = useState("");
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [draggingLink, setDraggingLink] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  // The shelf lives in Supabase (or localStorage when it isn't configured) — load it once.
  useEffect(() => {
    let cancelled = false;
    fetchShelf()
      .then((s) => { if (!cancelled) setShelf(s); })
      .catch((e) => {
        if (cancelled) return;
        setShelfError(e instanceof Error ? e.message : String(e));
        // The cloud read failed (usually: SQL not run yet). fetchShelf has already switched to the
        // local path, so a second call returns this browser's shelf instead of leaving it blank.
        fetchShelf().then((s) => { if (!cancelled) setShelf(s); }).catch(() => { /* local can't fail */ });
      });
    return () => { cancelled = true; };
  }, []);

  /** Runs one shelf mutation, swapping in the fresh shelf it returns. Errors surface in-panel. */
  async function runShelf(op: Promise<LinkShelf>, done?: (s: LinkShelf) => void) {
    setShelfBusy(true);
    setShelfError(null);
    try {
      const next = await op;
      setShelf(next);
      done?.(next);
    } catch (e) {
      setShelfError(e instanceof Error ? e.message : String(e));
    } finally {
      setShelfBusy(false);
    }
  }

  function submitLinks() {
    const before = shelf.links.length;
    runShelf(addLinks(shelf, linkDraft, { title: linkTitle }), (next) => {
      const added = next.links.length - before;
      if (added === 0) {
        toast("Ссылок не найдено — вставьте адрес, начинающийся с http(s)://");
        return;
      }
      setLinkDraft("");
      setLinkTitle("");
      toast(added === 1 ? "Ссылка добавлена" : `Добавлено ссылок: ${added}`);
    });
  }

  function submitSection() {
    const name = newSection.trim();
    if (!name) return;
    runShelf(addSection(shelf, name), () => {
      setNewSection("");
      toast(`Секция «${name}» создана`);
    });
  }

  function commitSectionRename(id: string) {
    const name = sectionDraft.trim();
    setRenamingSection(null);
    if (name) runShelf(renameSection(shelf, id, name));
  }

  /**
   * Drops the dragged link into `sectionId`, just before `target` (or at the end when the drop
   * landed on the section's empty space). The new position is the midpoint between neighbours, so
   * only the moved card is written.
   */
  function dropLinkBefore(draggedId: string, sectionId: string | null, target: SavedLink | null) {
    const list = linksOfSection(shelf.links, sectionId).filter((l) => l.id !== draggedId);
    const idx = target ? list.findIndex((l) => l.id === target.id) : list.length;
    const position = positionBetween(list[idx - 1]?.position, list[idx]?.position);
    setDraggingLink(null);
    runShelf(moveLink(shelf, draggedId, sectionId, position));
  }

  /** Drops a dragged section before `target`, using the same midpoint trick. */
  function reorderSection(draggedId: string, target: LinkSection) {
    if (draggedId === target.id) return;
    const list = [...shelf.sections].sort((a, b) => a.position - b.position).filter((s) => s.id !== draggedId);
    const idx = list.findIndex((s) => s.id === target.id);
    const position = positionBetween(list[idx - 1]?.position, list[idx]?.position);
    runShelf(moveSection(shelf, draggedId, position));
  }

  /** One link card + the drop-zone behaviour that lets it be dragged into/within a section. */
  function renderLinkCard(l: SavedLink, i: number, sectionId: string | null) {
    return (
      <div
        key={l.id}
        className={cn("group relative", draggingLink === l.id && "opacity-40")}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-knowledge-link", l.id);
          setDraggingLink(l.id);
        }}
        onDragEnd={() => setDraggingLink(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          // Dropping ONTO a card inserts before it — that's how order is changed inside a section.
          const dragged = e.dataTransfer.getData("application/x-knowledge-link");
          if (!dragged || dragged === l.id) return;
          e.stopPropagation();
          dropLinkBefore(dragged, sectionId, l);
        }}
      >
        <a
          href={l.url}
          target="_blank"
          rel="noreferrer"
          title={l.url}
          className="block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/50"
        >
          <LinkThumb domain={l.domain} index={i} />
          <div className="flex flex-col gap-0.5 p-2.5">
            <p className="truncate text-sm font-medium">{l.title || l.domain}</p>
            <p className="truncate text-xs text-muted-foreground">{l.domain} · {formatDate(l.createdAt)}</p>
          </div>
        </a>
        <IconAction
          icon={X}
          label={`Удалить ссылку: ${l.url}`}
          tone="danger"
          onClick={() => runShelf(removeLink(shelf, l.id))}
          reveal
          className="absolute right-1.5 top-1.5 bg-background/80 p-0.5 backdrop-blur"
        />
      </div>
    );
  }

  /**
   * «Ссылки» — своя полка с секциями, как в проектах: создайте секцию («Анимации», «Шрифты»),
   * перетаскивайте карточки внутрь и меняйте порядок. Хранится в Supabase, локально — если ключи
   * не заданы.
   */
  function renderLinksPanel() {
    const q = linkQuery.trim().toLowerCase();
    const match = (l: SavedLink) =>
      !q || `${l.title ?? ""} ${l.domain} ${l.url}`.toLowerCase().includes(q);
    const sections = [...shelf.sections].sort((a, b) => a.position - b.position);

    /** A section (or the unsorted area) — header + its own bento grid, and a drop target. */
    const renderGroup = (section: LinkSection | null) => {
      const id = section?.id ?? null;
      const key = id ?? "__none";
      const items = linksOfSection(shelf.links, id).filter(match);
      // An empty section must stay visible — it's a drop target you just created.
      if (!section && items.length === 0 && shelf.sections.length > 0) return null;
      return (
        <div
          key={key}
          className={cn(
            "flex flex-col gap-2 rounded-lg p-2 transition-colors",
            dragOverGroup === key && "bg-brand/5 ring-1 ring-inset ring-brand/40"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOverGroup(key); }}
          onDragLeave={() => setDragOverGroup((cur) => (cur === key ? null : cur))}
          onDrop={(e) => {
            setDragOverGroup(null);
            const dragged = e.dataTransfer.getData("application/x-knowledge-link");
            // Dropping on the section's empty space appends to its end.
            if (dragged) { dropLinkBefore(dragged, id, null); return; }
            const sec = e.dataTransfer.getData("application/x-knowledge-section");
            if (sec && section) reorderSection(sec, section);
          }}
        >
          <div className="group/sec flex items-center gap-2">
            {section ? (
              <>
                <span
                  className="cursor-grab text-muted-foreground/40"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/x-knowledge-section", section.id)}
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                {renamingSection === section.id ? (
                  <input
                    autoFocus
                    value={sectionDraft}
                    onChange={(e) => setSectionDraft(e.target.value)}
                    onBlur={() => commitSectionRename(section.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitSectionRename(section.id);
                      if (e.key === "Escape") setRenamingSection(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-brand bg-transparent px-1 py-0.5 text-sm font-semibold outline-none"
                  />
                ) : (
                  <h3
                    className="text-sm font-semibold"
                    onDoubleClick={() => { setRenamingSection(section.id); setSectionDraft(section.name); }}
                    title="Двойной клик — переименовать"
                  >
                    {section.name}
                  </h3>
                )}
                <span className="text-xs text-muted-foreground">{items.length}</span>
                <div className="flex-1" />
                <IconAction
                  icon={Trash2}
                  label={`Удалить секцию: ${section.name}`}
                  tone="danger"
                  onClick={() => runShelf(removeSection(shelf, section.id))}
                  reveal
                  className="p-1 opacity-0 group-hover/sec:opacity-100"
                />
              </>
            ) : (
              <h3 className="text-sm font-semibold text-muted-foreground">Без секции</h3>
            )}
          </div>

          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Перетащите сюда ссылки
            </p>
          ) : (
            // Бенто: до 6 карточек в ряд на широком экране, плавно вниз к 2 на телефоне.
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {items.map((l, i) => renderLinkCard(l, i, id))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="text-sm text-muted-foreground">
              Складывайте сюда любые ссылки — можно вставить сразу несколько (с новой строки или через пробел).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitLinks()}
                placeholder="https://… (можно несколько)"
                className="sm:flex-1"
              />
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitLinks()}
                placeholder="Название (необязательно)"
                className="sm:w-56"
              />
              <Button onClick={submitLinks} disabled={!linkDraft.trim() || shelfBusy}>
                <Plus className="h-4 w-4" /> Добавить
              </Button>
            </div>
          </CardContent>
        </Card>

        {shelfError && (
          <Card className="border-risk/30">
            <CardContent className="p-3 text-sm text-risk">{shelfError}</CardContent>
          </Card>
        )}

        {shelf.links.length === 0 && shelf.sections.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="Ссылок пока нет"
            description="Вставьте одну или несколько ссылок выше — они сохранятся карточками с логотипом сайта."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {/* Поиск по названию/домену — полка растёт, находить нужное одним словом. */}
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder="Поиск по названию…"
                  className="pl-9"
                />
              </div>
              <Input
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSection()}
                placeholder="Новая секция…"
                className="w-44"
              />
              <Button variant="outline" onClick={submitSection} disabled={!newSection.trim() || shelfBusy}>
                <Plus className="h-4 w-4" /> Секция
              </Button>
            </div>

            {/* Несортированные сверху, затем секции в своём порядке. */}
            <div className="flex flex-col gap-2">
              {renderGroup(null)}
              {sections.map((s) => renderGroup(s))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <AppShell title="База знаний" description="Конспекты · Библиотека · полка ссылок">
      <Segmented
        ariaLabel="Раздел базы знаний"
        className="mb-4 w-fit"
        value={tab}
        onChange={setTab}
        options={[
          { value: "notes", label: <><NotebookPen className="h-3.5 w-3.5" /> Конспекты</> },
          { value: "library", label: <><LibraryIcon className="h-3.5 w-3.5" /> Библиотека{lib.items.length > 0 && <span className="ml-1 tabular-nums text-muted-foreground">{lib.items.length}</span>}</> },
          { value: "links", label: <><Link2 className="h-3.5 w-3.5" /> Ссылки</> },
        ]}
      />

      {tab === "notes" ? (
        <NotesPanel />
      ) : tab === "library" ? (
        <LibraryPanel
          lib={lib}
          openId={libOpenId}
          pendingDraft={pendingDraft}
          onConsumed={() => { setLibOpenId(null); setPendingDraft(null); }}
        />
      ) : (
        renderLinksPanel()
      )}
    </AppShell>
  );
}
