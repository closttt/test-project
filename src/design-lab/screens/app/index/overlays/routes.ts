/**
 * The Index app's destinations in one list — shared by the palette (navigation group), the global
 * «G → letter» hotkeys and the shortcuts sheet, so the three can never disagree.
 * Order = the sidebar's numbering (01…12), then the two routes that live outside the numbered nav.
 */
export interface Dest {
  to: string;
  label: string;
  /** Letter after «G» (lower-case), if the destination has a jump key. */
  g?: string;
}

export const DESTS: Dest[] = [
  { to: "/", label: "Дашборд", g: "d" },
  { to: "/tasks", label: "Задачи", g: "t" },
  { to: "/projects", label: "Проекты", g: "p" },
  { to: "/clients", label: "Клиенты", g: "k" },
  { to: "/planner", label: "Планер · неделя по часам", g: "w" },
  { to: "/notes", label: "Заметки", g: "n" },
  { to: "/knowledge", label: "База знаний", g: "b" },
  { to: "/analytics", label: "Аналитика", g: "y" },
  { to: "/archive", label: "Архив", g: "r" },
  { to: "/changelog", label: "Что нового · обновления" },
  { to: "/settings", label: "Настройки", g: "s" },
  { to: "/system", label: "Система" },
  { to: "/achievements", label: "Достижения", g: "a" },
  { to: "/focus", label: "Фокус на сегодня", g: "f" },
];

/** «G then letter» → route. Keyed by the physical key (KeyD…) so it works on the Russian layout too. */
export const GO_BY_CODE: Record<string, string> = Object.fromEntries(
  DESTS.filter((d) => d.g).map((d) => [`Key${d.g!.toUpperCase()}`, d.to])
);
