/**
 * Notes · Craft Dark · «Быстрая запись» (the owner's pick) — capture first, then a plain list (refs 1, 8):
 *
 *   ┌ page panel ─────────────────────────────────────────────────────────┐
 *   │ Рабочий стол / Заметки                         date · bell · Новая  │
 *   │ [tile] Заметки  n заметок                                           │
 *   │ ┌ hero composer ─────────────────────────────┐ ┌ 14 дней ─────────┐ │
 *   │ │ Заголовок (24) · текст · теги · проект     │ │ n  capsule bars  │ │
 *   │ │                         [Сохранить заметку]│ │ закреплено · …   │ │
 *   │ └────────────────────────────────────────────┘ └──────────────────┘ │
 *   │ ┌ Все заметки   [Все][Закреплённые][#…][Проект ⌄]  сортировка ──────┐ │
 *   │ │ ● title — preview            #tag  project              дата    │ │
 *   │ └──────────────────────────────────────────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * Elements carry data-lab-block="…" so the board can open each one on its own page
 * (capture, capture-meta, stats, stats-counts, list-head, list, row — plus the shell's nav/topbar/title).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { NotebookPen, Plus } from "lucide-react";

import { Btn, C, CapsuleBars, R, T, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { localDayStr } from "@/lib/format";
import type { Note } from "@/types";
import {
  NothingFound,
  FilterPill,
  HoverActions,
  NoteEditor,
  PillSelect,
  PinMark,
  SheetsArt,
  SortPills,
  SORTS_SHORT,
  TagChip,
  TagPicker,
  UndoBar,
  noteDate,
  openChecks,
  preview,
  useAutosize,
  useEditor,
  useNotesModel,
  type NotesModel,
} from "./_parts";

function Hero({ m, titleRef }: { m: NotesModel; titleRef: React.RefObject<HTMLInputElement> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const ref = useAutosize(body, 120);
  const ok = !!(title.trim() || body.trim());
  const save = () => {
    if (!ok) return;
    m.actions.create({ title, body, tags, projectId });
    setTitle("");
    setBody("");
    setTags([]);
    setProjectId("");
    titleRef.current?.focus();
  };
  return (
    <section data-lab-block="capture" className="flex min-w-0 flex-col p-6" style={{ background: C.card, borderRadius: R.card }}>
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ref.current?.focus()}
        placeholder="Новая заметка"
        className="w-full bg-transparent outline-none placeholder:text-[#4A4C54]"
        style={{ ...T.h2, color: C.text }}
      />
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && save()}
        placeholder="Мысль, ссылка, план — что угодно"
        className="mt-3 w-full flex-1 resize-none bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 16, lineHeight: 1.55, color: C.text, minHeight: 120 }}
      />
      <div data-lab-block="capture-meta" className="mt-4 flex flex-wrap items-center justify-end gap-3 pt-5" style={{ ...dashed, backgroundPosition: "left top" }}>
        <div className="min-w-0" style={{ flex: "1 1 220px" }}>
          <TagPicker
            value={tags}
            onChange={setTags}
            options={m.pickTags}
            size={36}
            trailing={
              m.projects.length > 0 ? (
                <PillSelect value={projectId} onChange={setProjectId} options={m.projects.map((p) => ({ id: p.id, label: p.name }))} placeholder="Без проекта" tinted />
              ) : undefined
            }
          />
        </div>
        <Btn size={52} onClick={save} disabled={!ok} icon={<Plus size={18} strokeWidth={2} />}>
          Сохранить заметку
        </Btn>
      </div>
    </section>
  );
}

function Stats({ m }: { m: NotesModel }) {
  const data = useMemo(() => {
    const byDay = new Map<string, number>();
    m.all.forEach((n) => {
      const k = localDayStr(new Date(n.createdAt));
      byDay.set(k, (byDay.get(k) ?? 0) + 1);
    });
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return { label: String(d.getDate()), value: byDay.get(localDayStr(d)) ?? 0 };
    });
  }, [m.all]);
  const recent = data.reduce((s, d) => s + d.value, 0);
  const rows = [
    { label: "Закреплено", value: m.all.filter((n) => n.pinned).length },
    { label: "С открытыми пунктами", value: m.all.filter((n) => openChecks(n.body) > 0).length },
    { label: "Связаны с проектом", value: m.all.filter((n) => n.linkedProjectId).length },
  ];
  return (
    <section data-lab-block="stats" className="flex min-w-0 flex-col p-6" style={{ background: C.card, borderRadius: R.card }}>
      <div className="flex items-start justify-between gap-3">
        <h2 style={T.title}>14 дней</h2>
        <span className="whitespace-nowrap" style={{ ...T.foot, color: C.text2, padding: "6px 12px", borderRadius: 999, background: C.raise }}>
          всего {m.all.length}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span style={{ ...T.num, fontSize: 40, lineHeight: 1 }}>{recent}</span>
        <span style={{ ...T.body, color: C.text2 }}>{plural(recent, "новая заметка", "новые заметки", "новых заметок")}</span>
      </div>
      <div className="mt-5">
        <CapsuleBars data={data} height={96} />
      </div>
      <div data-lab-block="stats-counts" className="mt-4 flex flex-col">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between" style={{ minHeight: 40, ...dashed, backgroundPosition: "left top" }}>
            <span style={{ ...T.body, color: C.text2 }}>{r.label}</span>
            <span style={{ ...T.body, ...T.num, color: C.text }}>{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Line({ n, m, onOpen, block }: { n: Note; m: NotesModel; onOpen: () => void; block?: string }) {
  const project = m.projectName(n.linkedProjectId);
  const pv = n.title ? preview(n.body) : "";
  const checks = openChecks(n.body);
  return (
    <div
      role="button"
      tabIndex={0}
      data-lab-block={block}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group grid cursor-pointer items-center gap-4 px-6 outline-none transition-colors duration-150 hover:bg-[#17171A] focus-visible:bg-[#17171A]"
      style={{ gridTemplateColumns: "14px minmax(0,1fr) auto auto 72px", minHeight: 60, ...dashed }}
    >
      <span className="grid place-items-center">{n.pinned ? <PinMark size={13} /> : <span style={{ width: 6, height: 6, borderRadius: 9, background: C.line2 }} />}</span>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 truncate" style={{ ...T.cell, fontSize: 15, fontWeight: 500, color: C.text, maxWidth: "55%" }}>
          {n.title || preview(n.body, 60) || "Без названия"}
        </span>
        {pv && (
          <span className="min-w-0 truncate" style={{ ...T.body, color: C.text3 }}>
            {pv}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden" style={{ maxWidth: 360 }}>
        {checks > 0 && (
          <span className="whitespace-nowrap" style={{ ...T.foot, color: C.text3 }}>
            {checks} {plural(checks, "пункт", "пункта", "пунктов")}
          </span>
        )}
        {n.tags.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
        {project && n.linkedProjectId && (
          <button
            type="button"
            title="Открыть проект"
            onClick={(e) => {
              e.stopPropagation();
              m.openProject(n.linkedProjectId!);
            }}
            className="min-w-0 truncate whitespace-nowrap pl-1 transition-colors hover:text-[#F4F5F7]"
            style={{ ...T.body, color: C.text3 }}
          >
            {project}
          </button>
        )}
      </div>
      <span className="whitespace-nowrap text-right" style={{ ...T.body, color: C.text3 }}>
        {noteDate(n.createdAt)}
      </span>
      <div className="flex justify-end">
        <HoverActions note={n} m={m} quietPin />
      </div>
    </div>
  );
}

export default function NotesCapture() {
  const m = useNotesModel();
  const ed = useEditor(m);
  const titleRef = useRef<HTMLInputElement>(null);
  const total = m.all.length;
  const none = !m.tag && !m.pinnedOnly && !m.project;

  // Deep-link: the command palette / «Недавние» send { openNoteId } — open that note once, then
  // clear the state so back/forward doesn't re-fire it.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const openId = (location.state as { openNoteId?: string } | null)?.openNoteId;
    if (!openId) return;
    if (m.all.some((n) => n.id === openId)) ed.edit(openId);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  return (
    <CraftShell
      active="notes"
      crumb="Заметки"
      icon={NotebookPen}
      subtitle={total ? `${total} ${plural(total, "заметка", "заметки", "заметок")}` : undefined}
      search={{ value: m.query, onChange: m.setQuery, placeholder: "Поиск заметок" }}
      actions={
        <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={() => titleRef.current?.focus()}>
          Новая заметка
        </Btn>
      }
    >
      <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(300px,360px)" }}>
        <Hero m={m} titleRef={titleRef} />
        <Stats m={m} />
      </div>

      <section data-lab-block="list" className="mt-3 overflow-hidden" style={{ background: C.card, borderRadius: R.card }}>
        <header data-lab-block="list-head" className="flex items-center justify-between gap-4 px-6" style={{ height: 68, ...dashed }}>
          <div className="flex min-w-0 items-center gap-4">
            <h2 className="shrink-0" style={T.title}>
              Все заметки
            </h2>
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                <FilterPill size={32} on={none} onClick={() => (m.setTag(null), m.setPinnedOnly(false), m.setProject(""))}>
                  Все
                </FilterPill>
                <FilterPill size={32} on={m.pinnedOnly} count={m.all.filter((n) => n.pinned).length} onClick={() => (m.setTag(null), m.setPinnedOnly(!m.pinnedOnly))}>
                  Закреплённые
                </FilterPill>
                {m.pickTags.map((t) => (
                  <FilterPill key={t} size={32} on={m.tag === t} count={m.tagCount(t)} onClick={() => (m.setPinnedOnly(false), m.setTag(m.tag === t ? null : t))}>
                    #{t}
                  </FilterPill>
                ))}
                {m.projects.length > 0 && (
                  <PillSelect value={m.project} onChange={m.setProject} options={m.projects.map((p) => ({ id: p.id, label: p.name }))} placeholder="Все проекты" height={32} tinted />
                )}
            </div>
          </div>
          <SortPills value={m.sort === "newest" ? "pinned" : m.sort} onChange={m.setSort} items={SORTS_SHORT} />
        </header>
        {total === 0 ? (
          <div data-lab-block="row" className="flex items-center justify-center gap-6 px-6 py-12">
            <SheetsArt size={88} />
            <div>
              <div style={T.title}>Заметок пока нет</div>
              <div className="mt-1.5" style={{ ...T.body, color: C.text2, maxWidth: 360, lineHeight: 1.5 }}>
                Первая запись появится здесь — закреплённые всегда наверху.
              </div>
            </div>
          </div>
        ) : m.visible.length === 0 ? (
          <NothingFound onReset={m.resetFilters} />
        ) : (
          <div className="pb-2">
            {m.visible.map((n, i) => (
              <Line key={n.id} n={n} m={m} block={i === 0 ? "row" : undefined} onOpen={() => ed.edit(n.id)} />
            ))}
          </div>
        )}
      </section>

      {ed.open && <NoteEditor key={ed.key} m={m} note={ed.note} onClose={ed.close} />}
      <UndoBar m={m} />
    </CraftShell>
  );
}
