import { useState } from "react";
import { Sunrise, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedCheckbox } from "@/components/ui/animated-checkbox";
import { IconAction } from "@/components/ui/icon-action";
import { useData } from "@/store/DataProvider";
import { isOverdue, todayStr, addDays } from "@/lib/format";
import { isDismissedFor, loadRolloverDismissedDate, dismissRolloverToday } from "@/lib/rollover";
import type { Task } from "@/types";

/**
 * A once-a-day review of yesterday's carried-over tasks — replaces an ever-growing red overdue
 * count with a deliberate "keep / move / drop" decision, taken once, calmly (Sunsama-style rollover).
 * Dismissing hides it until tomorrow; deciding on every task also clears it naturally.
 */
export function OverdueRollover({ tasks }: { tasks: Task[] }) {
  const { updateTask, toggleTask } = useData();
  const today = todayStr();
  const [dismissed, setDismissed] = useState(() => isDismissedFor(loadRolloverDismissedDate(), today));

  const overdue = tasks.filter((t) => !t.done && isOverdue(t.dueDate));
  if (dismissed || overdue.length === 0) return null;

  function dismiss() {
    dismissRolloverToday(today);
    setDismissed(true);
  }

  return (
    <Card className="mb-4 border-brand/30 bg-brand/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sunrise className="h-4 w-4 text-brand" /> Осталось незакрытым · {overdue.length}
        </CardTitle>
        <IconAction icon={X} label="Скрыть до завтра" onClick={dismiss} className="h-6 w-6 p-0" />
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <p className="mb-1 text-xs text-muted-foreground">
          Решите по каждой: оставить на сегодня, перенести на завтра или снять срок.
        </p>
        {overdue.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-secondary/40">
            <AnimatedCheckbox checked={t.done} onChange={() => toggleTask(t.id)} size="sm" label={t.title} priority={t.priority} />
            <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
            <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => updateTask(t.id, { dueDate: today })}>
              Сегодня
            </Button>
            <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => updateTask(t.id, { dueDate: addDays(new Date(), 1) })}>
              Завтра
            </Button>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs text-muted-foreground" onClick={() => updateTask(t.id, { dueDate: undefined })}>
              Без срока
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
