import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  CheckSquare,
  StickyNote,
  CalendarDays,
  BarChart3,
  Archive,
  Settings,
  BookMarked,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useData } from "@/store/DataProvider";
import { isToday, isOverdue, todayStr } from "@/lib/format";
import { levelProgress } from "@/lib/gamification";
import { computeStreak } from "@/lib/gameStats";
import { StreakFlame } from "@/components/StreakFlame";
import { levelTitle } from "@/types";
import { NAV_ITEMS, loadNavOrder, loadNavHidden } from "@/lib/navConfig";

const ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  clients: Users,
  projects: FolderKanban,
  tasks: CheckSquare,
  notes: StickyNote,
  calendar: CalendarDays,
  analytics: BarChart3,
  knowledge: BookMarked,
  archive: Archive,
};

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  activePath,
  badge,
  badgeTone,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  activePath: string;
  badge?: number;
  badgeTone?: "default" | "risk";
}) {
  const isActive = end ? activePath === to : activePath.startsWith(to);
  return (
    <NavLink
      to={to}
      end={end}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {isActive && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg border border-border bg-secondary"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <Icon className="relative z-10 h-4 w-4" />
      <span className="relative z-10">{label}</span>
      {badge ? (
        <span
          className={cn(
            "relative z-10 ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
            badgeTone === "risk" ? "bg-risk/20 text-risk" : "bg-secondary-foreground/10 text-foreground"
          )}
        >
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

/** Fires when Settings changes nav order/visibility, so the mounted Sidebar picks it up live. */
export const NAV_CHANGED_EVENT = "crm-nav-changed";

export function Sidebar() {
  const { pathname } = useLocation();
  const { tasks, gamification, completionLog } = useData();
  const lvl = levelProgress(gamification.xp);
  const streak = computeStreak(completionLog);
  const streakAtRisk = streak >= 2 && !completionLog[todayStr()];
  const [order, setOrder] = useState(() => loadNavOrder());
  const [hidden, setHidden] = useState(() => loadNavHidden());

  useEffect(() => {
    const onChange = () => {
      setOrder(loadNavOrder());
      setHidden(loadNavHidden());
    };
    window.addEventListener(NAV_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(NAV_CHANGED_EVENT, onChange);
  }, []);

  const todayCount = tasks.filter(
    (t) => !t.done && (isOverdue(t.dueDate) || (t.dueDate && isToday(t.dueDate)))
  ).length;

  const byId = new Map(NAV_ITEMS.map((n) => [n.id, n]));
  const primary = order
    .filter((id) => !hidden.has(id))
    .map((id) => byId.get(id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .map((n) => ({
      to: n.to,
      label: n.label,
      icon: ICONS[n.id],
      end: n.id === "dashboard",
      badge: n.id === "tasks" ? todayCount : undefined,
    }));

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between border-r border-border bg-card/30 p-4">
      <div>
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
            Р
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Рабочий стол</span>
        </div>
        <nav className="flex flex-col gap-1">
          {primary.map((l) => (
            <NavItem key={l.to} {...l} activePath={pathname} />
          ))}
        </nav>
      </div>
      <div className="flex flex-col gap-1">
        {gamification.enabled && (
          <NavLink
            to="/achievements"
            className="mb-1 flex flex-col gap-1.5 rounded-md border border-border px-3 py-2 transition-colors hover:border-muted-foreground/30"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-xs text-success">
                  {lvl.level}
                </span>
                {levelTitle(lvl.level)}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <StreakFlame streak={streak} compact atRisk={streakAtRisk} />
                {lvl.toNext} XP
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success" style={{ width: `${lvl.pct}%` }} />
            </div>
          </NavLink>
        )}
        <NavItem to="/settings" label="Настройки" icon={Settings} activePath={pathname} />
      </div>
    </aside>
  );
}
