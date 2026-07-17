import { useMemo, useState } from "react";
import { CheckCircle2, Timer, Gauge, Target, TrendingUp, CalendarRange, FolderKanban } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AreaChart } from "@/components/charts/AreaChart";
import { BarChart } from "@/components/charts/BarChart";
import { DonutGauge } from "@/components/charts/DonutGauge";
import { HBarList } from "@/components/charts/HBarList";
import { ContributionGrid } from "@/components/ContributionGrid";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { PriorityFlag } from "@/components/PriorityFlag";
import { TaskEditDialog } from "@/components/TaskEditDialog";
import { useData } from "@/store/DataProvider";
import { computeAnalytics, peakWeekday, type RangeDays } from "@/lib/analytics";
import { formatDuration, dueLabel, isOverdue, formatDate } from "@/lib/format";
import { levelProgress } from "@/lib/gamification";
import { levelTitle, type AppData, type Task } from "@/types";
import { cn } from "@/lib/utils";

const RANGES: RangeDays[] = [7, 30, 90];

function Kpi({ icon: Icon, label, value, sub, accent, onClick }: {
  icon: typeof Timer; label: string; value: React.ReactNode; sub?: string; accent?: string; onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn("flex flex-col justify-center p-4", onClick && "cursor-pointer transition-colors hover:border-muted-foreground/30")}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", accent ?? "bg-secondary text-muted-foreground")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function ChartCard({ title, icon: Icon, children, className, onClick }: {
  title: string; icon: typeof Timer; children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  return (
    <Card onClick={onClick} className={cn("flex flex-col", onClick && "cursor-pointer transition-colors hover:border-muted-foreground/30", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">{children}</CardContent>
    </Card>
  );
}

export default function Analytics() {
  const ctx = useData();
  const { toggleTask } = ctx;
  const [range, setRange] = useState<RangeDays>(30);
  const [closedPopup, setClosedPopup] = useState(false);
  const [openPopup, setOpenPopup] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const r = useMemo(
    () => computeAnalytics({ ...ctx, tasks: ctx.allTasks, projects: ctx.allProjects } as AppData, range),
    [ctx, range]
  );

  const rangeCutoff = (() => { const d = new Date(); d.setDate(d.getDate() - range); return d.toISOString(); })();
  const closedInRange = ctx.allTasks
    .filter((t) => t.done && t.completedAt && t.completedAt >= rangeCutoff)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  // Multi-range glance, independent of the range toggle above — same "closed tasks" KPI shape as
  // the dashboard, shown for all three windows at once instead of one at a time.
  const closedByRange = RANGES.map((d) => {
    const cutoff = (() => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); })();
    return { days: d, count: ctx.allTasks.filter((t) => t.done && t.completedAt && t.completedAt >= cutoff).length };
  });
  const openTasks = ctx.allTasks
    .filter((t) => !t.done && !t.archivedAt)
    .sort((a, b) => (a.dueDate ?? "￿").localeCompare(b.dueDate ?? "￿"));

  const lvl = levelProgress(ctx.gamification.xp);
  const peak = peakWeekday(r);
  const weekdayBars = r.byWeekday.map((w) => ({
    ...w,
    highlight: peak !== null && w.label === peak && w.value > 0,
  }));

  return (
    <AppShell
      title="Аналитика"
      description="Фокус, продуктивность и опыт — из локальных данных"
      actions={
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                range === d ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d} дн.
            </button>
          ))}
        </div>
      }
    >
      <StaggerList className="flex flex-col gap-4">
        {/* KPI row */}
        <StaggerItem>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi icon={CheckCircle2} accent="bg-success/15 text-success" label={`Закрыто за ${range} дн.`} value={r.totalClosed} sub={`${r.activeDays} активных дней`} onClick={() => setClosedPopup(true)} />
            <Kpi icon={Timer} accent="bg-brand/15 text-brand" label={`Фокус за ${range} дн.`} value={formatDuration(r.totalFocusMin)} sub={`всего трекнуто ${formatDuration(r.lifetimeTrackedMin)}`} />
            <Kpi icon={Gauge} label="Средний фокус / день" value={formatDuration(r.avgFocusMin)} sub={peak ? `пик — ${peak}` : undefined} />
            <Kpi icon={Target} accent="bg-success/15 text-success" label="Уровень" value={`${lvl.level} · ${levelTitle(lvl.level)}`} sub={`${lvl.toNext} XP до след.`} />
          </div>
        </StaggerItem>

        {/* Closed tasks, all three windows at a glance */}
        <StaggerItem>
          <div className="grid grid-cols-3 gap-4">
            {closedByRange.map(({ days, count }) => (
              <Kpi
                key={days}
                icon={CheckCircle2}
                accent="bg-success/15 text-success"
                label={`Закрыто за ${days} дн.`}
                value={count}
                onClick={() => setRange(days)}
              />
            ))}
          </div>
        </StaggerItem>

        {/* Trends */}
        <StaggerItem>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={`Закрытия задач · ${range} дн.`} icon={TrendingUp}>
              <AreaChart data={r.completionsSeries} height={160} className="w-full" formatValue={(v) => `${v} задач`} />
            </ChartCard>
            <ChartCard title={`Фокус по дням · ${range} дн.`} icon={Timer}>
              <AreaChart data={r.focusSeries} height={160} className="w-full" formatValue={formatDuration} />
            </ChartCard>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Фокус по дню недели" icon={CalendarRange}>
              <BarChart data={weekdayBars} height={160} className="w-full" formatValue={formatDuration} />
            </ChartCard>

            <ChartCard title="Открытые по приоритету" icon={Target} onClick={r.priorityOpen.length > 0 ? () => setOpenPopup(true) : undefined}>
              {r.priorityOpen.length === 0 ? (
                <p className="text-sm text-muted-foreground">Открытых задач нет 🎉</p>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <DonutGauge
                    size={140}
                    segments={r.priorityOpen}
                    centerTop={String(r.priorityOpen.reduce((s, x) => s + x.value, 0))}
                    centerBottom="открыто"
                  />
                  <div className="flex w-full flex-col gap-1.5 text-sm">
                    {r.priorityOpen.map((s) => (
                      <div key={s.label} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        <span className="flex-1 text-muted-foreground">{s.label}</span>
                        <span className="tabular-nums">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Точность оценок" icon={Gauge}>
              {r.estimateAccuracy === null ? (
                <p className="text-sm text-muted-foreground">
                  Пока нет закрытых задач с оценкой и трекингом. Ставь оценку и запускай таймер — покажу точность.
                </p>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <DonutGauge
                    size={140}
                    thickness={14}
                    segments={[
                      { label: "Точность", value: r.estimateAccuracy, color: "hsl(var(--success))" },
                      { label: "Остаток", value: 100 - r.estimateAccuracy, color: "hsl(var(--secondary))" },
                    ]}
                    centerTop={`${r.estimateAccuracy}%`}
                    centerBottom="в среднем"
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Насколько факт совпал с оценкой по закрытым задачам.
                  </p>
                </div>
              )}
            </ChartCard>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Топ проектов по фокусу" icon={FolderKanban}>
              {r.topProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пока нет помодоро-сессий по проектам.</p>
              ) : (
                <HBarList data={r.topProjects} />
              )}
            </ChartCard>
            <ChartCard title="Карта фокуса" icon={Timer}>
              <div className="flex flex-col gap-3">
                <ContributionGrid log={r.focusCountByDate} weeks={Math.min(14, Math.ceil(range / 7))} />
                <p className="text-xs text-muted-foreground">Каждая клетка — день, насыщенность = число помодоро.</p>
              </div>
            </ChartCard>
          </div>
        </StaggerItem>
      </StaggerList>

      <Dialog open={closedPopup} onOpenChange={setClosedPopup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Закрыто за {range} дн. · {closedInRange.length}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {closedInRange.length === 0 && <p className="text-sm text-muted-foreground">За этот период ничего не закрыто.</p>}
            {closedInRange.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-secondary/40">
                <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} size="sm" label={t.title} />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through hover:underline" onClick={() => setEditingTask(t)}>{t.title}</span>
                <PriorityFlag p={t.priority} />
                <span className="shrink-0 text-xs text-muted-foreground">{t.completedAt ? formatDate(t.completedAt) : ""}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openPopup} onOpenChange={setOpenPopup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Открытые задачи · {openTasks.length}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {openTasks.length === 0 && <p className="text-sm text-muted-foreground">Открытых задач нет.</p>}
            {openTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-secondary/40">
                <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} size="sm" label={t.title} />
                <span className="min-w-0 flex-1 truncate text-sm hover:underline" onClick={() => setEditingTask(t)}>{t.title}</span>
                <PriorityFlag p={t.priority} />
                <span className={cn("shrink-0 text-xs", isOverdue(t.dueDate) ? "font-medium text-risk" : "text-muted-foreground")}>
                  {t.dueDate ? dueLabel(t.dueDate) : "без срока"}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <TaskEditDialog task={editingTask} open={!!editingTask} onOpenChange={(v) => !v && setEditingTask(null)} />
    </AppShell>
  );
}
