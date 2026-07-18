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
  Users,
  CalendarClock,
  ChevronRight,
  ArrowLeft,
  Flag,
  CalendarOff,
  FolderOpen,
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
import { isToday, todayStr, addDays, dueLabel } from "@/lib/format";
import { parseNaturalInput } from "@/lib/nlp";
import { PRIORITY_META, type Task, type Priority } from "@/types";
import { Clock, Check } from "lucide-react";

const NAV = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/clients", label: "Клиенты", icon: Users },
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
  const { projects, tasks, notes, clients, meetings, toggleTask, updateTask, addTask } = useData();
  const { commandOpen, setCommandOpen, setQuickAddOpen, setQuickNoteOpen, setAssistantOpen } = useUI();
  const { toast } = useToast();
  const pomodoro = usePomodoro();
  const [search, setSearch] = useState("");
  // Nested actions: selecting a task's chevron swaps the list to a compact action set
  // (priority/due) instead of leaving the palette — Linear-style "→ drill in".
  const [taskAction, setTaskAction] = useState<Task | null>(null);

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

  // Never reopen mid-action — a closed-then-reopened palette always starts at plain search.
  useEffect(() => {
    if (!commandOpen) setTaskAction(null);
  }, [commandOpen]);

  const go = (to: string, state?: Record<string, unknown>) => {
    setCommandOpen(false);
    navigate(to, state ? { state } : undefined);
  };

  function applyTaskAction(patch: Partial<Task>, note: string) {
    if (!taskAction) return;
    updateTask(taskAction.id, patch);
    toast(note);
    setCommandOpen(false);
    setSearch("");
  }

  const recent = commandOpen ? getRecent() : [];

  // NL action row: parse whatever's typed as a would-be task, offer "Создать: ..." as a top hit —
  // capture and command collapse into one bar instead of a round-trip through QuickAddDialog.
  const nlPreview = search.trim() ? parseNaturalInput(search) : null;
  const nlTitle = nlPreview?.title.trim() ?? "";
  function createFromSearch() {
    if (!nlPreview || !nlTitle) return;
    addTask({
      title: nlTitle,
      done: false,
      dueDate: nlPreview.dueDate,
      tags: nlPreview.tags,
      important: nlPreview.important,
      remindAt: nlPreview.remindAt,
      estimateMin: nlPreview.estimateMin,
      recurrence: nlPreview.recurrence,
    });
    toast(`Задача создана: ${nlTitle}`);
    setCommandOpen(false);
    setSearch("");
  }

  if (taskAction) {
    const t = taskAction;
    return (
      <CommandDialog open={commandOpen} onOpenChange={(v) => { setCommandOpen(v); if (!v) setSearch(""); }}>
        <CommandInput placeholder={`Действие для «${t.title}»…`} value={search} onValueChange={setSearch} />
        <CommandList>
          <CommandEmpty>Ничего не найдено.</CommandEmpty>
          <CommandGroup heading={t.title}>
            <CommandItem value="назад back" onSelect={() => setTaskAction(null)}>
              <ArrowLeft />
              Назад к поиску
            </CommandItem>
            <CommandItem value="открыть карточка" onSelect={() => go("/tasks", { openTaskId: t.id })}>
              <FolderOpen />
              Открыть карточку
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Приоритет">
            {([1, 2, 3, 0] as Priority[]).map((p) => (
              <CommandItem
                key={p}
                value={`приоритет ${PRIORITY_META[p].label}`}
                onSelect={() => applyTaskAction({ priority: p }, `Приоритет: ${PRIORITY_META[p].label}`)}
              >
                <Flag style={{ color: PRIORITY_META[p].dot }} />
                {PRIORITY_META[p].label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Срок">
            <CommandItem value="срок сегодня" onSelect={() => applyTaskAction({ dueDate: todayStr() }, "Срок: сегодня")}>
              <CalendarClock />
              Сегодня
            </CommandItem>
            <CommandItem value="срок завтра" onSelect={() => applyTaskAction({ dueDate: addDays(new Date(), 1) }, "Срок: завтра")}>
              <CalendarClock />
              Завтра
            </CommandItem>
            <CommandItem value="срок неделя" onSelect={() => applyTaskAction({ dueDate: addDays(new Date(), 7) }, "Срок: через неделю")}>
              <CalendarClock />
              Через неделю
            </CommandItem>
            <CommandItem value="без срока" onSelect={() => applyTaskAction({ dueDate: undefined }, "Срок снят")}>
              <CalendarOff />
              Без срока
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    );
  }

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

        {nlTitle && (
          <CommandGroup heading="Создать">
            <CommandItem value={`создать задачу ${search}`} onSelect={createFromSearch}>
              <Plus />
              <span className="min-w-0 flex-1 truncate">
                Создать: «{nlTitle}»
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {nlPreview?.dueDate && <span>{dueLabel(nlPreview.dueDate)}</span>}
                {nlPreview?.remindAt && <span>{nlPreview.remindAt.slice(11, 16)}</span>}
                {nlPreview?.important && <span className="text-amber-400">!важно</span>}
              </span>
            </CommandItem>
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

        {clients.length > 0 && (
          <CommandGroup heading="Клиенты">
            {clients.map((c) => (
              <CommandItem
                key={c.id}
                value={`client клиент ${c.name} ${c.company ?? ""} ${c.tags.join(" ")}`}
                onSelect={() => go("/clients", { openClientId: c.id })}
              >
                <Users />
                {c.name}
                {c.company && <span className="text-muted-foreground">· {c.company}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tasks.length > 0 && (
          <CommandGroup heading="Задачи">
            {(search.trim() ? tasks : tasks.slice(0, 8)).map((t) => (
              <CommandItem key={t.id} value={`task ${t.title} ${t.description ?? ""} ${t.tags.join(" ")}`} onSelect={() => go("/tasks", { openTaskId: t.id })}>
                {t.done ? <Check className="text-success" /> : <CircleDot />}
                <span className="min-w-0 flex-1 truncate">
                  <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Действия: ${t.title}`}
                  title="Приоритет, срок…"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSearch(""); setTaskAction(t); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="ml-auto shrink-0 rounded p-1 text-muted-foreground/50 hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
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

        {meetings.length > 0 && (
          <CommandGroup heading="Встречи">
            {(search.trim() ? meetings : meetings.filter((m) => !m.done).slice(0, 6)).map((m) => (
              <CommandItem key={m.id} value={`meeting встреча ${m.title}`} onSelect={() => go("/calendar")}>
                <CalendarClock />
                <span className={m.done ? "text-muted-foreground line-through" : ""}>{m.title}</span>
                <span className="text-muted-foreground">· {isToday(m.date) ? "сегодня" : m.date}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
