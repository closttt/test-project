/**
 * История · Craft Dark — the product changelog («Story») in the language of the other screens:
 *
 *   ┌ sidebar ┐ ┌ page ──────────────────────────────────────────────────────────────┐
 *   │         │ │ [tile] История   n обновлений · последнее 12 окт.                   │
 *   │         │ │ Releases timeline (newest first, «новое»)  │ Планируется (editable)   │
 *   └─────────┘ └────────────────────────────────────────────────────────────────────┘
 *
 * Data: lib/changelog (static CHANGELOG + "seen" mark) and lib/roadmap (the local planned list).
 */
import { useEffect, useState } from "react";
import { History, Plus, RotateCcw, X } from "lucide-react";

import { C, R, T, TONE, dashed, plural, type Tone } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { CHANGELOG, markSeen } from "@/lib/changelog";
import { loadPlanned, resetPlanned, savePlanned, TAG_META, TAG_ORDER, type PlanTag, type PlannedItem } from "@/lib/roadmap";
import { uid } from "@/lib/id";

const TAG_TONE: Record<PlanTag, Tone> = { "локально": "green", "позже": "neutral", "решение": "amber" };

const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function Planned() {
  const [planned, setPlanned] = useState<PlannedItem[]>(() => loadPlanned());
  const [draft, setDraft] = useState("");
  useEffect(() => savePlanned(planned), [planned]);

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setPlanned((p) => [{ id: uid(), title: t, tag: "локально", done: false }, ...p]);
    setDraft("");
  };

  return (
    <section className="flex flex-col p-6" style={{ background: C.card, borderRadius: R.card }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 style={T.title}>Планируется</h2>
          <div style={{ ...T.body, color: C.text3, marginTop: 4 }}>
            {planned.length} {plural(planned.length, "пункт", "пункта", "пунктов")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPlanned(resetPlanned())}
          title="Вернуть план по умолчанию"
          className="flex items-center gap-1.5 rounded-full px-3 transition-colors hover:bg-[#19191C]"
          style={{ height: 32, ...T.foot, color: C.text3 }}
        >
          <RotateCcw size={14} strokeWidth={1.75} /> Сброс
        </button>
      </div>

      <form
        className="mt-5 flex items-center gap-2 pl-4 pr-1.5"
        style={{ height: 48, borderRadius: 999, background: C.raise }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Добавить пункт в план"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
          style={{ ...T.body, color: C.text }}
        />
        <button type="submit" aria-label="Добавить" disabled={!draft.trim()} className="grid shrink-0 place-items-center disabled:opacity-40" style={{ width: 36, height: 36, borderRadius: 999, background: C.accent, color: "#fff" }}>
          <Plus size={16} strokeWidth={2} />
        </button>
      </form>

      <div className="mt-5 flex flex-col gap-5">
        {TAG_ORDER.map((tag) => {
          const items = planned.filter((p) => p.tag === tag);
          if (!items.length) return null;
          const tone = TONE[TAG_TONE[tag]];
          return (
            <div key={tag}>
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5" style={{ height: 24, ...T.foot, background: tone.bg, color: tone.fg }}>
                  {TAG_META[tag].label}
                </span>
                <span style={{ ...T.foot, color: C.text3 }}>{items.length}</span>
              </div>
              {items.map((it) => (
                <div key={it.id} className="group flex items-center gap-3 py-2.5" style={dashed}>
                  <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: tone.dot }} />
                  <span className="min-w-0 flex-1" style={{ ...T.body, color: C.text }}>
                    {it.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPlanned((p) => p.filter((x) => x.id !== it.id))}
                    title="Удалить пункт"
                    aria-label="Удалить пункт"
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    style={{ color: C.text3 }}
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
        {planned.length === 0 && (
          <div className="py-6 text-center" style={{ ...T.body, color: C.text3 }}>
            Список пуст
          </div>
        )}
      </div>
    </section>
  );
}

export default function ChangelogCraft() {
  // Opening the page marks the newest release as seen (clears the dot in the sidebar).
  useEffect(() => {
    markSeen();
    window.dispatchEvent(new Event("crm-changelog-seen"));
  }, []);
  const latest = CHANGELOG[0];

  return (
    <CraftShell
      active="changelog"
      crumb="История"
      title="История"
      icon={History}
      subtitle={`${CHANGELOG.length} ${plural(CHANGELOG.length, "обновление", "обновления", "обновлений")} · последнее ${latest ? day(latest.date) : "—"}`}
    >
      <div className="mt-6 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-3">
          {CHANGELOG.map((r, i) => (
            <article key={`${r.version}-${r.date}-${i}`} className="flex gap-5 p-6" style={{ background: C.card, borderRadius: R.card }}>
              <span
                className="grid shrink-0 place-items-center"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: i === 0 ? "linear-gradient(180deg,#3D9DFF 0%,#0A6CF0 100%)" : C.raise,
                  color: i === 0 ? "#fff" : C.text2,
                  ...T.num,
                  fontSize: 15,
                }}
              >
                {r.version}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="min-w-0" style={{ ...T.title, fontSize: 19 }}>
                    {r.title}
                  </h2>
                  {i === 0 && (
                    <span className="inline-flex items-center rounded-full px-2.5" style={{ height: 24, ...T.foot, background: TONE.blue.bg, color: TONE.blue.fg }}>
                      новое
                    </span>
                  )}
                  <span className="ml-auto whitespace-nowrap" style={{ ...T.foot, color: C.text3 }}>
                    {day(r.date)}
                  </span>
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {r.items.map((it, j) => (
                    <li key={j} className="flex gap-3" style={{ ...T.body, fontSize: 15, lineHeight: 1.5, color: C.text2 }}>
                      <span className="mt-[9px] shrink-0" style={{ width: 5, height: 5, borderRadius: 9, background: i === 0 ? C.accent : C.text3 }} />
                      <span className="min-w-0">{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
        <div className="xl:sticky xl:top-5">
          <Planned />
        </div>
      </div>
    </CraftShell>
  );
}

