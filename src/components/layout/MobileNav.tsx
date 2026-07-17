import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  StickyNote,
  CalendarDays,
  BarChart3,
  BookMarked,
  Archive,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_ITEMS, loadNavOrder, loadNavHidden } from "@/lib/navConfig";
import { NAV_CHANGED_EVENT } from "@/components/layout/Sidebar";

const ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  tasks: CheckSquare,
  notes: StickyNote,
  calendar: CalendarDays,
  analytics: BarChart3,
  knowledge: BookMarked,
  archive: Archive,
};

// Bottom bar space is tight on a phone — show the user's top N in their own customized order
// instead of hard-coding a fixed subset that silently ignores desktop reordering/hiding.
const MAX_ITEMS = 5;

export function MobileNav() {
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

  const byId = new Map(NAV_ITEMS.map((n) => [n.id, n]));
  const items = order
    .filter((id) => !hidden.has(id))
    .map((id) => byId.get(id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .slice(0, MAX_ITEMS)
    .map((n) => ({ to: n.to, label: n.label, icon: ICONS[n.id], end: n.id === "dashboard" }));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem]",
              isActive ? "text-foreground" : "text-muted-foreground"
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
