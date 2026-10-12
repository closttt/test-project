/**
 * Проекты · Craft Dark · v6 «Как сейчас» — the live Projects page (/projects): every project is a
 * folder, up to six in a row (owner's ref: a glossy blue folder on a quiet tile, minimal caption).
 *
 *   ┌ page panel ──────────────────────────────────────────────────────────┐
 *   │ Рабочий стол / Проекты                       date · bell · Новый проект │
 *   │ [tile] Проекты                                                          │
 *   │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                     │
 *   │ │   [folder]   │ │   [folder]   │ │   [folder]   │   hover: card lifts, │
 *   │ └──────────────┘ └──────────────┘ └──────────────┘   folder opens,      │
 *   │      Axevil           Сайт               CRM          archive appears   │
 *   │  12 задач · 3 просроч.  ● Высокий                                       │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * Click opens the project page (/projects/:id). Archive (with «Вернуть») sits on the tile on hover;
 * «Новый проект» opens the create dialog (name, status, priority, client, template).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Plus } from "lucide-react";

import { Btn, C, R, T, TONE, plural } from "@/design-lab/screens/_kit/craft";
import { PRIORITY_META } from "@/types";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import { Folder } from "./Folder";
import { PRIO_DOT, useProjectsScreen, type ProjectRow, type ProjectsScreen } from "./_parts";

const Sep = () => <span aria-hidden className="shrink-0" style={{ width: 3, height: 3, borderRadius: 9, background: C.text3 }} />;

/** «● Высокий» — the project's own priority; nothing when it has none. */
function Prio({ p }: { p: ProjectRow["project"]["priority"] }) {
  if (!p) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1">
      <span aria-hidden className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[p] }} />
      {PRIORITY_META[p].label}
    </span>
  );
}

/** «12 задач · 3 просрочено  ● Высокий» / «8 задач · 2 в работе» / «5 задач · всё закрыто» / «Нет задач». */
function Caption({ r }: { r: ProjectRow }) {
  const tail =
    r.overdue > 0 ? (
      <span style={{ color: TONE.amber.fg }}>
        {r.overdue} {plural(r.overdue, "просрочена", "просрочены", "просрочено")}
      </span>
    ) : (
      <span>{r.open ? `${r.open} в работе` : "всё закрыто"}</span>
    );
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5" style={{ color: C.text3 }}>
      {r.total === 0 ? (
        <span>Нет задач</span>
      ) : (
        <>
          <span style={T.num}>
            {r.total} {plural(r.total, "задача", "задачи", "задач")}
          </span>
          <Sep />
          {tail}
        </>
      )}
      <Prio p={r.project.priority} />
    </span>
  );
}

function FolderCard({ r, s, first }: { r: ProjectRow; s: ProjectsScreen; first: boolean }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const open = () => navigate(`/projects/${r.project.id}`);
  return (
    <article
      data-lab-block={first ? "card" : undefined}
      role="link"
      tabIndex={0}
      aria-label={r.project.name}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHover(false)}
      className="group relative flex min-w-0 cursor-pointer flex-col p-2 outline-none"
      style={{
        borderRadius: R.card + 4,
        background: hover ? C.raise : "transparent",
        transform: hover ? "translateY(-3px)" : undefined,
        boxShadow: hover ? `inset 0 0 0 1px ${C.line}, 0 10px 24px rgba(0,0,0,0.35)` : "none",
        transition: "transform 200ms cubic-bezier(.2,.8,.2,1), background 200ms ease, box-shadow 200ms ease",
      }}
    >
      <div
        data-lab-block={first ? "folder" : undefined}
        className="relative grid w-full place-items-center overflow-hidden"
        style={{
          aspectRatio: "3 / 2",
          borderRadius: R.inner + 2,
          background: C.card,
        }}
      >
        <Folder width="40%" open={hover} style={{ maxWidth: 156, minWidth: 64 }} />
        <button
          type="button"
          title={`В архив: ${r.project.name}`}
          aria-label={`В архив: ${r.project.name}`}
          onClick={(e) => {
            e.stopPropagation();
            s.archive(r);
          }}
          className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full opacity-0 transition-[opacity,color,background] duration-150 hover:bg-[#242429] hover:text-[#F4F5F7] focus-visible:opacity-100 group-hover:opacity-100"
          style={{ background: "rgba(30,30,34,0.85)", color: C.text2 }}
        >
          <Archive size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div data-lab-block={first ? "caption" : undefined} className="flex min-w-0 flex-col items-center gap-1 px-1.5 pb-1.5 pt-3 text-center">
        <h3 className="w-full truncate" style={{ fontSize: 14, lineHeight: 1.3, fontWeight: 500, letterSpacing: "-0.01em", color: C.text }}>
          {r.project.name}
        </h3>
        <span className="max-w-full" style={T.foot}>
          <Caption r={r} />
        </span>
      </div>
    </article>
  );
}

export default function ProjectsAsNow() {
  const s = useProjectsScreen();
  return (
    <CraftShell
      active="projects"
      crumb="Проекты"
      search={s.search}
      actions={
        <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={() => s.create()}>
          Новый проект
        </Btn>
      }
    >
      {s.all.length === 0 ? (
        <div data-lab-block="grid" className="mt-8 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center" style={{ borderRadius: R.card, background: C.card }}>
          <Folder width={104} />
          <span className="mt-2" style={T.title}>
            Пока нет проектов
          </span>
          <Btn onClick={() => s.create()} icon={<Plus size={16} strokeWidth={2} />}>
            Новый проект
          </Btn>
        </div>
      ) : s.visible.length === 0 ? (
        <div
          data-lab-block="grid"
          className="mt-8 flex flex-col items-center gap-3 py-12 text-center"
          style={{ borderRadius: R.card, border: `1px dashed ${C.line2}`, ...T.body, color: C.text3 }}
        >
          Ничего не найдено по «{s.query.trim()}»
          <Btn size={36} kind="ghost" onClick={() => s.setQuery("")}>
            Сбросить поиск
          </Btn>
        </div>
      ) : (
        <div data-lab-block="grid" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6">
          {s.visible.map((r, i) => (
            <FolderCard key={r.project.id} r={r} s={s} first={i === 0} />
          ))}
        </div>
      )}
      {s.overlays}
    </CraftShell>
  );
}
