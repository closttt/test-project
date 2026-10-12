/**
 * Проекты · Craft Dark · v5 «Список и карточка» (refs 12, 17, 13).
 *
 *   ┌ page panel ──────────────────────────────────────────────────────────┐
 *   │ Рабочий стол / Проекты                         date · bell · Новый проект │
 *   │ [tile] Проекты                                       status tabs      │
 *   │ ┌ list ────────┐ ┌ selected project ──────────────────────────────────┐│
 *   │ │ n · sort ⌄   │ │ [A] Axevil · client      Изменить · архив · Открыть ││
 *   │ │ [A] Axevil ◔ │ │ ring 94%  51 из 54 │ открыто · просрочено · время   ││
 *   │ │ [Ф] Фудтри ◔ │ │ Статус pills · Приоритет pills                      ││
 *   │ │ …            │ │ Открытые задачи (tick to close) · add task          ││
 *   │ └──────────────┘ └─────────────────────────────────────────────────────┘│
 */
import { useMemo, useState } from "react";
import { ArrowUpRight, Pencil, Plus, User } from "lucide-react";

import { Btn, C, R, Ring, RoundCheck, T, TONE, dashed, plural } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import {
  ChoicePill,
  HealthDot,
  NoResults,
  PRIOS,
  PRIO_DOT,
  ProjectMark,
  RowActions,
  SOFT,
  STATUS_DOT,
  STATUS_LABEL,
  STATUSES,
  SortMenu,
  StatusTabs,
  dateColor,
  dur,
  short,
  projectsWord,
  rowDate,
  useProjectsScreen,
  type ProjectRow,
  type ProjectsScreen,
} from "./_parts";
import { dueLabel, isOverdue } from "@/lib/format";
import type { Task } from "@/types";

function ListRow({ r, on, onPick }: { r: ProjectRow; on: boolean; onPick: () => void }) {
  const d = rowDate(r);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => e.key === "Enter" && onPick()}
      className={`group flex cursor-pointer items-center gap-3 px-3 outline-none transition-colors duration-150 ${on ? "" : "hover:bg-[#17171A] focus-visible:bg-[#17171A]"}`}
      style={{ minHeight: 64, borderRadius: R.inner, background: on ? SOFT : undefined }}
    >
      <ProjectMark p={r.project} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate" style={{ ...T.cell, fontSize: 15 }}>
          {r.project.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate" style={{ ...T.foot, color: C.text3 }}>
          <span style={{ ...T.num, fontWeight: 400, color: C.text2 }}>
            {r.done}/{r.total}
          </span>
          <span>·</span>
          <span className="truncate" style={{ color: dateColor(d.tone) }}>
            {d.text}
          </span>
        </div>
      </div>
      <Ring pct={r.pct} size={28} stroke={3} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 p-4" style={{ background: C.raise, borderRadius: R.inner }}>
      <span style={{ ...T.foot, color: C.text2 }}>{label}</span>
      <span className="truncate" style={{ ...T.num, fontSize: 24, lineHeight: 1, color: tone ?? C.text }}>
        {value}
      </span>
    </div>
  );
}

function dueText(d: string) {
  const l = dueLabel(d);
  return l === "Сегодня" || l === "Завтра" ? l.toLowerCase() : short(d);
}

function TaskRow({ t, onToggle }: { t: Task; onToggle: () => void }) {
  const late = !t.done && isOverdue(t.dueDate);
  return (
    <div className="grid items-center gap-4" style={{ gridTemplateColumns: "22px minmax(0,1fr) auto", minHeight: 52, ...dashed }}>
      <RoundCheck done={t.done} onChange={onToggle} />
      <div className="flex min-w-0 items-center gap-2">
        {t.priority > 0 && <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: PRIO_DOT[t.priority] }} />}
        <span className="truncate" style={{ ...T.body, fontSize: 15, color: t.done ? C.text3 : C.text, textDecoration: t.done ? "line-through" : undefined }}>
          {t.title}
        </span>
        {t.section && (
          <span className="shrink-0 truncate" style={{ ...T.body, color: C.text3, maxWidth: 160 }}>
            · {t.section}
          </span>
        )}
      </div>
      <span className="whitespace-nowrap text-right" style={{ ...T.body, color: late ? TONE.amber.fg : C.text3 }}>
        {t.done ? "готово" : t.dueDate ? (late ? `с ${short(t.dueDate)}` : dueText(t.dueDate)) : "без срока"}
      </span>
    </div>
  );
}

function AddTask({ s, projectId }: { s: ProjectsScreen; projectId: string }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        s.data.addTask({ title: v.trim(), projectId, done: false });
        setV("");
      }}
      className="mt-4 flex items-center gap-2 pl-5 pr-1.5"
      style={{ height: 52, borderRadius: R.inner, boxShadow: `inset 0 0 0 1px ${C.line}` }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Новая задача в проекте"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      <Btn type="submit" size={40} icon={<Plus size={16} strokeWidth={2} />} disabled={!v.trim()}>
        Добавить
      </Btn>
    </form>
  );
}

