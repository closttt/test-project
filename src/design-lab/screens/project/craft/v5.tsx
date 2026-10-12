/**
 * Карточка проекта · Craft Dark · v5 «Документ» — the live project page (/projects/:id) as one
 * readable page (ref 20): a light-grey cover with the projects' glossy folder and the name, a plain
 * summary line, then each section as a heading with a checklist, the journal and materials as the
 * last chapters; «На странице» on the right (from 1024 px).
 *
 *   ┌ page panel ──────────────────────────────────────────────────────────────┐
 *   │ Рабочий стол / Проекты             date · bell · [Проект ⌄] · Новая задача │
 *   │ ┌ light-grey cover  ‹ Проекты ──────────────────────────────────── ✎ ┐ │
 *   │ │ [folder]  client · since                                            │ │
 *   │ │           Axevil 40 · status · health                               │ │
 *   │ └───────────────────────────────────────────────────────────────────────┘ │
 *   │ summary line                                          │ На странице      │
 *   │ ## Дизайн    1/1                                       │  Дизайн    1/1   │
 *   │ ○ task ………………………………………… date                          │  Разработка 2/2  │
 *   │ + Задача в «Дизайн»                                    │  Обновления      │
 *   │ ## Обновления / ## Материалы                           │  Материалы       │
 *   └──────────────────────────────────────────────────────────────────────────┘
 *
 * The project id comes from the route; a lab preview without one falls back to ?project= or the
 * busiest active project. Unknown id → «Проект не найден» with a way back to /projects.
 */
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Pencil, Plus } from "lucide-react";

import { Btn, C, R, T, TONE, dashed, plural, type Tone } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { Folder } from "../../projects/craft/Folder";
import {
  AddSection,
  ArchivedNote,
  HEALTH_LABEL,
  HEALTH_TONE,
  InlineAdd,
  JournalAdd,
  JournalList,
  Materials,
  NoProject,
  NoTasks,
  ProjectSwitcher,
  STATUS_LABEL,
  SectionTitle,
  TaskRow,
  dur,
  useEditors,
  useLinks,
  useProjectModel,
  visibleCount,
  type Group,
  type ProjectModel,
} from "./_parts";
import type { Task } from "@/types";

const anchor = (key: string) => `doc-${key.replace(/[^a-zA-Zа-яА-Я0-9]+/g, "-")}`;

function go(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Ink on the light-grey cover. */
const INK = { text: "#131417", text2: "#5C5F67", chip: "rgba(255,255,255,0.72)" } as const;
/** Dots tuned for the light surface (the dark-UI tints are too pale on grey). */
const LIGHT_DOT: Record<Tone, string> = { blue: "#0A84FF", amber: "#E0961C", red: "#E5483F", green: "#1FA971", violet: "#7C69F0", neutral: "#8A8D95" };
const STATUS_DOT: Record<string, string> = { planned: LIGHT_DOT.neutral, active: LIGHT_DOT.blue, done: LIGHT_DOT.green, archived: LIGHT_DOT.neutral };
const CHIP = "transition-colors duration-150 hover:!bg-white";

function Title({ m }: { m: ProjectModel }) {
  const p = m.project!;
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(p.name);
  const size = "clamp(28px, 3.4vw, 40px)";
  const commit = () => {
    if (v.trim() && v.trim() !== p.name) m.actions.updateProject({ name: v.trim() });
    setEdit(false);
  };
  if (edit)
    return (
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEdit(false);
        }}
        className="-mx-2 w-full max-w-[640px] bg-transparent px-2 outline-none"
        style={{ fontSize: size, lineHeight: 1.1, fontWeight: 500, letterSpacing: "-0.035em", color: INK.text, borderRadius: 12, boxShadow: "inset 0 0 0 1px rgba(10,132,255,0.55)", background: "rgba(255,255,255,0.7)" }}
      />
    );
  return (
    <h1
      className="cursor-text break-words"
      onClick={() => {
        setV(p.name);
        setEdit(true);
      }}
      title="Клик — переименовать"
      style={{ fontSize: size, lineHeight: 1.1, fontWeight: 500, letterSpacing: "-0.035em", color: INK.text }}
    >
      {p.name}
    </h1>
  );
}

