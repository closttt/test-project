import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { Celebration } from "@/components/Celebration";
import { ACHIEVEMENTS, levelFromXp } from "@/lib/gamification";
import { computeGameStats, computeStreak } from "@/lib/gameStats";
import { effectsLevel } from "@/lib/effects";
import { questsForDay, questDone } from "@/lib/quests";
import { todayStr, addDays } from "@/lib/format";

/** Keeps the quest ledger from growing forever — only the last 7 days matter for payout guards. */
function trimQuestLog(log: Record<string, string[]> | undefined): Record<string, string[]> {
  if (!log) return {};
  const min = addDays(new Date(), -7);
  return Object.fromEntries(Object.entries(log).filter(([day]) => day >= min));
}
import { fireBrowserNotification } from "@/lib/reminders";
import { levelTitle } from "@/types";

/** Watches data: unlocks achievements, tracks best streak, level-ups, and shows +XP / confetti FX. */
export function GamificationEngine() {
  const data = useData();
  const { gamification, updateGamification } = data;
  const { toast } = useToast();
  const prevLevel = useRef(levelFromXp(gamification.xp));
  const prevXp = useRef(gamification.xp);
  // Mirrors gamification.achievements but mutates synchronously, so a StrictMode dev double-invoke
  // of this effect (same stale props both times) can't toast/notify the same unlock twice.
  const notifiedAchievements = useRef(new Set(gamification.achievements));
  const [xpPop, setXpPop] = useState<{ id: number; amount: number; x: number; y: number } | null>(null);
  const [levelUp, setLevelUp] = useState<{ level: number; title: string } | null>(null);

  // Last pointer position — so +XP floats up from the exact checkbox the user just clicked,
  // not a fixed spot at the top of the screen. Falls back to top-center for keyboard completes.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onPointer = (e: PointerEvent) => { lastPointer.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, []);

  useEffect(() => {
    if (!gamification.enabled) {
      prevXp.current = gamification.xp;
      prevLevel.current = levelFromXp(gamification.xp);
      return;
    }

    // +XP float — anchored to where the user just clicked (the checkbox). Silenced when the
    // user turned FX off (XP is still awarded — only the animation goes away).
    const delta = gamification.xp - prevXp.current;
    if (delta > 0 && effectsLevel() !== "off") {
      const p = lastPointer.current;
      setXpPop({
        id: Date.now(),
        amount: delta,
        x: p?.x ?? window.innerWidth / 2,
        y: p?.y ?? 96,
      });
    }
    prevXp.current = gamification.xp;

    // Level-up.
    const level = levelFromXp(gamification.xp);
    if (level > prevLevel.current) {
      const title = levelTitle(level);
      toast(`🎉 Новый уровень — ${level}: ${title}!`);
      fireBrowserNotification("Новый уровень!", `Уровень ${level} — ${title}`);
      setLevelUp({ level, title });
      setTimeout(() => setLevelUp(null), 1600);
    }
    prevLevel.current = level;

    // Best streak.
    const streak = computeStreak(data.completionLog);
    if (streak > gamification.bestStreak) updateGamification({ bestStreak: streak });

    // Daily quests — pay out once per quest per day. questLog is the ledger, so a reload or a
    // re-render can't double-pay, and yesterday's completions never re-trigger.
    const today = todayStr();
    const claimed = gamification.questLog?.[today] ?? [];
    const justDone = questsForDay(today).filter((q) => !claimed.includes(q.id) && questDone(q, data, today));
    if (justDone.length > 0) {
      const gained = justDone.reduce((s, q) => s + q.xp, 0);
      updateGamification({
        xp: gamification.xp + gained,
        // Keep only the last few days — the ledger is bookkeeping, not history.
        questLog: { ...trimQuestLog(gamification.questLog), [today]: [...claimed, ...justDone.map((q) => q.id)] },
      });
      justDone.forEach((q) => toast(`${q.icon} Квест выполнен: ${q.title} · +${q.xp} XP`));
    }

    // Achievement unlocks.
    const stats = computeGameStats({ ...data });
    const unlocked = ACHIEVEMENTS.filter((a) => a.test(stats) && !notifiedAchievements.current.has(a.id));
    if (unlocked.length > 0) {
      unlocked.forEach((a) => notifiedAchievements.current.add(a.id));
      updateGamification({ achievements: [...gamification.achievements, ...unlocked.map((a) => a.id)] });
      unlocked.forEach((a) => {
        toast(`${a.icon} Достижение: ${a.title}`);
        fireBrowserNotification("Новое достижение", a.title);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamification.xp, data.completionLog, data.tasks, data.pomodoroSessions, gamification.enabled]);

  return (
    <>
      <Celebration show={!!levelUp} />
      <AnimatePresence>
        {levelUp && (
          <motion.div
            key={levelUp.level}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: [0.6, 1.08, 1] }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none fixed inset-x-0 top-28 z-[110] flex justify-center"
          >
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-success/30 bg-background/90 px-6 py-4 text-center shadow-[0_0_40px_hsl(var(--success)/0.35)] backdrop-blur">
              <span className="text-3xl font-bold text-success">Уровень {levelUp.level}</span>
              <span className="text-sm text-muted-foreground">{levelUp.title}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {xpPop && (
          <motion.div
            key={xpPop.id}
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={{ opacity: 1, y: -32, scale: 1 }}
            exit={{ opacity: 0, y: -52 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => setXpPop(null)}
            style={{ left: xpPop.x, top: xpPop.y - 12 }}
            className="pointer-events-none fixed z-[120] -translate-x-1/2 whitespace-nowrap rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success shadow-[0_0_16px_hsl(var(--success)/0.3)]"
          >
            +{xpPop.amount} XP
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
