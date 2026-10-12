/**
 * «Индекс» · shortcuts sheet (?). Parity with src/components/ShortcutsDialog.tsx, rewritten for
 * what the Index app actually does: the G-jumps come from the same table as the hotkeys
 * (./routes), the Tasks-screen keys are the Index Tasks page's (1–6, N, /, Esc, ⌘/Shift-click),
 * and the palette keys are listed. The quick-entry syntax block is kept.
 */
import { useEffect, useState, type ReactNode } from "react";

import { B, T, pad2 } from "@/design-lab/screens/_kit/index";
import { Modal } from "@/design-lab/screens/_kit/index-ui";
import { DESTS } from "./routes";
import { IX_EVENTS, Kbd, MOD } from "./ui";

type Row = { keys: ReactNode; label: string };

const k = (...keys: string[]) => (
  <span className="inline-flex items-center gap-1">
    {keys.map((x, i) => (
      <Kbd key={i}>{x}</Kbd>
    ))}
  </span>
);

const GLOBAL: Row[] = [
  { keys: k("N"), label: "Новая задача" },
  { keys: k("Q"), label: "Быстрая заметка" },
  { keys: k("A"), label: "AI-ассистент" },
  { keys: k("/"), label: "Поиск и команды" },
  { keys: k(MOD, "K"), label: "Командная палитра" },
  { keys: k(MOD, "Z"), label: "Отменить последнее действие" },
  { keys: k("?"), label: "Этот список" },
  { keys: k("Esc"), label: "Закрыть окно / меню" },
];

const TASKS: Row[] = [
  { keys: k("1", "–", "6"), label: "Списки задач" },
  { keys: k("N"), label: "Строка добавления" },
  { keys: k("/"), label: "Поиск по списку" },
  { keys: <span className="inline-flex items-center gap-1">{k(MOD)}<span style={{ ...T.meta, color: B.text3 }}>клик</span></span>, label: "Выбрать несколько" },
  { keys: k("Esc"), label: "Снять выбор" },
];

const PALETTE: Row[] = [
  { keys: k("↑", "↓"), label: "Выбор строки" },
  { keys: k("↵"), label: "Открыть / выполнить" },
  { keys: k("→"), label: "Действия с задачей" },
  { keys: k("⌫"), label: "Назад из действий" },
  { keys: k(MOD, "↵"), label: "Создать задачу из строки" },
];

const DIALOGS: Row[] = [{ keys: k(MOD, "↵"), label: "Сохранить в диалоге" }];

const SYNTAX: [string[], string][] = [
  [["завтра", "в пятницу", "через 3 дня"], "срок"],
  [["в 15:00"], "напоминание"],
  [["~30м", "~1ч30м"], "оценка времени"],
  [["каждый день", "по будням"], "повтор"],
  [["#тег"], "тег"],
  [["!важно"], "важность"],
  [["@проект"], "проект"],
];

function Block({ n, title, rows }: { n: string; title: string; rows: Row[] }) {
  return (
    <section className="min-w-0">
      <div className="flex items-baseline gap-3 pb-2">
        <span style={{ ...T.num, color: B.off }}>{n}</span>
        <span style={{ ...T.caps, color: B.text3 }}>{title}</span>
      </div>
      <div style={{ borderTop: `1px solid ${B.l10}` }}>
        {rows.map((r) => (
          <div key={r.label} className="flex h-8 items-center justify-between gap-4" style={{ borderBottom: `1px solid ${B.l5}` }}>
            <span className="truncate" style={{ ...T.body, color: B.text2 }}>
              {r.label}
            </span>
            {r.keys}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Shortcuts() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(IX_EVENTS.shortcuts, on);
    return () => window.removeEventListener(IX_EVENTS.shortcuts, on);
  }, []);

  const jumps: Row[] = DESTS.filter((d) => d.g).map((d) => ({
    keys: (
      <span className="inline-flex items-center gap-1">
        <Kbd>G</Kbd>
        <span style={{ ...T.meta, color: B.off }}>→</span>
        <Kbd>{d.g!.toUpperCase()}</Kbd>
      </span>
    ),
    label: d.label.split(" · ")[0],
  }));

  let n = 0;
  const next = () => pad2(++n);

  return (
    <Modal open={open} onClose={() => setOpen(false)} n="?" title="Горячие клавиши" width={1040} top="8vh">
      <div className="grid gap-x-10 gap-y-7 px-5 pb-6 pt-5" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div className="flex min-w-0 flex-col gap-7">
          <Block n={next()} title="Везде" rows={GLOBAL} />
          <Block n={next()} title="Диалоги" rows={DIALOGS} />
        </div>
        <div className="min-w-0">
          <Block n={next()} title="Переход: G, затем буква" rows={jumps} />
        </div>
        <div className="flex min-w-0 flex-col gap-7">
          <Block n={next()} title="Экран «Задачи»" rows={TASKS} />
          <Block n={next()} title="Палитра" rows={PALETTE} />
        </div>
        <section className="col-span-3">
          <div className="flex items-baseline gap-3 pb-2">
            <span style={{ ...T.num, color: B.off }}>{next()}</span>
            <span style={{ ...T.caps, color: B.text3 }}>Быстрый ввод — пишите прямо в строке</span>
          </div>
          <div className="grid gap-x-10" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", borderTop: `1px solid ${B.l10}` }}>
            {SYNTAX.map(([codes, what]) => (
              <div key={what} className="flex min-h-8 items-center justify-between gap-4 py-1" style={{ borderBottom: `1px solid ${B.l5}` }}>
                <span className="flex flex-wrap items-center gap-1.5">
                  {codes.map((c) => (
                    <code key={c} className="inline-flex h-[22px] items-center px-2" style={{ ...T.meta, color: B.text, fontFamily: B.font, background: B.s1, boxShadow: `inset 0 0 0 1px ${B.l10}` }}>
                      {c}
                    </code>
                  ))}
                </span>
                <span style={{ ...T.meta, color: B.text3 }}>{what}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
