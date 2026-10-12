/**
 * «Индекс» · Что нового (Story) — the product changelog as an editorial timeline + the editable
 * «what's planned» backlog.
 * Header (ascii, chip = current version) → Stats → 01 releases: big version numeral on the left,
 * title + numbered change list on the right, latest three open, the rest fold into index rows →
 * 02 planned, a sticky aside: add line, groups by tag, remove on hover, reset.
 *
 * Same lib as the real page: markSeen() on open, loadPlanned / savePlanned / resetPlanned.
 * Unread = releases newer than the version seen before this visit (what ChangelogButton's dot
 * means). One lime element: that unread marker.
 */
import { useEffect, useMemo, useState } from "react";

import { CHANGELOG, latestVersion, loadLastSeen, markSeen } from "@/lib/changelog";
import { loadPlanned, savePlanned, resetPlanned, TAG_META, TAG_ORDER, type PlannedItem } from "@/lib/roadmap";
import { formatDate } from "@/lib/format";
import { uid } from "@/lib/id";
import { B, T, tab, pad2, display, Page, PageHeader, SectionHead, Stats, Hook, Sparkle, Tag, plural } from "@/design-lab/screens/_kit/index";

/** Numeric version compare: «4.10» > «4.9». */
function cmpVersion(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }).replace(/\s*г\.$/, "");

