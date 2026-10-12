/**
 * Dashboard · Soft Instrument · v4 «Карточки» (ref 10 Mailite)
 * Composition: an «integrations» grid of big cards. A wide sidebar with search, nav, a collapsible
 * «Избранное» (projects with stars) and «Клиенты» (coloured app-icon squares). The page is an
 * inset panel: breadcrumb, big title + one-line summary, a borderless filter row with KPI figures,
 * then a 3-column grid where every block is a large card — a ghost watermark glyph, a soft
 * brand-glow of its colour, a monochrome icon with a coloured dot, title, summary and a footer
 * action (Mailite toggle included). The plan of the day is the widest, tallest card.
 */
import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleDot,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  PieChart,
  Search,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useDashboardModel, rub, type DashboardModel } from "@/design-lab/screens/dashboardModel";
import {
  S,
  alpha,
  rootStyle,
  NAV_ICON,
  Chip,
  PriorityChip,
  Check,
  MiniBars,
  Track,
  AddInline,
  NoteBox,
  plural,
  useDoneToday,
  toneColor,
  type Tone,
} from "@/design-lab/screens/_kit/soft";
import { useData } from "@/store/DataProvider";

const PANEL = "#141414";
const cardBase = { background: PANEL, boxShadow: "inset 0 0 0 1px #1E1E1E" };
const CLIENT_COLORS = ["#386DF4", "#FD476B", "#26C66C", "#F59B42", "#8957FE", "#3BB8C4"];