/** Quiet white chip on the grey cover; a button when it opens something. */
function Chip({ dot, children, onClick, title }: { dot?: string; children: ReactNode; onClick?: () => void; title?: string }) {
  const style = { height: 32, borderRadius: 999, background: INK.chip, color: INK.text, fontSize: 13 } as const;
  const inner = (
    <>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 9, background: dot }} />}
      {children}
    </>
  );
  if (!onClick)
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap px-3.5" style={style} title={title}>
        {inner}
      </span>
    );
  return (
    <button type="button" onClick={onClick} title={title} className={`inline-flex items-center gap-2 whitespace-nowrap px-3.5 ${CHIP}`} style={style}>
      {inner}
    </button>
  );
}

/** The cover: light grey, the projects' folder (opens on hover), name, client, status, health. */
function Banner({ m, onEdit, onBack }: { m: ProjectModel; onEdit: () => void; onBack: () => void }) {
  const p = m.project!;
  const [hover, setHover] = useState(false);
  return (
    <div
      data-lab-block="title"
      className="relative overflow-hidden"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: R.card,
        background: "radial-gradient(38% 90% at 14% 64%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg, #ECEDF0 0%, #DCDEE3 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1 whitespace-nowrap pl-2 pr-3.5 ${CHIP}`}
          style={{ height: 32, borderRadius: 999, background: INK.chip, color: INK.text, fontSize: 13 }}
        >
          <ChevronLeft size={16} strokeWidth={1.9} />
          Проекты
        </button>
        <button
          type="button"
          title="Изменить проект"
          aria-label="Изменить проект"
          onClick={onEdit}
          className={`grid h-9 w-9 place-items-center rounded-full ${CHIP}`}
          style={{ background: INK.chip, color: INK.text }}
        >
          <Pencil size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex items-end gap-5 px-5 pb-7 pt-1 sm:gap-7 sm:px-8">
        <Folder light open={hover} width="clamp(84px, 11vw, 136px)" style={{ marginBottom: 4 }} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="truncate" style={{ ...T.body, color: INK.text2 }}>
            {m.client ? m.client.name : "Без клиента"} · с {new Date(p.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
          </div>
          <Title m={m} />
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip dot={STATUS_DOT[p.status]} onClick={onEdit} title="Изменить статус">
              {STATUS_LABEL[p.status]}
            </Chip>
            <Chip dot={LIGHT_DOT[HEALTH_TONE[m.health]]} title="Состояние по срокам задач">
              {HEALTH_LABEL[m.health]}
              {m.overdue > 0 && <span style={{ color: INK.text2 }}>· {m.overdue} просроч.</span>}
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

function Lead({ m }: { m: ProjectModel }) {
  const parts: string[] = [];
  if (m.total === 0) parts.push("Задач пока нет.");
  else {
    parts.push(`Закрыто ${m.done} из ${m.total} ${plural(m.total, "задачи", "задач", "задач")}`);
    parts.push(m.open ? `${m.open} в работе` : "открытых нет");
  }
  return (
    <p data-lab-block="lead" style={{ fontSize: 18, lineHeight: 1.5, color: C.text2, letterSpacing: "-0.01em" }}>
      {parts.join(", ")}
      {m.total > 0 && "."}
      {m.overdue > 0 && (
        <span style={{ color: TONE.amber.fg }}>
          {" "}
          {m.overdue} {plural(m.overdue, "просрочена", "просрочены", "просрочено")}.
        </span>
      )}
      {m.spentMin > 0 && ` Учтено ${dur(m.spentMin)}.`}
    </p>
  );
}

/** One section as a chapter. `first` marks the first chapter (and its add field) for the board;
 * `markRow` marks its first task row (the first chapter that has rows). */
function Chapter({ g, m, onOpen, first, markRow }: { g: Group; m: ProjectModel; onOpen: (t: Task) => void; first?: boolean; markRow?: boolean }) {
  const addable = g.kind === "section" || g.kind === "none";
  return (
    <section id={anchor(g.key)} data-lab-block={first ? "chapter" : undefined} className="scroll-mt-6">
      <div className="flex items-center gap-3 pb-3">
        <SectionTitle g={g} m={m} size={24} />
      </div>
      <div style={{ ...dashed, backgroundPosition: "left top" }}>
        {g.items.map((t, i) => (
          <div key={t.id} data-lab-block={markRow && i === 0 ? "row" : undefined}>
            <TaskRow t={t} m={m} onOpen={onOpen} pad={4} height={52} />
          </div>
        ))}
        {g.items.length === 0 && (
          <div className="flex items-center gap-2 py-3" style={{ ...T.body, color: C.text3, ...dashed }}>
            {g.total > 0 && <Check size={14} strokeWidth={2} color={C.text3} />}
            {g.total ? `Всё закрыто · ${g.done} ${plural(g.done, "задача", "задачи", "задач")}` : "Пока пусто"}
          </div>
        )}
        {addable && (
          <div data-lab-block={first ? "add" : undefined}>
            <InlineAdd pad={4} height={48} onAdd={(v) => m.actions.addTask(v, g.section)} placeholder={g.section ? `Задача в «${g.section}»` : "Задача без секции"} />
          </div>
        )}
      </div>
    </section>
  );
}

function Toc({ m }: { m: ProjectModel }) {
  const links = useLinks(m);
  const groups = m.groups.filter((g) => !(g.kind === "none" && g.all.length === 0));
  const mat = m.files.length + links.length + m.linkedNotes.length;
  const Item = ({ id, label, right, muted }: { id: string; label: string; right?: string; muted?: boolean }) => (
    <button
      type="button"
      onClick={() => go(id)}
      className="flex w-full items-center justify-between gap-3 px-3 text-left transition-colors duration-150 hover:bg-[#1B1B1F]"
      style={{ minHeight: 36, borderRadius: R.small }}
    >
      <span className="truncate" style={{ ...T.body, color: muted ? C.text3 : C.text2 }}>
        {label}
      </span>
      {right && <span className="shrink-0" style={{ ...T.foot, ...T.num, fontWeight: 400, color: C.text3 }}>{right}</span>}
    </button>
  );
  return (
    <nav data-lab-block="toc" className="order-first flex flex-col gap-4 lg:sticky lg:top-5 lg:order-none lg:self-start">
      <div className="hidden flex-col gap-0.5 lg:flex">
        <div className="px-3 pb-2" style={{ ...T.foot, color: C.text3 }}>
          На странице
        </div>
        {groups.map((g) => (
          <Item key={g.key} id={anchor(g.key)} label={g.label} right={g.total ? `${g.done}/${g.total}` : undefined} muted={g.kind === "none" && m.sections.length > 0} />
        ))}
        <div className="mx-3 my-2" style={{ height: 1, background: C.line }} />
        <Item id="doc-journal" label="Обновления" right={m.comments.length ? String(m.comments.length) : undefined} />
        <Item id="doc-materials" label="Материалы" right={mat ? String(mat) : undefined} />
      </div>
      <div className="flex flex-col gap-2 p-4" style={{ background: C.card, borderRadius: R.inner }}>
        <div className="flex items-baseline justify-between" style={{ ...T.foot, color: C.text2 }}>
          <span>Готовность</span>
          <span style={{ ...T.num, color: C.text }}>{Math.round(m.pct)}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "#2C2C33" }}>
          <div style={{ width: `${m.pct}%`, height: "100%", borderRadius: 999, background: C.accent }} />
        </div>
        <button
          type="button"
          onClick={() => m.setShowDone((v) => !v)}
          className="mt-1 self-start transition-colors duration-150 hover:text-[#F4F5F7]"
          style={{ ...T.foot, color: m.showDone ? "#5AA9FF" : C.text2 }}
        >
          {m.showDone ? "Скрыть выполненные" : `Показать выполненные · ${m.done}`}
        </button>
      </div>
    </nav>
  );
}

/** The route's project id is not in the store (deleted, or a stale link). */
function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center" style={{ borderRadius: R.card, background: C.card }}>
      <Folder width={96} />
      <span className="mt-2" style={T.title}>
        Проект не найден
      </span>
      <Btn onClick={onBack}>К проектам</Btn>
    </div>
  );
}