export default function Changelog() {
  // Read what was seen BEFORE this visit, then mark the latest as seen (same as the real page).
  const [lastSeen] = useState(() => loadLastSeen());
  useEffect(() => {
    markSeen();
  }, []);
  const isNew = (v: string) => (lastSeen ? cmpVersion(v, lastSeen) > 0 : v === latestVersion());
  const unread = CHANGELOG.filter((r) => isNew(r.version)).length;

  // Keyed by index: versions can repeat in the log (two «1.0» entries).
  const keyOf = (i: number) => `${CHANGELOG[i].version}-${i}`;
  const [open, setOpen] = useState<Set<string>>(() => new Set(CHANGELOG.map((r, i) => (i < 3 || isNew(r.version) ? keyOf(i) : "")).filter(Boolean)));
  const allOpen = open.size === CHANGELOG.length;
  const toggle = (v: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });

  const [planned, setPlanned] = useState<PlannedItem[]>(() => loadPlanned());
  const [draft, setDraft] = useState("");
  useEffect(() => savePlanned(planned), [planned]);
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setPlanned((p) => [{ id: uid(), title: t, tag: "локально", done: false }, ...p]);
    setDraft("");
  };

  const totalChanges = useMemo(() => CHANGELOG.reduce((s, r) => s + r.items.length, 0), []);
  const first = CHANGELOG[CHANGELOG.length - 1];
  const latest = CHANGELOG[0];

  return (
    <Page>
      <PageHeader
        chip={latest ? `v${latest.version} · ${formatDate(latest.date)}` : undefined}
        title="Что нового"
        deck="Хроника обновлений приложения и что планируется дальше."
        graphic="ascii"
        seed={31}
      />

      <Stats
        items={[
          { k: "Версия", v: latest?.version ?? "—", sub: latest ? longDate(latest.date) : undefined },
          { k: "Релизов", v: CHANGELOG.length, sub: first ? `с ${longDate(first.date)}` : undefined },
          { k: "Изменений", v: totalChanges, sub: "во всех релизах" },
          { k: "В плане", v: planned.length, sub: `${planned.filter((p) => p.tag === "локально").length} можно сейчас` },
        ]}
      />

      <div className="mt-16 grid grid-cols-4 gap-x-5">
        {/* ── 01 Релизы ──────────────────────────────────────────────────────────────────── */}
        <section className="col-span-3 min-w-0 pr-5">
          <SectionHead
            n="01"
            title="Релизы"
            meta={
              <span className="flex items-center gap-4">
                {unread > 0 && (
                  <span>
                    {unread} {plural(unread, "новый", "новых", "новых")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(allOpen ? new Set() : new Set(CHANGELOG.map((_, i) => keyOf(i))))}
                  className="outline-none transition-colors hover:text-white focus-visible:text-white"
                >
                  {allOpen ? "свернуть все" : "раскрыть все ↳"}
                </button>
              </span>
            }
          />
          <ol className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
            {CHANGELOG.map((r, i) => {
              const expanded = open.has(keyOf(i));
              const fresh = isNew(r.version);
              return (
                <li key={keyOf(i)} className="grid gap-x-5" style={{ gridTemplateColumns: "200px minmax(0,1fr)", borderBottom: `1px solid ${B.l7}` }}>
                  <button
                    type="button"
                    onClick={() => toggle(keyOf(i))}
                    aria-expanded={expanded}
                    className="group col-span-2 grid items-baseline gap-x-5 pb-5 pt-6 text-left outline-none focus-visible:bg-white/[0.03]"
                    style={{ gridTemplateColumns: "200px minmax(0,1fr)" }}
                  >
                    <span className="flex items-baseline gap-4">
                      <span style={{ ...display(expanded ? 56 : 32), ...tab, color: expanded ? B.text : B.text2, transition: `font-size .2s ${B.ease}` }}>{r.version}</span>
                      <span className="flex flex-col gap-1.5" style={{ ...T.meta, color: B.text3, ...tab }}>
                        {fresh && (
                          <span className="flex items-center gap-1.5" style={{ color: B.lime }}>
                            <span className="h-[6px] w-[6px]" style={{ background: B.lime }} />
                            новое
                          </span>
                        )}
                        {!fresh && i === 0 && <span style={{ color: B.text2 }}>текущая</span>}
                        <span>{longDate(r.date)}</span>
                      </span>
                    </span>
                    <span className="flex min-w-0 items-baseline justify-between gap-6">
                      <span className="min-w-0 transition-colors duration-200 group-hover:text-white" style={{ ...(expanded ? T.displayS : T.title), color: expanded ? B.text : B.text2 }}>
                        {r.title}
                      </span>
                      <span className="shrink-0 whitespace-nowrap" style={{ ...T.meta, color: B.text3, ...tab }}>
                        {r.items.length} {plural(r.items.length, "изменение", "изменения", "изменений")}
                        <span className="ml-2 inline-block" style={{ color: expanded ? B.text : B.text3 }}>
                          <Sparkle size={10} open={expanded} />
                        </span>
                      </span>
                    </span>
                  </button>
                  {expanded && (
                    <ol className="col-start-2 mb-8 min-w-0" style={{ borderTop: `1px solid ${B.l7}` }}>
                      {r.items.map((it, j) => (
                        <li key={j} className="grid gap-4 py-3" style={{ gridTemplateColumns: "24px minmax(0,1fr)", borderBottom: j < r.items.length - 1 ? `1px solid ${B.l5}` : undefined }}>
                          <span className="pt-[3px]" style={{ ...T.num, color: B.off }}>
                            {pad2(j + 1)}
                          </span>
                          <span style={{ ...T.body, color: B.text2 }}>{it}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── 02 Планируется ─────────────────────────────────────────────────────────────── */}
        <aside className="min-w-0">
          <div className="sticky top-8">
            <SectionHead
              n="02"
              title="Планируется"
              size="s"
              meta={
                <button
                  type="button"
                  onClick={() => setPlanned(resetPlanned())}
                  title="Вернуть план по умолчанию"
                  className="outline-none transition-colors hover:text-white focus-visible:text-white"
                >
                  сброс
                </button>
              }
            />
            <p className="mt-4" style={{ ...T.meta, color: B.text3 }}>
              Черновик планов поверх роадмапа. Сделанное убирается само; удаляйте ненужное и добавляйте своё — всё хранится локально.
            </p>
            <form
              className="mt-5 flex h-12 items-center gap-3"
              style={{ borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l7}` }}
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <span style={{ color: B.text3 }}>
                <Hook size={14} />
              </span>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Добавить пункт в план…"
                aria-label="Добавить пункт в план"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]"
                style={{ ...T.body, color: B.text }}
              />
            </form>

            {planned.length === 0 ? (
              <p className="py-5" style={{ ...T.body, color: B.text3 }}>
                Список планов пуст. Добавьте пункт или нажмите «сброс».
              </p>
            ) : (
              TAG_ORDER.map((tag) => {
                const items = planned.filter((p) => p.tag === tag);
                if (!items.length) return null;
                return (
                  <div key={tag} className="mt-7">
                    <div className="mb-2 flex items-center justify-between">
                      <Tag color={tag === "решение" ? B.text2 : B.text3}>{TAG_META[tag].label}</Tag>
                      <span style={{ ...T.num, color: B.text3 }}>{items.length}</span>
                    </div>
                    <ul style={{ borderTop: `1px solid ${B.l10}` }}>
                      {items.map((item) => (
                        <li key={item.id} className="group flex items-start gap-3 py-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
                          <span className="min-w-0 flex-1" style={{ ...T.body, color: B.text2 }}>
                            {item.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPlanned((p) => p.filter((x) => x.id !== item.id))}
                            title="Удалить пункт"
                            aria-label={`Удалить пункт: ${item.title}`}
                            className="mt-[3px] shrink-0 opacity-0 outline-none transition-[opacity,color] duration-200 hover:!text-[#FF5A36] focus-visible:opacity-100 group-hover:opacity-100"
                            style={{ color: B.text3 }}
                          >
                            <Sparkle size={10} open />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </Page>
  );
}
