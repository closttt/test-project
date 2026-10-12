/**
 * «Индекс» · background engines — the same ones the real AppLayout mounts.
 *
 *  · ReminderEngine, MeetingSyncEngine, CalendarSyncEngine: mounted as-is (they render nothing; their
 *    only output is toasts, which the Index toast style already dresses). In the lab the network
 *    guard blocks writes/sync — expected.
 *  · GamificationEngine renders its own UI (confetti, a green «Уровень N» badge, a green «+XP» pill)
 *    and puts emoji into its toasts — both off-system here. So the Index runs a line-for-line port of
 *    its logic (achievements, best streak, daily-quest payout with the same ledger guard, level-up,
 *    browser notifications) with Index visuals: the level-up goes through `celebrate()`, «+XP» is a
 *    tiny black hairline plate, toasts carry no emoji. The original component is NOT mounted, so
 *    nothing is awarded twice.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { ReminderEngine } from "@/components/ReminderEngine";
import { MeetingSyncEngine } from "@/components/MeetingSyncEngine";
import { CalendarSyncEngine } from "@/components/CalendarSyncEngine";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { ACHIEVEMENTS, levelFromXp } from "@/lib/gamification";
import { computeGameStats, computeStreak } from "@/lib/gameStats";
import { effectsLevel } from "@/lib/effects";
import { questsForDay, questDone } from "@/lib/quests";
import { todayStr, addDays } from "@/lib/format";
import { fireBrowserNotification } from "@/lib/reminders";
import { levelTitle } from "@/types";
import { B, T } from "@/design-lab/screens/_kit/index";
import { celebrate } from "./Celebration";

function trimQuestLog(log: Record<string, string[]> | undefined): Record<string, string[]> {
  if (!log) return {};
  const min = addDays(new Date(), -7);
  return Object.fromEntries(Object.entries(log).filter(([day]) => day >= min));
}

/** Port of components/GamificationEngine.tsx — same rules, Index visuals. */
function IndexGamificationEngine() {
  const data = useData();
  const { gamification, updateGamification } = data;
  const { toast } = useToast();
  const prevLevel = useRef(levelFromXp(gamification.xp));
  const prevXp = useRef(gamification.xp);
  const notifiedAchievements = useRef(new Set(gamification.achievements));
  const [xpPop, setXpPop] = useState<{ id: number; amount: number; x: number; y: number } | null>(null);

  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, []);

  useEffect(() => {
    if (!gamification.enabled) {
      prevXp.current = gamification.xp;
      prevLevel.current = levelFromXp(gamification.xp);
      return;
    }

    const delta = gamification.xp - prevXp.current;
    if (delta > 0 && effectsLevel() !== "off") {
      const p = lastPointer.current;
      setXpPop({ id: Date.now(), amount: delta, x: p?.x ?? window.innerWidth / 2, y: p?.y ?? 96 });
    }
    prevXp.current = gamification.xp;

    const level = levelFromXp(gamification.xp);
    if (level > prevLevel.current) {
      const title = levelTitle(level);
      toast(`Новый уровень — ${level}: ${title}`);
      fireBrowserNotification("Новый уровень!", `Уровень ${level} — ${title}`);
      celebrate({ kind: "level", level, title });
    }
    prevLevel.current = level;

    const streak = computeStreak(data.completionLog);
    if (streak > gamification.bestStreak) updateGamification({ bestStreak: streak });

    const today = todayStr();
    const claimed = gamification.questLog?.[today] ?? [];
    const justDone = questsForDay(today).filter((q) => !claimed.includes(q.id) && questDone(q, data, today));
    if (justDone.length > 0) {
      const gained = justDone.reduce((s, q) => s + q.xp, 0);
      updateGamification({
        xp: gamification.xp + gained,
        questLog: { ...trimQuestLog(gamification.questLog), [today]: [...claimed, ...justDone.map((q) => q.id)] },
      });
      justDone.forEach((q) => toast(`Квест выполнен: ${q.title} · +${q.xp} XP`));
    }

    const stats = computeGameStats({ ...data });
    const unlocked = ACHIEVEMENTS.filter((a) => a.test(stats) && !notifiedAchievements.current.has(a.id));
    if (unlocked.length > 0) {
      unlocked.forEach((a) => notifiedAchievements.current.add(a.id));
      updateGamification({ achievements: [...gamification.achievements, ...unlocked.map((a) => a.id)] });
      unlocked.forEach((a) => {
        toast(`Достижение: ${a.title}`);
        fireBrowserNotification("Новое достижение", a.title);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamification.xp, data.completionLog, data.tasks, data.pomodoroSessions, gamification.enabled]);

  return (
    <AnimatePresence>
      {xpPop && (
        <motion.div
          key={xpPop.id}
          initial={{ opacity: 0, y: 4, x: "-50%" }}
          animate={{ opacity: 1, y: -30, x: "-50%" }}
          exit={{ opacity: 0, y: -48, x: "-50%" }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          onAnimationComplete={() => setXpPop(null)}
          style={{ left: xpPop.x, top: xpPop.y - 12, fontFamily: B.font, background: B.bg, boxShadow: `inset 0 0 0 1px ${B.l20}` }}
          className="pointer-events-none fixed z-[120] flex h-6 items-center gap-1.5 whitespace-nowrap px-2"
          aria-hidden
        >
          <span className="h-[5px] w-[5px]" style={{ background: B.lime }} />
          <span style={{ ...T.num, color: B.text }}>+{xpPop.amount} XP</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Engines() {
  return (
    <>
      <ReminderEngine />
      <IndexGamificationEngine />
      <MeetingSyncEngine />
      <CalendarSyncEngine />
    </>
  );
}
