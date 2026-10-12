/**
 * «Индекс» · База знаний — three numbered tabs on one page:
 *   01 Конспекты — the Obsidian-style vault: folder tree in column 1, the note set as a page in
 *      columns 2–3 (the app's TipTap editor, re-typeset), properties in column 4;
 *   02 Библиотека — one paste field, the four numbers, filters, an index of dithered covers; the
 *      item opens as a right-hand «case» panel. Telegram posts land here on their own;
 *   03 Ссылки — the link shelf as hairline lists by section, two sections per row, drag between.
 * One lime element: the header action, which follows the tab.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { isSupabaseConfigured, fetchKnowledgeCards } from "@/lib/supabase";
import { newDraft, detectType, type LibraryDraft } from "@/lib/library";
import { prettyDomain } from "@/lib/links";
import type { KnowledgeCard } from "@/types";
import { Page, PageHeader, Button, NumTabs, plural } from "@/design-lab/screens/_kit/index";
import { ProseStyles } from "./Notes.parts";
import { VaultPanel, LibraryIndex, LinksShelf, useVault, useQuietLibrary, useQuietShelf } from "./Knowledge.parts";

type KnowledgeTab = "notes" | "library" | "links";
const POLL_MS = 60_000;
const IMPORTED_KEY = "crm-knowledge-imported-v1";

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
  try {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify([...s]));
  } catch {
    /* the sourceCardId check still dedupes */
  }
}

/** A Telegram card → a library draft: title, text, picture and tags carry over. */
function cardDraft(c: KnowledgeCard): LibraryDraft {
  const d = newDraft(c.description ?? "");
  d.title = c.title;
  d.description = c.description?.slice(0, 600) || undefined;
  d.coverUrl = c.imageUrl;
  d.tags = [...c.tags];
  d.sourceCardId = c.id;
  if (!d.url && c.sourceUrl) {
    d.url = c.sourceUrl;
    d.domain = prettyDomain(c.sourceUrl);
  }
  d.type = d.url ? detectType(d.url) : "article";
  return d;
}

const ACTION: Record<KnowledgeTab, string> = {
  notes: "Новая заметка",
  library: "Добавить по ссылке",
  links: "Добавить ссылку",
};

export default function Knowledge() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const navState = (location.state ?? {}) as { tab?: KnowledgeTab; openLibraryId?: string };
  const isShare = ["url", "text", "title"].some((k) => searchParams.has(k));
  const [tab, setTab] = useState<KnowledgeTab>(() => (isShare ? "library" : navState.tab === "library" || navState.tab === "links" ? navState.tab : "notes"));
  const [libOpenId, setLibOpenId] = useState<string | null>(navState.openLibraryId ?? null);
  const [shared, setShared] = useState<string | null>(() => (isShare ? [searchParams.get("url"), searchParams.get("text"), searchParams.get("title")].filter(Boolean).join(" ") : null));
  useEffect(() => {
    if (isShare || navState.tab || navState.openLibraryId) navigate("/knowledge", { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vault = useVault();
  const lib = useQuietLibrary();
  const shelf = useQuietShelf();
  const primary = useRef<() => void>(() => {});

  // Posts forwarded to the Telegram bot become library items on their own (poll + on return).
  const libRef = useRef(lib);
  libRef.current = lib;
  const importing = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isSupabaseConfigured() || lib.loading) return;
    const importCards = async () => {
      let cards: KnowledgeCard[];
      try {
        cards = await fetchKnowledgeCards();
      } catch {
        return;
      }
      const imported = loadImported();
      const fresh = cards
        .filter((c) => !imported.has(c.id) && !importing.current.has(c.id))
        .filter((c) => !libRef.current.items.some((i) => i.sourceCardId === c.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const c of fresh) {
        importing.current.add(c.id);
        libRef.current.add(cardDraft(c), () => markImported(c.id));
      }
    };
    void importCards();
    const id = setInterval(importCards, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void importCards();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [lib.loading]);

  const noteCount = vault.entries.filter((e) => e.kind === "note").length;
  const linkCount = shelf.shelf.links.length;

  return (
    <Page>
      <ProseStyles />
      <PageHeader
        title="База знаний"
        deck={
          <>
            Конспекты курсов, библиотека прочитанного и полка ссылок. {noteCount} {plural(noteCount, "конспект", "конспекта", "конспектов")}, {lib.items.length} в библиотеке, {linkCount}{" "}
            {plural(linkCount, "ссылка", "ссылки", "ссылок")}.
          </>
        }
        graphic="ascii"
        seed={21}
        actions={
          <Button size="lg" onClick={() => primary.current()}>
            {ACTION[tab]}
          </Button>
        }
      />

      <div className="max-w-[760px]">
        <NumTabs<KnowledgeTab>
          value={tab}
          onChange={setTab}
          items={[
            { id: "notes", label: "Конспекты", count: noteCount },
            { id: "library", label: "Библиотека", count: lib.items.length },
            { id: "links", label: "Ссылки", count: linkCount },
          ]}
        />
      </div>

      <div className="mt-12">
        {tab === "notes" ? (
          <VaultPanel vault={vault} primary={primary} />
        ) : tab === "library" ? (
          <LibraryIndex
            lib={lib}
            primary={primary}
            openId={libOpenId}
            pendingRaw={shared}
            onConsumed={() => {
              setLibOpenId(null);
              setShared(null);
            }}
          />
        ) : (
          <LinksShelf api={shelf} primary={primary} />
        )}
      </div>
    </Page>
  );
}