function Detail({ r, s }: { r: ProjectRow; s: ProjectsScreen }) {
  const p = r.project;
  const prio = p.priority ?? 0;
  /** Ticked here stay visible (struck) until the project changes. */
  const [ticked, setTicked] = useState<string[]>([]);
  const open = useMemo(
    () => r.tasks.filter((t) => !t.done || ticked.includes(t.id)).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.order - b.order),
    [r.tasks, ticked]
  );
  const recent = useMemo(
    () => r.tasks.filter((t) => t.done && t.completedAt && !ticked.includes(t.id)).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 3),
    [r.tasks, ticked]
  );
  const toggle = (t: Task) => {
    if (!t.done) setTicked((xs) => [...xs, t.id]);
    s.data.toggleTask(t.id);
  };
  return (
    <section className="flex min-w-0 flex-col p-6" style={{ background: C.card, borderRadius: R.card }}>
      <div className="flex items-start gap-4">
        <ProjectMark p={p} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate" style={T.h2}>
            {p.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ ...T.body, color: C.text3 }}>
            {r.client && (
              <span className="inline-flex items-center gap-1.5">
                <User size={14} strokeWidth={1.75} />
                {r.client.name}
              </span>
            )}
            <HealthDot h={r.health} />
            <span>с {new Date(p.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <RowActions r={r} s={s} className="!opacity-100" />
          <Btn kind="ghost" size={40} icon={<Pencil size={15} strokeWidth={1.75} />} onClick={() => s.edit(p.id)}>
            Изменить
          </Btn>
          <Btn size={40} icon={<ArrowUpRight size={16} strokeWidth={2} />}>Открыть</Btn>
        </div>
      </div>

      <div className="mt-6 grid gap-2" style={{ gridTemplateColumns: "auto repeat(3, minmax(0,1fr))" }}>
        <div className="flex items-center gap-4 p-4 pr-6" style={{ background: C.raise, borderRadius: R.inner }}>
          <Ring pct={r.pct} size={72} stroke={6}>
            <span style={{ ...T.body, ...T.num }}>{Math.round(r.pct)}%</span>
          </Ring>
          <div>
            <div style={{ ...T.num, fontSize: 32, lineHeight: 1 }}>
              {r.done}
              <span style={{ color: C.text3, fontWeight: 400 }}>/{r.total}</span>
            </div>
            <div className="mt-1.5" style={{ ...T.foot, color: C.text2 }}>
              задач закрыто
            </div>
          </div>
        </div>
        <Stat label="Открыто" value={r.open} />
        <Stat label="Просрочено" value={r.overdue} tone={r.overdue ? TONE.amber.fg : undefined} />
        <Stat label="Время" value={dur(r.spentMin)} />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <span className="w-[72px] shrink-0" style={{ ...T.body, color: C.text3 }}>Статус</span>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((st) => (
              <ChoicePill key={st} on={p.status === st} dot={STATUS_DOT[st]} onClick={() => s.data.updateProject(p.id, { status: st })}>
                {STATUS_LABEL[st]}
              </ChoicePill>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <span className="w-[72px] shrink-0" style={{ ...T.body, color: C.text3 }}>Приоритет</span>
          <div className="flex flex-wrap gap-1.5">
            {PRIOS.map(({ p: pr, label }) => (
              <ChoicePill key={pr} on={prio === pr} dot={PRIO_DOT[pr]} onClick={() => s.data.updateProject(p.id, { priority: pr })}>
                {label}
              </ChoicePill>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-baseline justify-between">
        <h3 style={T.title}>Открытые задачи</h3>
        <span style={{ ...T.body, color: C.text3 }}>
          {r.open} {plural(r.open, "задача", "задачи", "задач")}
          {r.estimateMin > 0 && ` · ≈ ${dur(r.estimateMin)}`}
        </span>
      </div>
      <div className="mt-2">
        {open.length === 0 ? (
          <div className="py-4" style={{ ...T.body, color: C.text3, ...dashed }}>
            Открытых задач нет — проект можно завершить.
          </div>
        ) : (
          open.map((t) => <TaskRow key={t.id} t={t} onToggle={() => toggle(t)} />)
        )}
        {recent.length > 0 && (
          <>
            <div className="mb-1 mt-5" style={{ ...T.foot, color: C.text3 }}>
              Закрыто недавно
            </div>
            {recent.map((t) => (
              <TaskRow key={t.id} t={t} onToggle={() => toggle(t)} />
            ))}
          </>
        )}
      </div>
      <AddTask s={s} projectId={p.id} />
    </section>
  );
}

export default function ProjectsSplit() {
  const s = useProjectsScreen();
  const [pick, setPick] = useState<string | null>(null);
  const sel = s.visible.find((r) => r.project.id === pick) ?? s.visible[0];
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
      titleRight={<StatusTabs s={s} size={40} compact />}
    >
      <div className="mt-6 grid items-start gap-3" style={{ gridTemplateColumns: "320px minmax(0,1fr)" }}>
        <section className="flex flex-col p-2" style={{ background: C.card, borderRadius: R.card }}>
          <header className="flex items-center justify-between gap-3 pb-2 pl-3 pt-1">
            <span style={{ ...T.body, color: C.text2 }}>{projectsWord(s.visible.length)}</span>
            <SortMenu s={s} size={36} />
          </header>
          {s.visible.length === 0 ? (
            <div className="p-2">
              <NoResults s={s} />
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {s.visible.map((r) => (
                <ListRow key={r.project.id} r={r} on={sel?.project.id === r.project.id} onPick={() => setPick(r.project.id)} />
              ))}
            </div>
          )}
        </section>
        {sel ? (
          <Detail key={sel.project.id} r={sel} s={s} />
        ) : (
          <section className="grid place-items-center p-6" style={{ background: C.card, borderRadius: R.card, minHeight: 420, ...T.body, color: C.text3 }}>
            Выберите проект слева
          </section>
        )}
      </div>
      {s.overlays}
    </CraftShell>
  );
}
