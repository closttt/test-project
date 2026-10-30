/**
 * Posts forwarded to the Telegram bot (table knowledge_cards) that aren't in the library yet.
 * The old page copied them into the library by itself on every visit; here the page only READS
 * them and offers «Из Telegram · N» — they are added when the owner clicks it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchKnowledgeCards, isSupabaseConfigured } from "@/lib/supabase";
import { detectType, newDraft, type LibraryDraft } from "@/lib/library";
import { prettyDomain } from "@/lib/links";
import type { KnowledgeCard } from "@/types";
import type { Knowledge } from "./_parts";

/** Same key as the old page: cards already taken into the library (so deleting the item doesn't bring the post back). */
const IMPORTED_KEY = "crm-knowledge-imported-v1";

function loadImported(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(IMPORTED_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? (v as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveImported(s: Set<string>) {
  try {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify([...s]));
  } catch {
    /* quota — the sourceCardId check still dedupes */
  }
}

/** A card becomes a library item: title, text, picture and tags carry over. */
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
  d.type = d.url ? detectType(d.url) : "post";
  return d;
}

export function useTelegramInbox(k: Knowledge) {
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [imported, setImported] = useState<Set<string>>(loadImported);
  const [taking, setTaking] = useState<Set<string>>(() => new Set());

  // Read-only: fetch on open and whenever the tab comes back into view.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let alive = true;
    const load = () =>
      fetchKnowledgeCards()
        .then((cs) => alive && setCards(cs))
        .catch(() => undefined); // offline / table missing — the library itself still works
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const fresh = useMemo(() => {
    if (k.lib.loading) return [];
    const have = new Set(k.lib.items.map((i) => i.sourceCardId).filter(Boolean));
    return cards.filter((c) => !imported.has(c.id) && !taking.has(c.id) && !have.has(c.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest first → newest ends on top
  }, [cards, imported, taking, k.lib.items, k.lib.loading]);

  const takeAll = useCallback(() => {
    const batch = fresh;
    if (batch.length === 0) return;
    setTaking((t) => new Set([...t, ...batch.map((c) => c.id)]));
    for (const c of batch) {
      k.lib.add(cardDraft(c), () =>
        setImported((cur) => {
          const next = new Set(cur).add(c.id);
          saveImported(next);
          return next;
        })
      );
    }
    k.toast(batch.length === 1 ? "Пост из Telegram добавлен в очередь" : `Из Telegram добавлено: ${batch.length}`);
    // Whatever failed to save shows up again (the add itself reports the error).
    setTimeout(() => setTaking((t) => new Set([...t].filter((id) => !batch.some((c) => c.id === id)))), 15000);
  }, [fresh, k.lib, k.toast]);

  return { count: fresh.length, takeAll };
}
