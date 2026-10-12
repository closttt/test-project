/**
 * Design-lab decision board config. Every decision = one screen (or the global direction) with
 * its variants. A variant is a set of skins (CSS in src/design-lab/skins) layered over the REAL
 * app — so every variant works exactly like the product; only the UI differs.
 */

import type { BlockMeta, StyleMeta } from "@/design-lab/screens/types";

export interface RefImage {
  id: string;
  file: string;
  title: string;
}

/** The owner's reference set (design-lab/refs, copied from the brief; gitignored). */
export const REFS: Record<string, RefImage> = Object.fromEntries(
  (
    [
      ["1", "1.png", "Wallet · главная"],
      ["2", "2.png", "Wallet · детали поверх"],
      ["3", "3.png", "Studio · канбан"],
      ["4", "4.jpg", "Retainly · таблица"],
      ["5", "5.jpg", "Relatel · отчёт"],
      ["6", "6.jpg", "Taskplus · канбан"],
      ["7", "7.jpg", "Baked · почта"],
      ["8", "8.jpg", "Celoci · дашборд"],
      ["9", "9.jpg", "Solexa · мониторинг"],
      ["10", "10.jpg", "Mailite · интеграции"],
      ["11", "11.webp", "Workspace · заказы"],
      ["12", "12.jpg", "MynaUI · команда"],
      ["13", "13.png", "Карточка пациента"],
      ["14", "14.jpg", "Azura · портфель"],
      ["15", "15.jpg", "WealthWise · обзор"],
      ["16", "16.jpg", "Network devices"],
      ["17", "17.jpg", "Задача · дровер"],
      ["18", "18.webp", "Inbox · уведомления"],
      ["19", "19.png", "Cold · задачи"],
      ["20", "20.webp", "Luminar · доки"],
      ["21", "21.jpg", "Проекты · уведомления"],
      ["22", "22.webp", "CAD · уведомления"],
      ["23", "23.jpg", "Untitled · безопасность"],
      ["24", "24.webp", "Teak · настройки"],
      ["25", "25.webp", "LTD · форма"],
      ["28", "28.png", "API · изменения"],
      ["29", "29.png", "Container runtime"],
      ["30", "30.png", "Import repo"],
      ["31", "31.png", "Stuudio · сетка"],
      ["32", "32.png", "Stuudio · кольца"],
      ["33", "33.png", "Stuudio · тарифы"],
      ["35", "35.jpg", "JCA · пульт"],
      ["dc-sent", "dc-sent.png", "DocumentCraft · реестр"],
      ["dc-doc", "dc-doc.png", "DocumentCraft · документ"],
      ["dc-setup", "dc-setup.png", "DocumentCraft · форма"],
      ["dc-notif", "dc-notif.png", "DocumentCraft · уведомления"],
      ["dc-popup", "dc-popup.png", "DocumentCraft · попап"],
    ] as const
  ).map(([id, file, title]) => [id, { id, file, title }])
);

export interface Variant {
  id: string;
  letter: string;
  name: string;
  /** Skin files (without .css) applied over the real app. Empty + no screen = current production UI. */
  skins: string[];
  /** A composed screen (screens/<screen>.tsx) — built from scratch on the same data/actions. */
  screen?: string;
  /** Style group id (composed screens). */
  style?: string;
  composition: string;
  refs: string[];
  benefit: string;
  tradeoff: string;
  /** Reviewable elements (composed screens). */
  blocks?: BlockMeta[];
}

export interface StyleGroup {
  id: string;
  name: string;
  summary: string;
}

export interface Decision {
  id: string;
  code: string;
  title: string;
  /** Route the preview opens on (real-app variants). */
  route: string;
  summary: string;
  status: "open" | "queued";
  /** Quick links to flip the preview between sections (composed app variants). */
  routes?: { label: string; route: string }[];
  styles?: StyleGroup[];
  variants: Variant[];
}

