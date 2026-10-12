/**
 * «Индекс» · celebration — the Index take on src/components/Celebration.tsx (confetti) and on the
 * GamificationEngine's level-up badge. No colour confetti: a burst of square pixels (white, a few
 * lime) out of a black dock plate with one display line. Honours the reward-FX setting the same way
 * as the real one (`html[data-effects]`: off → nothing, subtle → fewer pixels) and reduced motion
 * (plate only, no burst).
 *
 * Triggers:
 *  · automatically when the day's plan closes — the real Dashboard's rule (due today, or overdue and
 *    open; snoozed excluded): the last open plan task gets completed, from any screen;
 *  · `celebrate({ kind: "plan" | "level" | "custom", … })` from anywhere (also a window event
 *    `ix:celebrate`, so non-React code can fire it). Two plan celebrations within 3s collapse.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { useData } from "@/store/DataProvider";
import { isOverdue, isToday } from "@/lib/format";
import { isSnoozed } from "@/lib/taskGrouping";
import { effectsLevel } from "@/lib/effects";
import { B, T, display, plural } from "@/design-lab/screens/_kit/index";
import { IX_EVENTS } from "./ui";

export type CelebrateDetail =
  | { kind: "plan"; done?: number }
  | { kind: "level"; level: number; title: string }
  | { kind: "custom"; eyebrow?: string; title: string; sub?: string };

/** Fire the Index celebration from any screen. */
export function celebrate(detail: CelebrateDetail = { kind: "plan" }) {
  window.dispatchEvent(new CustomEvent<CelebrateDetail>(IX_EVENTS.celebrate, { detail }));
}

interface Shown {
  id: number;
  eyebrow: string;
  title: string;
  sub?: string;
}

function toShown(d: CelebrateDetail): Shown {
  const id = Date.now();
  if (d.kind === "level") return { id, eyebrow: "Новый уровень", title: `Уровень ${d.level}`, sub: d.title };
  if (d.kind === "custom") return { id, eyebrow: d.eyebrow ?? "Готово", title: d.title, sub: d.sub };
  return {
    id,
    eyebrow: "План дня",
    title: "Закрыт",
    sub: d.done ? `${d.done} ${plural(d.done, "задача", "задачи", "задач")} сегодня — можно выдохнуть` : "Всё на сегодня сделано",
  };
}

/** 3×2 brand matrix with one lime cell — the plate's mark. */
function MarkCells() {
  return (
    <span className="grid grid-cols-3 gap-[2px]" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-[6px] w-[6px]" style={{ background: i === 0 ? B.lime : i === 5 ? B.off : B.text3 }} />
      ))}
    </span>
  );
}

function Burst({ count }: { count: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.12 : -0.08);
        const dist = 150 + (i % 4) * 46;
        const size = i % 3 === 0 ? 6 : 4;
        return { x: Math.cos(angle) * dist * 1.5, y: Math.sin(angle) * dist * 0.7, size, lime: i % 6 === 0, delay: (i % 5) * 0.02 };
      }),
    [count]
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute block"
          style={{ width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2, background: p.lime ? B.lime : B.text }}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{ opacity: [0, 1, 1, 0], x: p.x, y: p.y + 30 }}
          transition={{ duration: 1.3, delay: p.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.08, 0.6, 1] }}
        />
      ))}
    </div>
  );
}

export function CelebrationHost() {
  const { tasks } = useData();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<Shown | null>(null);
  const lastPlanAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<CelebrateDetail>).detail ?? { kind: "plan" };
      if (effectsLevel() === "off") return;
      if (d.kind === "plan") {
        if (Date.now() - lastPlanAt.current < 3000) return;
        lastPlanAt.current = Date.now();
      }
      setShown(toShown(d));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(null), 2400);
    };
    window.addEventListener(IX_EVENTS.celebrate, on);
    return () => {
      window.removeEventListener(IX_EVENTS.celebrate, on);
      clearTimeout(timer.current);
    };
  }, []);

  /* ── auto: «план дня закрыт» ─────────────────────────────────────────────────────────────── */
  const plan = useMemo(
    () => tasks.filter((t) => t.dueDate && !isSnoozed(t) && (isToday(t.dueDate) || (isOverdue(t.dueDate) && !t.done))),
    [tasks]
  );
  const prevOpen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const open = new Set(plan.filter((t) => !t.done).map((t) => t.id));
    const before = prevOpen.current;
    prevOpen.current = open;
    if (!before || before.size === 0 || open.size > 0) return;
    // Closed by completing (not by moving / deleting): one of the tasks that was open is now done.
    const closedByDone = [...before].some((id) => tasks.find((t) => t.id === id)?.done);
    if (closedByDone) celebrate({ kind: "plan", done: plan.filter((t) => t.done).length });
  }, [plan, tasks]);

  const level = effectsLevel();
  const count = level === "subtle" ? 12 : 22;

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          className="pointer-events-none fixed inset-x-0 top-[24vh] z-[110] flex justify-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
          role="status"
          aria-live="polite"
          style={{ fontFamily: B.font }}
        >
          <div className="relative">
            {!reduce && <Burst count={count} />}
            <div className="relative flex min-w-[360px] flex-col px-8 pb-7 pt-6" style={{ background: B.bg, boxShadow: B.shadowFloat, color: B.text }}>
              <div className="flex items-center gap-3">
                <MarkCells />
                <span style={{ ...T.caps, color: B.text3 }}>{shown.eyebrow}</span>
              </div>
              <div className="mt-6" style={display(64)}>
                {shown.title}
              </div>
              {shown.sub && (
                <div className="mt-3" style={{ ...T.body, color: B.text2 }}>
                  {shown.sub}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
