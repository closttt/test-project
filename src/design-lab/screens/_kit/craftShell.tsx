/**
 * Design lab · Craft Dark app shell — the frame of the approved main screen («Бенто × Канбан»),
 * shared by every other screen so they all live in one product:
 *
 *   ┌ sidebar (panel 24) ┐ ┌ page panel 24 ───────────────────────────────────────┐
 *   │ logo               │ │ Рабочий стол / <crumb>          date · bell · actions │
 *   │ search pill        │ │ [tile] <Title>  subtitle                    right    │
 *   │ nav (active tinted)│ │ children                                              │
 *   │ settings           │ │                                                       │
 *   └────────────────────┘ └───────────────────────────────────────────────────────┘
 *
 * Owner-approved details: no streak card, no avatar in the sidebar; the active section is a clear
 * accent-tinted fill with an accent icon; the title carries a blue tile icon.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  BellRing,
  BookOpen,
  CalendarClock,
  ChartColumn,
  History,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Search,
  Settings,
  Trophy,
  Users,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";

import { Btn, C, IconBtn, Logo, R, T, dashed, rootStyle } from "@/design-lab/screens/_kit/craft";
import { useData } from "@/store/DataProvider";
import { NAV_ITEMS, loadNavHidden, loadNavOrder } from "@/lib/navConfig";
import { hasUnseen } from "@/lib/changelog";
import { isOverdue, isToday, localDayStr } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import { meetingStart, MEETING_LEAD_MIN } from "@/lib/meetingAlerts";
import { notificationPermission, requestNotifications } from "@/lib/reminders";
import { playChime } from "@/lib/sound";

export type NavId =
  | "dashboard"
  | "clients"
  | "projects"
  | "tasks"
  | "planner"
  | "notes"
  | "analytics"
  | "knowledge"
  | "settings"
  | "achievements"
  | "archive"
  | "changelog";

export const NAV_ICON: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Users,
  projects: FolderKanban,
  tasks: ListChecks,
  planner: CalendarClock,
  notes: NotebookPen,
  analytics: ChartColumn,
  knowledge: BookOpen,
  settings: Settings,
  achievements: Trophy,
  archive: Archive,
  changelog: History,
};

const ICON = { size: 18, strokeWidth: 1.75 } as const;

/** Nav pill. Active = accent-tinted fill + accent icon, no outline. `to` makes it a link to that route. */
export function SideItem({ icon: Icon, label, active, badge, dot, to }: { icon: LucideIcon; label: string; active?: boolean; badge?: number; dot?: boolean; to?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={to ? () => navigate(to) : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-3 px-4 text-left transition-colors duration-150 ${active ? "" : "hover:bg-[#161619]"}`}
      style={{ height: 44, borderRadius: R.inner, background: active ? "rgba(10,132,255,0.14)" : undefined, color: active ? C.text : C.text2, fontSize: 14 }}
    >
      <Icon {...ICON} color={active ? C.accent : C.text2} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {dot ? <span aria-label="есть новое" style={{ width: 8, height: 8, borderRadius: 9, background: C.accent }} /> : null}
      {badge ? (
        <span className="grid place-items-center" style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 99, background: C.accent, color: "#fff", fontSize: 12 }}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export interface ShellSearch {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function SideSearch({ search }: { search?: ShellSearch }) {
  return (
    <label className="flex items-center gap-3 px-4" style={{ height: 44, borderRadius: 999, background: C.card }}>
      <Search {...ICON} color={C.text2} />
      <input
        value={search?.value ?? undefined}
        onChange={(e) => search?.onChange(e.target.value)}
        placeholder={search?.placeholder ?? "Поиск"}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5E6068]"
        style={{ fontSize: 14, color: C.text }}
      />
      {search?.value ? (
        <button type="button" aria-label="Очистить" onClick={() => search.onChange("")} style={{ color: C.text3 }}>
          <X size={14} strokeWidth={1.75} />
        </button>
      ) : null}
    </label>
  );
}

/** Open tasks for today (due today or overdue, not snoozed) — the «Задачи» badge, same rule as the dashboard. */
function useTodayOpen() {
  const { tasks } = useData();
  return useMemo(() => tasks.filter((t) => !t.done && !t.archivedAt && t.dueDate && !isSnoozed(t) && (isToday(t.dueDate) || isOverdue(t.dueDate))).length, [tasks]);
}

/** Same event the Settings nav editor fires (components/layout/Sidebar NAV_CHANGED_EVENT). */
const NAV_CHANGED_EVENT = "crm-nav-changed";

/** Sections in the owner's order, minus the ones hidden in Settings → Навигация. */
function useNavItems() {
  const read = () => {
    const hidden = loadNavHidden();
    return loadNavOrder()
      .map((id) => NAV_ITEMS.find((n) => n.id === id))
      .filter((n): n is (typeof NAV_ITEMS)[number] => !!n && !hidden.has(n.id));
  };
  const [items, setItems] = useState(read);
  useEffect(() => {
    const on = () => setItems(read());
    window.addEventListener(NAV_CHANGED_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(NAV_CHANGED_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return items;
}

/** A release the owner hasn't opened yet → a dot on «История» until the page is visited. */
function useUnseenChangelog() {
  const [unseen, setUnseen] = useState(() => {
    try {
      return hasUnseen();
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const on = () => setUnseen(false);
    window.addEventListener("crm-changelog-seen", on);
    return () => window.removeEventListener("crm-changelog-seen", on);
  }, []);
  return unseen;
}

/** Pinned to the bottom of the sidebar, below the sections list. */
const FOOT_ITEMS: { id: NavId; label: string; to: string }[] = [
  { id: "achievements", label: "Достижения", to: "/achievements" },
  { id: "changelog", label: "История", to: "/changelog" },
  { id: "settings", label: "Настройки", to: "/settings" },
];

export function Sidebar({ active, search }: { active: NavId; search?: ShellSearch }) {
  const todayOpen = useTodayOpen();
  const navItems = useNavItems();
  const unseen = useUnseenChangelog();
  return (
    <aside
      data-lab-block="nav"
      className="sticky top-5 hidden shrink-0 flex-col self-start overflow-y-auto [scrollbar-width:none] lg:flex"
      style={{ width: 248, height: "calc(100vh - 40px)", background: C.panel, borderRadius: R.page, padding: "20px 16px 16px" }}
    >
      <div className="flex items-center pl-2" style={{ height: 40 }}>
        <Logo />
      </div>
      <div className="my-4" style={{ height: 1, background: C.line }} />
      <SideSearch search={search} />
      <div className="mb-2 mt-6 px-4" style={{ ...T.foot, color: C.text3 }}>
        Разделы
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((n) => (
          <SideItem key={n.id} icon={NAV_ICON[n.id] ?? LayoutDashboard} label={n.label} to={n.to} active={n.id === active} badge={n.id === "tasks" ? todayOpen : undefined} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 pt-5">
        {FOOT_ITEMS.map((n) => (
          <SideItem key={n.id} icon={NAV_ICON[n.id]} label={n.label} to={n.to} active={active === n.id} dot={n.id === "changelog" && unseen} />
        ))}
      </div>
    </aside>
  );
}

/** Below lg the sidebar folds into one scrollable row of section pills above the page. */
export function MobileNav({ active }: { active: NavId }) {
  const navigate = useNavigate();
  const items = [...useNavItems(), ...FOOT_ITEMS];
  return (
    <nav className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:hidden" aria-label="Разделы">
      {items.map((n) => {
        const Icon = NAV_ICON[n.id] ?? LayoutDashboard;
        const on = n.id === active;
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => navigate(n.to)}
            aria-current={on ? "page" : undefined}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5"
            style={{ height: 40, borderRadius: 999, background: on ? "rgba(10,132,255,0.14)" : C.card, color: on ? C.text : C.text2, fontSize: 14 }}
          >
            <Icon size={16} strokeWidth={1.75} color={on ? C.accent : C.text2} />
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}

// ── Notifications bell ──────────────────────────────────────────────────────────────────────

const MIN = 60 * 1000;
const hhmm = (t: number) => new Date(t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/**
 * Today's upcoming meetings and the alert settings. The alert itself (chime + toast + browser
 * notification MEETING_LEAD_MIN before the start) is fired app-wide by ReminderEngine, so it rings
 * on every page and never twice — this bell only shows what is coming and when it will ring.
 */
export function MeetingBell({ dot }: { dot?: boolean }) {
  const { meetings } = useData();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(() => notificationPermission());
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const today = localDayStr();
  const todays = meetings
    .filter((mt) => !mt.done && mt.date === today && meetingStart(mt) + (mt.durationMin ?? 30) * MIN > now)
    .sort((a, b) => meetingStart(a) - meetingStart(b));
  const soon = todays.some((mt) => meetingStart(mt) - now <= MEETING_LEAD_MIN * MIN);

  return (
    <div ref={ref} className="relative">
      <IconBtn title="Уведомления" dot={soon || dot} onClick={() => setOpen((o) => !o)}>
        {soon ? <BellRing {...ICON} color={C.accent} /> : <Bell {...ICON} />}
      </IconBtn>
      {open && (
        <div
          className="absolute right-0 z-40 flex flex-col gap-3 p-4"
          style={{ top: 48, width: "min(380px, calc(100vw - 32px))", background: C.panel, borderRadius: R.card, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 24px 60px rgba(0,0,0,0.55)` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span style={T.title}>Уведомления</span>
            <span style={{ ...T.foot, color: C.text3 }}>за {MEETING_LEAD_MIN} мин до встречи · со звуком</span>
          </div>
          <div className="flex flex-col" style={{ background: C.card, borderRadius: R.inner }}>
            {todays.length === 0 ? (
              <div className="px-4 py-4" style={{ ...T.body, color: C.text3 }}>
                Сегодня встреч больше нет — напоминать не о чем.
              </div>
            ) : (
              todays.map((mt) => {
                const start = meetingStart(mt);
                return (
                  <div key={mt.id} className="flex items-center gap-3 px-4" style={{ minHeight: 56, ...dashed }}>
                    <span style={{ ...T.cell, ...T.num, width: 48 }}>{mt.time}</span>
                    <span className="min-w-0 flex-1 truncate" style={T.body}>
                      {mt.title}
                    </span>
                    <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
                      {start > now ? `напомню в ${hhmm(start - MEETING_LEAD_MIN * MIN)}` : "идёт"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {perm === "granted" ? (
              <span style={{ ...T.foot, color: C.text3 }}>Уведомления браузера включены</span>
            ) : perm === "denied" ? (
              <span style={{ ...T.foot, color: C.text3 }}>Браузер запретил уведомления — включи в настройках сайта</span>
            ) : (
              <Btn size={36} onClick={() => requestNotifications().then(setPerm)}>
                Включить уведомления
              </Btn>
            )}
            <Btn size={36} kind="ghost" icon={<Volume2 size={16} strokeWidth={1.75} />} onClick={playChime}>
              Проверить звук
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}


/** Blue rounded tile with a white glyph — the title icon (the dashboard uses the folder variant). */
export function TitleTile({ icon: Icon, size = 48 }: { icon: LucideIcon; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: "linear-gradient(180deg,#3D9DFF 0%,#0A6CF0 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 6px 18px rgba(10,132,255,0.25)",
      }}
    >
      <Icon size={size * 0.46} strokeWidth={1.9} color="#fff" />
    </span>
  );
}

/** The dashboard's folder icon, for screens that want the exact same mark. */
export function FolderTile() {
  return (
    <svg width="52" height="44" viewBox="0 0 52 44" fill="none" aria-hidden>
      <defs>
        <linearGradient id="shellfolder" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3D9DFF" />
          <stop offset="1" stopColor="#0A6CF0" />
        </linearGradient>
      </defs>
      <path d="M0 8a6 6 0 0 1 6-6h12.5a6 6 0 0 1 4.2 1.7L26 7h20a6 6 0 0 1 6 6v25a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V8Z" fill="#0A5BC8" />
      <path d="M0 15a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6v23a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V15Z" fill="url(#shellfolder)" />
      <path d="M6 10h40a5 5 0 0 1 5 5" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none" />
    </svg>
  );
}

const DATE_LABEL = () =>
  new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase());

/**
 * Full screen: sidebar + page panel with the breadcrumb row and the title row.
 * `actions` sit right of the bell (primary first); `titleRight` sits at the right of the title row.
 * Pass `bare` to skip the title row when a concept wants its own hero.
 */
export function CraftShell({
  active,
  crumb,
  crumbTo,
  title,
  subtitle,
  icon,
  actions,
  titleRight,
  search,
  bare,
  children,
}: {
  active: NavId;
  crumb: string;
  /** Makes the breadcrumb a link (e.g. a project page → "/projects"). */
  crumbTo?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  titleRight?: ReactNode;
  search?: ShellSearch;
  bare?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen gap-2 p-3 lg:p-5" style={rootStyle}>
      <Sidebar active={active} search={search} />
      <main className="min-w-0 flex-1 p-4 lg:p-6" style={{ background: C.panel, borderRadius: R.page }}>
        <MobileNav active={active} />
        <div data-lab-block="topbar" className="flex items-center justify-between gap-4" style={{ height: 44 }}>
          <div className="flex min-w-0 items-center gap-2.5" style={{ ...T.body, color: C.text3 }}>
            <LayoutDashboard size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="hidden sm:inline">Рабочий стол</span>
            <span className="hidden sm:inline" style={{ color: C.line2 }}>/</span>
            {crumbTo ? (
              <button type="button" onClick={() => navigate(crumbTo)} className="truncate transition-colors hover:text-white" style={{ color: C.text }}>
                {crumb}
              </button>
            ) : (
              <span className="truncate" style={{ color: C.text }}>{crumb}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-2 hidden whitespace-nowrap md:inline" style={{ ...T.body, color: C.text3 }}>
              {DATE_LABEL()}
            </span>
            <MeetingBell />
            {actions}
          </div>
        </div>
        {!bare && (
          <div data-lab-block="title" className="mt-6 flex flex-wrap items-center gap-4">
            <TitleTile icon={icon ?? NAV_ICON[active] ?? LayoutDashboard} />
            <h1 style={{ fontSize: 40, lineHeight: 1.05, fontWeight: 500, letterSpacing: "-0.035em" }}>{title ?? crumb}</h1>
            {subtitle && (
              <span className="ml-1 self-end pb-1" style={{ ...T.body, color: C.text3 }}>
                {subtitle}
              </span>
            )}
            {titleRight && <div className="ml-auto flex items-center gap-2">{titleRight}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
