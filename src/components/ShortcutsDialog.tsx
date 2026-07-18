import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/unlumen-ui/kbd";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["N"], label: "Новая задача" },
  { keys: ["Q"], label: "Быстрая заметка" },
  { keys: ["A"], label: "AI-ассистент (живой ИИ по вашим данным)" },
  { keys: ["/"], label: "Поиск и команды" },
  { keys: ["⌘", "K"], label: "Командная палитра" },
  { keys: ["G", "→", "D/P/T/N/C"], label: "Переход в раздел" },
  { keys: ["G", "→", "Y/R"], label: "Аналитика / Архив" },
  { keys: ["G", "→", "A/S"], label: "Достижения / Настройки" },
  { keys: ["1", "–", "6"], label: "Списки задач (на экране Задачи)" },
  { keys: ["J", "/", "K"], label: "Курсор по строкам (список задач)" },
  { keys: ["X"], label: "Отметить/снять — под курсором" },
  { keys: ["E"], label: "Открыть карточку — под курсором" },
  { keys: ["Ctrl", "клик"], label: "Выбрать задачи (мультивыбор)" },
  { keys: ["⌘/Ctrl", "Enter"], label: "Сохранить в диалоге" },
  { keys: ["Esc"], label: "Закрыть / снять выбор" },
  { keys: ["?"], label: "Показать этот список" },
];

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
}

/** Press "?" anywhere (outside inputs) to see keyboard shortcuts. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Горячие клавиши</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k} size="md">
                    {k}
                  </Kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 border-t border-border pt-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Быстрое добавление задачи — пишите прямо в строке</p>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p><code className="rounded bg-secondary px-1 py-0.5">завтра</code> / <code className="rounded bg-secondary px-1 py-0.5">в пятницу</code> / <code className="rounded bg-secondary px-1 py-0.5">через 3 дня</code> — срок</p>
            <p><code className="rounded bg-secondary px-1 py-0.5">в 15:00</code> — напоминание, <code className="rounded bg-secondary px-1 py-0.5">~30м</code> — оценка времени</p>
            <p><code className="rounded bg-secondary px-1 py-0.5">каждый день</code> / <code className="rounded bg-secondary px-1 py-0.5">по будням</code> — повтор</p>
            <p><code className="rounded bg-secondary px-1 py-0.5">#тег</code> — тег, <code className="rounded bg-secondary px-1 py-0.5">!важно</code> — важность</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
