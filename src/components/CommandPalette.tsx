import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  StickyNote,
  CalendarDays,
  BarChart3,
  Archive,
  Settings,
  Plus,
  CircleDot,
  Target,
  Trophy,
  BookOpen,
  BookMarked,
  Timer,
  Bot,
} from "lucide-react";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { usePomodoro } from "@/store/PomodoroProvider";
import { getRecent } from "@/lib/recent";
import { Clock, Check } from "lucide-react";

const NAV = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/projects", label: "Проекты", icon: FolderKanban },
  { to: "/tasks", label: "Задачи", icon: CheckSquare },
  { to: "/notes", label: "Заметки", icon: StickyNote },
  { to: "/calendar", label: "Календарь", icon: CalendarDays },
  { to: "/analytics", label: "Аналитика", icon: BarChart3 },
  { to: "/knowledge", label: "База знаний", icon: BookMarked },
  { to: "/archive", label: "Архив", icon: Archive },
  { to: "/achievements", label: "Достижения", icon: Trophy },
  { to: "/changelog", label: "Story · обновления", icon: BookOpen },
  { to: "/settings", label: "Настройки", icon: Settings },
];

/** Global Cmd+K palette: navigate, quick-add, and search across all entities. */
export function CommandPalette() {
  const navigate = useNavigate();
  const { projects, tasks, notes, toggleTask } = useData();
  const { commandOpen, setCommandOpen, setQuickAddOpen, setQuickNoteOpen, setAssistantOpen } = useUI();
  const { toast } = useToast();
  const pomodoro = usePomodoro();
  const [search, setSearch] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  const go = (to: string, state?: Record<string, unknown>) => {
    setCommandOpen(false);
    navigate(to, state ? { state } : undefined);
  };

  const recent = commandOpen ? getRecent() : [];

  return (
    <CommandDialog open={commandOpen} onOpenChange={(v) => { setCommandOpen(v); if (!v) setSearch(""); }}>
      <CommandInput placeholder="Поиск по задачам, заметкам, проектам…" value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>Ничего не найдено.</CommandEmpty>

        {recent.length > 0 && (
          <CommandGroup heading="Недавнее">
            {recent.map((r) => (
              <CommandItem key={r.id} value={`recent ${r.label}`} onSelect={() => go(r.to, r.state)}>
                <Clock />
                {r.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Действия">
          <CommandItem
            onSelect={() => {
              setCommandOpen(false);
              setQuickAddOpen(true);
            }}
          >
            <Plus />
            Новая задача
          </CommandItem>
          <CommandItem
            value="note заметка"
            onSelect={() => { setCommandOpen(false); setQuickNoteOpen(true); }}
          >
            <StickyNote />
            Быстрая заметка
          </CommandItem>
          <CommandItem value="focus фокус сегодня" onSelect={() => go("/focus")}>
            <Target />
            Фокус на сегодня
          </CommandItem>
          <CommandItem
            value="ai ассистент чат ии"
            onSelect={() => { setCommandOpen(false); setAssistantOpen(true); }}
          >
            <Bot />
            AI-ассистент
          </CommandItem>
          <CommandItem
            value="pomodoro помодоро таймер фокус"
            onSelect={() => { setCommandOpen(false); pomodoro.phase === "idle" ? pomodoro.start() : pomodoro.reset(); }}
          >
            <Timer />
            {pomodoro.phase === "idle" ? "Запустить помодоро" : "Остановить помодоро"}
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Навигация">
          {NAV.map(({ to, label, icon: Icon }) => (
            <CommandItem key={to} value={`nav ${label}`} onSelect={() => go(to)}>
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        {projects.length > 0 && (
          <CommandGroup heading="Проекты">
            {projects.map((p) => (
              <CommandItem key={p.id} value={`project ${p.name}`} onSelect={() => go(`/projects/${p.id}`)}>
                <FolderKanban />
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tasks.length > 0 && (
          <CommandGroup heading="Задачи">
            {(search.trim() ? tasks : tasks.slice(0, 8)).map((t) => (
              <CommandItem key={t.id} value={`task ${t.title} ${t.description ?? ""} ${t.tags.join(" ")}`} onSelect={() => go("/tasks", { openTaskId: t.id })}>
                {t.done ? <Check className="text-success" /> : <CircleDot />}
                <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {search.trim() && tasks.some((t) => !t.done) && (
          <CommandGroup heading="Действия над задачей">
            {tasks.filter((t) => !t.done).slice(0, 8).map((t) => (
              <CommandItem
                key={`done-${t.id}`}
                value={`выполнить сделать закрыть ${t.title} ${t.tags.join(" ")}`}
                onSelect={() => { toggleTask(t.id); toast(`Выполнено: ${t.title}`); setCommandOpen(false); setSearch(""); }}
              >
                <Check />
                Выполнить: {t.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {notes.length > 0 && (
          <CommandGroup heading="Заметки">
            {notes.map((n) => (
              <CommandItem key={n.id} value={`note ${n.title} ${n.body.slice(0, 140)} ${n.tags.join(" ")}`} onSelect={() => go("/notes", { openNoteId: n.id })}>
                <StickyNote />
                {n.title || "Без названия"}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