export default function SoftV4() {
  const m = useDashboardModel();
  const doneToday = useDoneToday();
  const [hideDone, setHideDone] = useState(false);
  const overdueInPlan = m.plan.filter((r) => r.overdue).length;
  const rows = [...m.plan.filter((r) => !r.done), ...(hideDone ? [] : doneToday)];
  const atRisk = m.projects.filter((p) => p.health === "off-track" || p.health === "at-risk");

  return (
    <div className="flex min-h-screen" style={{ ...rootStyle, background: "#101010" }}>
      <Sidebar m={m} />

      <main className="my-2 mr-2 min-w-0 flex-1 rounded-[12px] px-10 pb-12 pt-7 max-[1360px]:px-8" style={{ background: PANEL, boxShadow: "inset 0 0 0 1px #1C1C1C" }}>
        <div className="flex items-center gap-2 text-[15px] font-medium">
          <LayoutGrid size={17} strokeWidth={1.75} />
          Рабочий стол
        </div>
        <h1 className="mt-7 text-[30px] font-semibold tracking-[-0.025em]">{m.greeting}</h1>
        <p className="mt-1.5 text-[17px]" style={{ color: "#E2E2E4" }}>
          {m.dateLabel} — {m.plan.length} {plural(m.plan.length, "задача", "задачи", "задач")} в плане, {m.meetings.length ? `${m.meetings.length} встреч` : "без встреч"},{" "}
          {rub(m.money.pending)} ожидается.
        </p>

        {/* borderless filter row + figures */}
        <div className="mt-7 flex items-center gap-6 border-b pb-4" style={{ borderColor: "#1F1F1F" }}>
          <label className="flex min-w-0 flex-1 items-center gap-2.5">
            <Search size={18} strokeWidth={1.75} style={{ color: S.ink3 }} />
            <input placeholder="Найти задачу, проект, клиента…" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-[#58585b]" />
          </label>
          {[
            { k: "Сегодня", v: `${m.kpi.todayDone}/${m.kpi.todayTotal}`, tone: (m.kpi.overdueToday ? "red" : "neutral") as Tone, sub: m.kpi.overdueToday ? `${m.kpi.overdueToday} просроч.` : "" },
            { k: "Время", v: m.kpi.timeLabel, tone: "neutral" as Tone, sub: "" },
            { k: "Открыто", v: String(m.kpi.openCount), tone: "neutral" as Tone, sub: "" },
            { k: "Неделя", v: String(m.kpi.weekDone), tone: "neutral" as Tone, sub: "закрыто" },
          ].map((s) => (
            <div key={s.k} className="flex shrink-0 items-baseline gap-2">
              <span className="text-[13.5px]" style={{ color: S.ink3 }}>
                {s.k}
              </span>
              <span className="text-[15px] font-semibold tabular-nums">{s.v}</span>
              {s.sub && (
                <span className="text-[12px] max-[1360px]:hidden" style={{ color: s.tone === "red" ? S.red : S.ink4 }}>
                  {s.sub}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-5">
          {/* Plan — the widest, tallest card */}
          <BigCard
            className="col-span-2 row-span-2"
            icon={ListChecks}
            tone="accent"
            glyph={ListChecks}
            title="План дня"
            text={`${m.plan.length} в фокусе${overdueInPlan ? `, ${overdueInPlan} с просроченным сроком` : ""}. Сверх лимита ждут ещё ${m.overPlan.length}. Закрыто сегодня: ${m.kpi.closedToday} из ${m.kpi.dailyGoal}.`}
            footer={
              <>
                <button
                  type="button"
                  disabled={!m.overPlan.length}
                  onClick={m.actions.moveOverPlanToTomorrow}
                  className="flex items-center gap-1.5 transition-colors hover:text-white disabled:opacity-40"
                >
                  Сверх плана ({m.overPlan.length}) — на завтра <ArrowRight size={15} strokeWidth={1.75} />
                </button>
                <label className="flex cursor-pointer items-center gap-2.5">
                  Скрыть готовые
                  <Toggle on={hideDone} onChange={setHideDone} />
                </label>
              </>
            }
          >
            <div className="mt-5 flex flex-col">
              {rows.map((r) => (
                <div key={r.id} className="group flex h-[46px] items-center gap-3 border-b" style={{ borderColor: "#1E1E1E" }}>
                  <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} />
                  <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ color: r.done ? S.ink3 : S.ink, textDecoration: r.done ? "line-through" : undefined }}>
                    {r.title}
                  </span>
                  {r.projectName && (
                    <span className="max-w-[130px] truncate text-[12.5px]" style={{ color: S.ink3 }}>
                      {r.projectName}
                    </span>
                  )}
                  <PriorityChip priority={r.priority} />
                  <span className="w-[56px] text-right text-[12.5px] tabular-nums" style={{ color: r.overdue ? S.red : S.ink3 }}>
                    {r.dueLabel}
                  </span>
                </div>
              ))}
              {!rows.length && (
                <div className="py-6 text-[14px]" style={{ color: S.ink3 }}>
                  План на сегодня пуст — добавьте первую задачу.
                </div>
              )}
              <div className="mt-2">
                <AddInline onAdd={m.actions.add} label="Добавить на сегодня" />
              </div>
              {m.overPlan.length > 0 && (
                <div className="mt-5">
                  <div className="mb-1 flex items-center gap-2 text-[13px]" style={{ color: S.ink3 }}>
                    <span className="size-[6px] rounded-full" style={{ background: S.amber }} />
                    Сверх плана · {m.overPlan.length}
                  </div>
                  {m.overPlan.slice(0, 3).map((r) => (
                    <div key={r.id} className="flex h-[40px] items-center gap-3 border-b opacity-70 transition-opacity hover:opacity-100" style={{ borderColor: "#1A1A1A" }}>
                      <Check done={r.done} onClick={() => m.actions.toggle(r.id)} label={r.title} size={16} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: S.ink2 }}>
                        {r.title}
                      </span>
                      <span className="text-[12px] tabular-nums" style={{ color: r.overdue ? S.red : S.ink3 }}>
                        {r.dueLabel}
                      </span>
                    </div>
                  ))}
                  {m.overPlan.length > 3 && (
                    <div className="pt-2 text-[12.5px]" style={{ color: S.ink4 }}>
                      и ещё {m.overPlan.length - 3} — в «Задачах»
                    </div>
                  )}
                </div>
              )}
            </div>
          </BigCard>

          <BigCard
            icon={Activity}
            tone="orange"
            glyph={Activity}
            title="Ритм"
            text={`${m.closed14} закрыто за 14 дней, пик — ${m.peak14} в день. Серия ${m.kpi.streak} дн., лучшая ${m.kpi.bestStreak}.`}
            footer={
              <>
                <span>Открыть аналитику</span>
                <ArrowRight size={15} strokeWidth={1.75} />
              </>
            }
          >
            <div className="mt-5">
              <MiniBars values={m.dynamics.map((d) => d.value)} height={64} barW={12} tone="orange" />
              <div className="mt-2 flex justify-between text-[11.5px] tabular-nums" style={{ color: S.ink4 }}>
                <span>{m.dynamics[0].label}</span>
                <span>сегодня</span>
              </div>
            </div>
          </BigCard>

          <BigCard
            icon={CalendarDays}
            tone="blue"
            glyph={CalendarDays}
            title="Встречи"
            text={m.meetings.length ? `${m.meetings.length} ${plural(m.meetings.length, "встреча", "встречи", "встреч")} впереди. Ближайшая — ${m.meetings[0].dateLabel} в ${m.meetings[0].time}.` : "Встреч не запланировано. День целиком под глубокую работу — хорошее время для плана."}
            footer={
              <>
                <span>Открыть планер</span>
                <ArrowRight size={15} strokeWidth={1.75} />
              </>
            }
          >
            {m.meetings.length > 0 && (
              <div className="mt-4 flex flex-col gap-1">
                {m.meetings.slice(0, 3).map((mt) => (
                  <div key={mt.id} className="flex items-center gap-2.5 py-1">
                    <Check done={!!mt.done} onClick={() => m.actions.toggleMeeting(mt.id)} label={mt.title} size={16} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{mt.title}</span>
                    <span className="text-[12px] tabular-nums" style={{ color: S.ink3 }}>
                      {mt.time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </BigCard>

          <BigCard
            icon={FolderKanban}
            tone="accent"
            glyph={FolderKanban}
            title="Проекты"
            text={atRisk.length ? `${atRisk.length} из ${m.projects.length} требуют внимания: ${atRisk.slice(0, 2).map((p) => p.name).join(", ")}${atRisk.length > 2 ? " и ещё " + (atRisk.length - 2) : ""}.` : `Все ${m.projects.length} в графике.`}
            footer={
              <>
                <span>Все проекты</span>
                <ArrowRight size={15} strokeWidth={1.75} />
              </>
            }
          >
            <div className="mt-4 flex flex-col gap-3">
              {m.projects.slice(0, 3).map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: p.health === "off-track" ? S.red : S.ink3 }}>
                      {p.done}/{p.total}
                    </span>
                  </div>
                  <Track pct={p.pct} tone={p.health === "off-track" ? "red" : p.health === "at-risk" ? "orange" : "accent"} h={4} />
                </div>
              ))}
            </div>
          </BigCard>

          <BigCard
            icon={Wallet}
            tone="green"
            glyph={Wallet}
            title="Деньги"
            text={`Оплачено в этом месяце. Ожидается ${rub(m.money.pending)}${m.money.overdue ? `, просрочено ${rub(m.money.overdue)}` : ""}.`}
            footer={
              <>
                <span>{m.followUps.length ? `Связаться: ${m.followUps.map((f) => f.name).slice(0, 2).join(", ")}` : "Клиенты"}</span>
                <ArrowRight size={15} strokeWidth={1.75} />
              </>
            }
          >
            <div className="mt-4 text-[34px] font-semibold leading-none tabular-nums tracking-[-0.03em]">{rub(m.money.paidThisMonth)}</div>
            <div className="mt-3 flex gap-2">
              <Chip tone="neutral">всего {rub(m.money.paidTotal)}</Chip>
              {m.money.overdue > 0 && <Chip tone="red">долг {rub(m.money.overdue)}</Chip>}
            </div>
          </BigCard>

          <BigCard
            icon={BookOpen}
            tone="red"
            glyph={BookOpen}
            title="Чтение"
            text={m.reading ? m.reading.title : "Очередь пуста. Добавьте статью или видео в Библиотеку — здесь будет выбор дня."}
            clamp
            footer={
              m.reading ? (
                <a href={m.reading.url ?? "#"} target="_blank" rel="noreferrer" className="flex w-full items-center justify-between transition-colors hover:text-white">
                  <span className="truncate">Читать · {m.reading.domain ?? "библиотека"}</span>
                  <ArrowRight size={15} strokeWidth={1.75} />
                </a>
              ) : (
                <>
                  <span>Открыть библиотеку</span>
                  <ArrowRight size={15} strokeWidth={1.75} />
                </>
              )
            }
          >
            {m.reading?.coverUrl && (
              <div className="mt-4 h-[72px] overflow-hidden rounded-[10px]" style={{ boxShadow: "inset 0 0 0 1px #222" }}>
                <img src={m.reading.coverUrl} alt="" className="size-full object-cover opacity-80" />
              </div>
            )}
          </BigCard>

          <BigCard className="col-span-2" icon={NotebookPen} tone="accent" glyph={NotebookPen} title="Заметка" text="Мысль на лету — сохранится в «Заметки» первой строкой как заголовок.">
            <div className="mt-4">
              <NoteBox onSave={m.actions.saveNote} rows={3} />
            </div>
          </BigCard>

          <BigCard
            icon={PieChart}
            tone="blue"
            glyph={PieChart}
            title="Статус задач"
            text={`${m.status.doneAll} готово, ${m.status.inProgress} в работе, ${m.status.overdueAll} просрочено.`}
          >
            <div className="mt-4 flex h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
              {[
                { v: m.status.doneAll, c: S.green },
                { v: m.status.inProgress, c: S.blue },
                { v: m.status.overdueAll, c: S.red },
              ].map((x, i) => (
                <span key={i} style={{ width: `${(x.v / Math.max(1, m.status.doneAll + m.status.inProgress + m.status.overdueAll)) * 100}%`, background: x.c }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.status.openByPriority
                .filter((p) => p.count > 0)
                .map((p) => (
                  <Chip key={p.priority} tone={p.priority === 1 ? "red" : p.priority === 2 ? "orange" : p.priority === 3 ? "green" : "neutral"} dot>
                    {p.label} · {p.count}
                  </Chip>
                ))}
            </div>
          </BigCard>
        </div>
      </main>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────────────────────
function Sidebar({ m }: { m: DashboardModel }) {
  const { clients } = useData();
  const [fav, setFav] = useState(true);
  const [rec, setRec] = useState(true);
  const follow = new Set(m.followUps.map((f) => f.id));
  return (
    <aside className="sticky top-0 flex h-screen w-[284px] shrink-0 flex-col overflow-y-auto px-4 pb-4 pt-5 max-[1360px]:w-[256px] [scrollbar-width:none]">
      <div className="flex items-center gap-2.5 px-2">
        <span className="relative">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <rect x="2" y="2" width="22" height="22" rx="7" stroke="#F2F2F3" strokeWidth="2" />
            <path d="M8 13.5 11.5 17 18.5 9.5" stroke="#F2F2F3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="absolute -bottom-0.5 -right-0.5 size-[7px] rounded-full" style={{ background: S.accent, boxShadow: "0 0 0 2px #101010" }} />
        </span>
        <span className="text-[17px] font-semibold tracking-[-0.02em]">Рабочий стол</span>
        <span className="text-[12.5px] font-medium" style={{ color: "#FAAA77" }}>
          ур. {m.kpi.level}
        </span>
      </div>

      <label className="mt-5 flex h-10 items-center gap-2.5 rounded-[7px] px-3" style={{ background: "#171717" }}>
        <Search size={16} strokeWidth={1.75} style={{ color: S.ink3 }} />
        <input placeholder="Поиск" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#6b6b70]" />
        <span className="text-[12px]" style={{ color: S.ink4 }}>
          ⌘K
        </span>
      </label>

      <nav className="mt-3 flex flex-col gap-0.5">
        {m.nav.map((n) => {
          const Icon = NAV_ICON[n.id] ?? FolderKanban;
          const active = n.id === "dashboard";
          return (
            <a
              key={n.id}
              href="#"
              onClick={(e) => e.preventDefault()}
              className={`flex h-[38px] items-center gap-3 rounded-[7px] px-2.5 text-[14.5px] transition-colors ${active ? "" : "hover:bg-white/[0.03]"}`}
              style={{ background: active ? "#1A1A1A" : undefined, color: active ? S.ink : "#DEDEDF" }}
            >
              <Icon size={18} strokeWidth={1.75} style={{ color: active ? S.ink : S.ink3 }} />
              <span className="flex-1 truncate">{n.label}</span>
              {n.badge ? (
                <span className="text-[13px] tabular-nums" style={{ color: S.ink2 }}>
                  {n.badge}
                </span>
              ) : null}
            </a>
          );
        })}
      </nav>

      <Group label="Избранное" open={fav} onToggle={() => setFav((v) => !v)}>
        {m.projects.slice(0, 4).map((p) => (
          <a key={p.id} href="#" onClick={(e) => e.preventDefault()} className="flex h-[36px] items-center gap-3 rounded-[7px] px-2.5 text-[14px] transition-colors hover:bg-white/[0.03]" style={{ color: "#DEDEDF" }}>
            <LayoutGrid size={17} strokeWidth={1.75} style={{ color: S.ink3 }} />
            <span className="flex-1 truncate">{p.name}</span>
            <Star size={14} strokeWidth={1.75} fill="#FF9658" style={{ color: "#FF9658" }} />
          </a>
        ))}
      </Group>

      <Group label="Клиенты" open={rec} onToggle={() => setRec((v) => !v)}>
        {clients.slice(0, 5).map((c, i) => (
          <a key={c.id} href="#" onClick={(e) => e.preventDefault()} className="flex h-[36px] items-center gap-3 rounded-[7px] px-2.5 text-[14px] transition-colors hover:bg-white/[0.03]" style={{ color: "#DEDEDF" }}>
            <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-[10.5px] font-bold text-white" style={{ background: CLIENT_COLORS[i % CLIENT_COLORS.length] }}>
              {c.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1 truncate">{c.name}</span>
            {follow.has(c.id) && <CircleDot size={13} strokeWidth={2} style={{ color: S.orange }} aria-label="Пора связаться" />}
          </a>
        ))}
      </Group>
    </aside>
  );
}

function Group({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="mt-5">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex h-7 w-full items-center gap-2 px-2.5 text-[14px] transition-colors hover:text-white" style={{ color: "#A1A2A6" }}>
        <ChevronDown size={15} strokeWidth={1.75} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        {label}
      </button>
      {open && <div className="mt-1 flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────────────────────
function BigCard({
  icon: Icon,
  tone,
  glyph: Glyph,
  title,
  text,
  footer,
  className = "",
  clamp,
  children,
}: {
  icon: LucideIcon;
  tone: Tone;
  glyph: LucideIcon;
  title: string;
  text: string;
  footer?: ReactNode;
  className?: string;
  clamp?: boolean;
  children?: ReactNode;
}) {
  const c = toneColor(tone);
  return (
    <section className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[12px] transition-shadow duration-300 hover:shadow-[inset_0_0_0_1px_#2a2a2a] ${className}`} style={cardBase}>
      {/* brand glow */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[220px] opacity-80 transition-opacity duration-300 group-hover:opacity-100" style={{ background: `radial-gradient(60% 100% at 30% 0%, ${alpha(c, 0.1)}, transparent 70%)` }} />
      {/* ghost watermark glyph */}
      <Glyph
        aria-hidden
        size={260}
        strokeWidth={1.1}
        className="pointer-events-none absolute -right-10 -top-6 transition-transform duration-500 group-hover:-translate-x-1 group-hover:translate-y-1"
        style={{ color: "#fff", opacity: 0.045, filter: "blur(1.5px)" }}
      />
      <div className="relative flex flex-1 flex-col p-6">
        <span className="relative inline-flex size-10 items-center justify-center">
          <Icon size={30} strokeWidth={1.5} style={{ color: "#5C5C60" }} />
          <span className="absolute bottom-1 right-0.5 size-[7px] rounded-full" style={{ background: c, boxShadow: `0 0 0 2px ${PANEL}, 0 0 10px ${alpha(c, 0.8)}` }} />
        </span>
        <h2 className="mt-5 text-[22px] font-medium tracking-[-0.02em]">{title}</h2>
        <p className={`mt-1.5 max-w-[560px] text-[14.5px] leading-[1.6] ${clamp ? "line-clamp-3" : ""}`} style={{ color: "#A5A5A7" }}>
          {text}
        </p>
        {children}
        {footer && (
          <div className="mt-auto flex items-center justify-between gap-3 pt-6 text-[14px]" style={{ color: "#7D7D80" }}>
            {footer}
          </div>
        )}
      </div>
    </section>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? S.accent : "#2A2A2A", boxShadow: "inset 0 1px 2px rgba(0,0,0,.5)" }}
    >
      <span
        className="absolute top-[2px] size-[14px] rounded-full transition-[left] duration-200"
        style={{ left: on ? 16 : 2, background: "linear-gradient(180deg, #F0F0F0, #BDBDBD)", boxShadow: "0 1px 2px rgba(0,0,0,.5)" }}
      />
    </button>
  );
}