export default function ProjectDocument() {
  const { id } = useParams<{ id: string }>();
  // Keyed by id: another project starts with fresh local state (ticked rows, search, editors).
  return <ProjectPage key={id ?? "lab"} id={id} />;
}

function ProjectPage({ id }: { id?: string }) {
  const navigate = useNavigate();
  const toList = () => navigate("/projects");
  const m = useProjectModel(id ? { id, go: (x) => navigate(x ? `/projects/${x}` : "/projects") } : undefined);
  const ed = useEditors(m);
  const p = m.project;
  const shown = visibleCount(m.groups);
  const chapters = m.groups.filter((g) => !(g.kind === "none" && g.all.length === 0));
  const rowKey = chapters.find((g) => g.items.length > 0)?.key;
  /** No sections → one add field on top of the page; with sections each chapter has its own. */
  const topAdd = m.sections.length === 0;
  const newTask = () => {
    const target = topAdd ? "doc-add" : anchor(m.groups.find((g) => g.kind === "section")?.key ?? "");
    go(target);
    setTimeout(() => (document.querySelector(`[id="${target}"] input`) as HTMLInputElement | null)?.focus({ preventScroll: true }), 350);
  };
  return (
    <CraftShell
      active="projects"
      crumb="Проекты"
      crumbTo="/projects"
      bare
      search={{ value: m.query, onChange: m.setQuery, placeholder: "Поиск в проекте" }}
      actions={
        <>
          {p && <ProjectSwitcher m={m} />}
          {p && (
            <>
              {/* Narrow topbar: a round accent «+»; the labelled button from 1280 px. */}
              <button
                type="button"
                title="Новая задача"
                aria-label="Новая задача"
                onClick={newTask}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-[filter] duration-150 hover:brightness-110 xl:hidden"
                style={{ background: C.accent, color: "#fff" }}
              >
                <Plus size={18} strokeWidth={2} />
              </button>
              <span className="hidden xl:inline-flex">
                <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={newTask}>
                  Новая задача
                </Btn>
              </span>
            </>
          )}
        </>
      }
    >
      {!p ? (
        id ? <NotFound onBack={toList} /> : <NoProject />
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          <ArchivedNote m={m} />
          <Banner m={m} onEdit={ed.openProject} onBack={toList} />
          <div className="grid grid-cols-1 gap-10 sm:px-2 lg:grid-cols-[minmax(0,1fr)_clamp(200px,18vw,248px)]">
            <article className="flex min-w-0 max-w-[780px] flex-col gap-10">
              <Lead m={m} />
              {topAdd && (
                <div id="doc-add" data-lab-block="add" className="scroll-mt-6" style={{ ...dashed, backgroundPosition: "left top" }}>
                  <InlineAdd pad={4} height={48} onAdd={(v) => m.actions.addTask(v, null)} placeholder="Новая задача" />
                </div>
              )}
              {shown === 0 && m.query ? (
                <NoTasks query={m.query} />
              ) : (
                chapters.map((g, i) => <Chapter key={g.key} g={g} m={m} onOpen={ed.openTask} first={i === 0} markRow={g.key === rowKey} />)
              )}
              {m.total > 0 && m.groups.length === 0 && <div style={{ ...T.body, color: C.text3 }}>Открытых задач нет — всё закрыто.</div>}
              <div className="-mt-4 self-start" data-lab-block="add-section">
                <AddSection m={m} height={40} />
              </div>
              <section id="doc-journal" data-lab-block="journal" className="flex scroll-mt-6 flex-col gap-4">
                <h2 style={T.h2}>Обновления</h2>
                <JournalAdd m={m} />
                <JournalList m={m} flat />
              </section>
              <section id="doc-materials" data-lab-block="materials" className="flex scroll-mt-6 flex-col gap-4 pb-6">
                <h2 style={T.h2}>Материалы</h2>
                <Materials m={m} />
              </section>
            </article>
            <Toc m={m} />
          </div>
        </div>
      )}
      {ed.node}
    </CraftShell>
  );
}
