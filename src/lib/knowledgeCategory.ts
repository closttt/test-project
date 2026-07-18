import type { KnowledgeCard } from "@/types";

/**
 * "Уровни/категории" for Knowledge cards — a single **category (раздел)** per card, giving one
 * level of hierarchy above the existing flat tags. Cards come from Supabase (read-only in the
 * browser, written by the Hermes agent), so rather than a schema change we can't verify, the
 * category assignment is a client-side override stored in localStorage, keyed by card id. A card
 * with no override falls back to its first tag, then to "Без раздела". This keeps everything in
 * the browser and reversible.
 */

const KEY = "crm-knowledge-category-v1";
export const UNSORTED = "Без раздела";

export type CategoryOverrides = Record<string, string>;

export function loadCategoryOverrides(): CategoryOverrides {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as CategoryOverrides;
  } catch {
    return {};
  }
}

/** Sets (or clears, when category is null/empty) a card's category override, and returns the next map. */
export function setCategoryOverride(
  overrides: CategoryOverrides,
  cardId: string,
  category: string | null
): CategoryOverrides {
  const next = { ...overrides };
  const trimmed = category?.trim();
  if (trimmed) next[cardId] = trimmed;
  else delete next[cardId];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** The card's effective category: explicit override → first tag → "Без раздела". */
export function resolveCategory(card: KnowledgeCard, overrides: CategoryOverrides): string {
  return overrides[card.id] ?? card.tags[0] ?? UNSORTED;
}

/** All distinct categories present across the cards, sorted, with "Без раздела" always last. */
export function allCategories(cards: KnowledgeCard[], overrides: CategoryOverrides): string[] {
  const set = new Set(cards.map((c) => resolveCategory(c, overrides)));
  const list = [...set].filter((c) => c !== UNSORTED).sort((a, b) => a.localeCompare(b));
  if (set.has(UNSORTED)) list.push(UNSORTED);
  return list;
}

export interface CategoryGroup {
  category: string;
  cards: KnowledgeCard[];
}

/** Groups cards by resolved category, preserving the input order within each group. */
export function groupByCategory(cards: KnowledgeCard[], overrides: CategoryOverrides): CategoryGroup[] {
  const order = allCategories(cards, overrides);
  const byCat = new Map<string, KnowledgeCard[]>(order.map((c) => [c, []]));
  for (const card of cards) byCat.get(resolveCategory(card, overrides))!.push(card);
  return order.map((category) => ({ category, cards: byCat.get(category)! })).filter((g) => g.cards.length > 0);
}
