import { motion } from "framer-motion";
import { Flame, Gauge, Repeat, Star, Swords, Timer, Trophy, Zap } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { ContributionGrid } from "@/components/ContributionGrid";
import { useData } from "@/store/DataProvider";
import { ACHIEVEMENTS, levelProgress } from "@/lib/gamification";
import { computeGameStats } from "@/lib/gameStats";
import { questsForDay, seasonProgress } from "@/lib/quests";
import { formatDuration, todayStr } from "@/lib/format";
import { levelTitle } from "@/types";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

export default function Achievements() {
  const data = useData();
  const { gamification } = data;
  const lvl = levelProgress(gamification.xp);
  const stats = computeGameStats({ ...data, tasks: data.allTasks });
  const unlockedCount = gamification.achievements.length;
  const today = todayStr();
  const todayQuests = questsForDay(today);
  const season = seasonProgress(data);

  return (
    <AppShell title="Достижения" description={`Уровень ${lvl.level} · ${gamification.xp} XP`}>
      {/* Level + streak summary */}
      <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-lg font-semibold text-success">
                {lvl.level}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Уровень {lvl.level}</p>
                <p className="font-medium">{levelTitle(lvl.level)}</p>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success" style={{ width: `${lvl.pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">До уровня {lvl.level + 1}: {lvl.toNext} XP</p>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="flex items-center gap-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Стрик · рекорд {gamification.bestStreak}</p>
              <p className="text-xl font-semibold">{stats.streak} дн.</p>
            </div>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="flex items-center gap-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Достижения</p>
              <p className="text-xl font-semibold">{unlockedCount}/{ACHIEVEMENTS.length}</p>
            </div>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="flex items-center gap-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-2xl">🍅</div>
            <div>
              <p className="text-sm text-muted-foreground">Фокус · {stats.pomodoros} помодоро</p>
              <p className="text-xl font-semibold">{formatDuration(stats.focusMinTotal)}</p>
            </div>
          </Card>
        </StaggerItem>
      </StaggerList>

      {/* Daily quests — the short loop next to lifetime achievements. Rotate every day. */}
      <h2 className="mb-3 mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Swords className="h-4 w-4" /> Квесты дня
        <span className="font-normal text-muted-foreground/60">· обновляются каждый день</span>
      </h2>
      <StaggerList className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {todayQuests.map((q) => {
          const progress = Math.min(q.progress(data, today), q.target);
          const done = progress >= q.target;
          return (
            <StaggerItem key={q.id}>
              <Card className={cn("flex h-full flex-col gap-2 p-4 transition-colors", done && "border-success/40 bg-success/5")}>
                <div className="flex items-center gap-2">
                  <span className={cn("text-lg", !done && "opacity-50 grayscale")}>{q.icon}</span>
                  <span className={cn("flex-1 text-sm font-medium", done && "text-success")}>{q.title}</span>
                  <span className={cn("shrink-0 text-xs font-semibold", done ? "text-success" : "text-muted-foreground")}>
                    +{q.xp} XP
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full rounded-full transition-all", done ? "bg-success" : "bg-brand")}
                    style={{ width: `${(progress / q.target) * 100}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {done ? "Выполнен" : `${progress}/${q.target}`}
                </span>
              </Card>
            </StaggerItem>
          );
        })}
      </StaggerList>

      {/* Seasonal challenge — a month-long goal that scales with the month's length. */}
      <Card className="mt-4 flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{season.icon}</span>
          <span className="flex-1 text-sm font-medium">{season.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {season.done}/{season.target} задач
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn("h-full rounded-full transition-all", season.done >= season.target ? "bg-success" : "bg-brand")}
            style={{ width: `${Math.min(100, (season.done / season.target) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {season.done >= season.target
            ? "Марафон месяца пройден — красиво 🎉"
            : `До цели месяца: ${season.target - season.done}`}
        </span>
      </Card>

      {/* Personal records — all derived live from tasks / pomodoroSessions / completionLog */}
      <h2 className="mb-3 mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Trophy className="h-4 w-4" /> Рекорды
      </h2>
      <StaggerList className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { icon: Flame, label: "Лучший стрик", value: `${gamification.bestStreak} дн.`, cls: "bg-amber-500/15 text-amber-400" },
          { icon: Zap, label: "Задач за день", value: `${stats.maxTasksInDay}`, cls: "bg-emerald-500/15 text-emerald-400" },
          { icon: Timer, label: "Фокус за день", value: formatDuration(stats.maxFocusMinInDay), cls: "bg-cyan-500/15 text-cyan-400" },
          { icon: Repeat, label: "Помидоров за день", value: `${stats.maxPomodorosInDay}`, cls: "bg-rose-500/15 text-rose-400" },
          { icon: Gauge, label: "Длинная сессия", value: formatDuration(stats.longestFocusSession), cls: "bg-violet-500/15 text-violet-400" },
        ].map((r) => (
          <StaggerItem key={r.label}>
            <Card className="flex h-full flex-col items-start gap-2 p-4">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", r.cls)}>
                <r.icon className="h-5 w-5" />
              </div>
              <p className="text-lg font-semibold leading-none">{r.value}</p>
              <p className="text-xs text-muted-foreground">{r.label}</p>
            </Card>
          </StaggerItem>
        ))}
      </StaggerList>

      {/* Activity heatmap */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Активность · 10 недель</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ContributionGrid log={data.completionLog} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            меньше
            <span className="h-3 w-3 rounded-[3px] bg-secondary" />
            <span className="h-3 w-3 rounded-[3px] bg-success/30" />
            <span className="h-3 w-3 rounded-[3px] bg-success/60" />
            <span className="h-3 w-3 rounded-[3px] bg-success" />
            больше
          </div>
        </CardContent>
      </Card>

      {/* Achievements grid */}
      <h2 className="mb-3 mt-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Star className="h-4 w-4" /> Все достижения
      </h2>
      <StaggerList className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = gamification.achievements.includes(a.id);
          return (
            <StaggerItem key={a.id}>
              <motion.div whileHover={{ y: -2 }} transition={spring}>
                <Card className={cn("h-full", !unlocked && "opacity-60")}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl",
                        unlocked ? "bg-success/15" : "bg-secondary grayscale"
                      )}
                    >
                      {a.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.desc}</p>
                    </div>
                    {unlocked && <span className="ml-auto text-xs text-success">✓</span>}
                  </CardContent>
                </Card>
              </motion.div>
            </StaggerItem>
          );
        })}
      </StaggerList>
    </AppShell>
  );
}
