/**
 * Settings · Craft Dark · v1 «Разделы с оглавлением» — one calm column of section cards with a
 * sticky section index on the left (refs 23, 24). Each row: label + description on the left
 * column, the control in the right column — the ref-23 two-column row.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { C, R, T, dashed } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { GROUPS, ItemText, Overlays, groupSummary, matchItem, useSettingsModel, visibleItems, type GroupId, type Item } from "./_parts";

/** Row layout by the content column's width: the full two-column row, a tighter one, or stacked. */
type RowMode = "wide" | "mid" | "stack";
const ROW_COLS: Record<RowMode, string> = { wide: "minmax(0,300px) minmax(0,1fr)", mid: "minmax(0,240px) minmax(0,1fr)", stack: "minmax(0,1fr)" };

function SplitRow({ item, mode, children }: { item: Item; mode: RowMode; children: React.ReactNode }) {
  return (
    <div className={`grid items-start ${mode === "wide" ? "gap-x-10" : "gap-x-6"} gap-y-3 px-6 py-5`} style={{ gridTemplateColumns: ROW_COLS[mode], ...dashed }} data-setting={item.id}>
      <ItemText item={item} />
      <div className={`flex min-w-0 ${item.size === "block" ? "flex-col" : "items-center"} pt-0.5`} style={{ minHeight: 36 }}>
        {children}
      </div>
    </div>
  );
}

export default function SettingsSections() {
  const m = useSettingsModel();
  const c = m.ctl;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<GroupId>("day");
  const refs = useRef<Partial<Record<GroupId, HTMLElement | null>>>({});
  // Width of the page body (sidebar-independent): the section index hides and rows tighten/stack
  // when there's no room, so nothing overflows at 1280 / 1024.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyW, setBodyW] = useState(0);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBodyW(e.contentRect.width));
    ro.observe(el);
    setBodyW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const showIndex = bodyW === 0 || bodyW >= 760;
  const contentW = showIndex ? bodyW - 232 : bodyW;
  const rowMode: RowMode = bodyW === 0 || contentW >= 820 ? "wide" : contentW >= 560 ? "mid" : "stack";

  const q = query.trim();
  const sections = useMemo(
    () => GROUPS.map((g) => ({ g, items: visibleItems(c).filter((i) => i.group === g.id && matchItem(i, q)) })).filter((s) => s.items.length > 0),
    [c, q]
  );

  // Scroll-spy: the section whose top passed the upper third of the viewport is active.
  useEffect(() => {
    const on = () => {
      let cur: GroupId | null = null;
      for (const s of sections) {
        const el = refs.current[s.g.id];
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.33) cur = s.g.id;
      }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4 && sections.length) cur = sections[sections.length - 1].g.id;
      setActive(cur ?? sections[0]?.g.id ?? "day");
    };
    on();
    // Capture phase: also catches a scrolling app container, not only the window.
    document.addEventListener("scroll", on, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", on, { capture: true });
  }, [sections]);

  const go = (id: GroupId) => refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

  const total = visibleItems(c).length;

  return (
    <CraftShell
      active="settings"
      crumb="Настройки"
      subtitle={`${total} настроек · всё применяется сразу`}
      search={{ value: query, onChange: setQuery, placeholder: "Поиск настроек" }}
    >
      <div ref={bodyRef} className="mt-6 grid items-start gap-3" style={{ gridTemplateColumns: showIndex ? "220px minmax(0,1fr)" : "minmax(0,1fr)" }}>
        {showIndex && (
        <nav data-lab-block="index" className="sticky top-5 flex flex-col gap-1 p-2" style={{ background: C.card, borderRadius: R.card }} aria-label="Разделы настроек">
          {GROUPS.map((g) => {
            const has = sections.some((s) => s.g.id === g.id);
            const on = active === g.id && has;
            const Icon = g.icon;
            return (
              <button
                key={g.id}
                type="button"
                disabled={!has}
                onClick={() => go(g.id)}
                className={`flex items-center gap-3 px-3 text-left transition-colors duration-150 disabled:opacity-35 ${on ? "" : "hover:bg-[#19191C]"}`}
                style={{ height: 44, borderRadius: R.small, background: on ? "rgba(10,132,255,0.14)" : undefined, color: on ? C.text : C.text2, fontSize: 14 }}
              >
                <Icon size={16} strokeWidth={1.75} color={on ? C.accent : C.text2} />
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
              </button>
            );
          })}
        </nav>
        )}

        <div className="flex min-w-0 flex-col gap-3">
          {sections.length === 0 && (
            <div className="grid place-items-center px-6 py-16 text-center" style={{ borderRadius: R.card, border: `1px dashed ${C.line2}`, ...T.body, color: C.text3 }}>
              Ничего не найдено по «{q}»
            </div>
          )}
          {sections.map(({ g, items }) => {
            const Icon = g.icon;
            return (
              <section
                key={g.id}
                ref={(el) => {
                  refs.current[g.id] = el;
                }}
                data-lab-block={`section-${g.id}`}
                className="overflow-hidden"
                style={{ background: C.card, borderRadius: R.card, scrollMarginTop: 20 }}
              >
                <header className="flex items-center justify-between gap-4 px-6" style={{ minHeight: 76, ...dashed }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center" style={{ borderRadius: R.small, background: C.raise, color: C.text2 }}>
                      <Icon size={18} strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <h2 style={T.title}>{g.label}</h2>
                      <div className="truncate" style={{ ...T.body, color: C.text3, marginTop: 2 }}>
                        {g.desc}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap" style={{ ...T.foot, color: C.text2, padding: "6px 12px", borderRadius: 999, background: C.raise }}>
                    {groupSummary(g.id, c, m)}
                  </span>
                </header>
                {items.map((it) => (
                  <SplitRow key={it.id} item={it} mode={rowMode}>
                    {it.control(c, m)}
                  </SplitRow>
                ))}
              </section>
            );
          })}
          <div style={{ height: 8 }} />
        </div>
      </div>
      <Overlays m={m} />
    </CraftShell>
  );
}