const NOW: Variant = {
  id: "now",
  letter: "0",
  name: "Сейчас",
  skins: [],
  composition: "Текущий интерфейс без изменений — точка отсчёта.",
  refs: [],
  benefit: "Для сравнения.",
  tradeoff: "—",
};

/** Every screens/<screen>/<style>/meta.ts — builders add styles/variants without touching this file. */
const metaFiles = import.meta.glob("./screens/*/*/meta.ts", { eager: true, import: "default" }) as Record<string, StyleMeta>;

function composed(screen: string): { styles: StyleGroup[]; variants: Variant[] } {
  const metas = Object.entries(metaFiles)
    .filter(([path]) => path.startsWith(`./screens/${screen}/`))
    .map(([, m]) => m)
    .sort((a, b) => a.order - b.order);
  const styles = metas.map((m) => ({ id: m.id, name: m.name, summary: m.summary }));
  const variants = metas.flatMap((m, si) =>
    m.variants.map((v, vi) => ({
      id: `${m.id}-${v.id}`,
      letter: `${String.fromCharCode(65 + si)}${vi + 1}`,
      name: v.name,
      skins: [],
      screen: `${screen}/${m.id}/${v.id}`,
      style: m.id,
      composition: v.composition,
      refs: v.refs,
      benefit: v.benefit,
      tradeoff: v.tradeoff,
      blocks: v.blocks,
    }))
  );
  return { styles, variants };
}

function queued(code: string, title: string, route: string): Decision {
  return {
    id: code.toLowerCase(),
    code,
    title,
    route,
    summary: "В очереди — следующим после дашборда. Пока показан текущий экран.",
    status: "queued",
    variants: [NOW],
  };
}

const dash = composed("dashboard");

/** The one screen we work on now — the owner's hybrid. Other decisions are hidden from the board
 *  (their files stay in screens/ and can be brought back by listing them here). */
const mix = dash.variants.filter((v) => v.style === "mix");

export const DECISIONS: Decision[] = [
  {
    id: "main",
    code: "01",
    title: "Главный экран · Бенто × Канбан",
    route: "/",
    summary:
      "Главный экран в стиле Craft Dark. Слева — элементы экрана: открой любой, приложи референсы и напиши, что в нём поменять. Превью ниже — живой экран целиком на реальных данных, всё кликается.",
    status: "open",
    styles: dash.styles.filter((s) => s.id === "mix"),
    variants: mix,
  },
  ...screenDecisions(),
];

/**
 * Round 3: every other screen gets 5 Craft Dark concepts (screens/<screen>/craft/v1…v5 + meta.ts),
 * built on the main screen's shell. A screen shows up on the board as soon as its meta exists.
 */
function screenDecisions(): Decision[] {
  const list: [screen: string, code: string, title: string, route: string][] = [
    ["tasks", "02", "Задачи", "/tasks"],
    ["projects", "03", "Проекты", "/projects"],
    ["project", "04", "Карточка проекта", "/projects"],
    ["clients", "05", "Клиенты", "/clients"],
    // «Планер» removed by the owner on 2026-10-12 (files kept in screens/planner).
    ["notes", "07", "Заметки", "/notes"],
    ["knowledge", "08", "База знаний", "/knowledge"],
    ["analytics", "09", "Аналитика", "/analytics"],
    ["settings", "10", "Настройки", "/settings"],
    ["achievements", "11", "Достижения", "/achievements"],
  ];
  return list
    .map(([screen, code, title, route]) => {
      const c = composed(screen);
      return {
        id: screen,
        code,
        title,
        route,
        summary:
          c.variants.length === 1 || c.variants[0]?.blocks?.length
            ? `«${title}» · выбрана концепция «${c.variants[0].name}». Слева под экраном — его элементы: открой любой, приложи референсы и напиши, что поменять.`
            : `«${title}» в языке главного экрана: ${c.variants.length} концепций с разной композицией на реальных данных. Выбери одну в оценке ниже — дальше разобью её на элементы, как главный экран.`,
        status: "open" as const,
        styles: c.styles,
        variants: c.variants,
      };
    })
    .filter((d) => d.variants.length > 0);
}
