import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Map, Plus, X, RotateCcw } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { CHANGELOG, markSeen } from "@/lib/changelog";
import { formatDate } from "@/lib/format";
import {
  loadPlanned,
  savePlanned,
  resetPlanned,
  TAG_META,
  TAG_ORDER,
  type PlannedItem,
} from "@/lib/roadmap";
import { uid } from "@/lib/id";
import { cn } from "@/lib/utils";

/** "Story" — product changelog + editable "what's planned" backlog. */
export default function Changelog() {
  useEffect(() => {
    markSeen();
  }, []);

  const [planned, setPlanned] = useState<PlannedItem[]>(() => loadPlanned());
  const [draft, setDraft] = useState("");
  useEffect(() => savePlanned(planned), [planned]);

  function remove(id: string) {
    setPlanned((p) => p.filter((x) => x.id !== id));
  }
  function add() {
    const t = draft.trim();
    if (!t) return;
    setPlanned((p) => [{ id: uid(), title: t, tag: "локально", done: false }, ...p]);
    setDraft("");
  }

  return (
    <AppShell title="Story" description="Хроника обновлений и что планируется">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {/* Planned / roadmap — editable task list */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Map className="h-4 w-4" /> Планируется · {planned.length}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              onClick={() => setPlanned(resetPlanned())}
              title="Вернуть план по умолчанию"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Сброс
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Черновик планов поверх роадмапа. Сделанное убирается автоматически; удаляйте ненужное и добавляйте своё — всё хранится локально.
            </p>

            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Добавить пункт в план…"
                className="h-9"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={add} disabled={!draft.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {TAG_ORDER.map((tag) => {
              const items = planned.filter((p) => p.tag === tag);
              if (items.length === 0) return null;
              return (
                <div key={tag} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-medium", TAG_META[tag].className)}>
                      {TAG_META[tag].label}
                    </span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-secondary/40"
                      >
                        <span className="mt-px h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />
                        <span className="flex-1 text-sm">{item.title}</span>
                        <button
                          onClick={() => remove(item.id)}
                          className="shrink-0 rounded p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-risk group-hover:opacity-100 focus-visible:opacity-100"
                          title="Удалить пункт"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              );
            })}
            {planned.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Список планов пуст. Добавьте пункт или нажмите «Сброс».</p>
            )}
          </CardContent>
        </Card>

        {/* Released — changelog timeline */}
        <StaggerList className="flex flex-col gap-4">
          {CHANGELOG.map((r, i) => (
            <StaggerItem key={r.version}>
              <Card>
                <CardContent className="flex gap-4 p-5">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${i === 0 ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
                      {i === 0 ? <Sparkles className="h-4 w-4" /> : r.version}
                    </span>
                    {i < CHANGELOG.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">v{r.version} · {r.title}</span>
                      {i === 0 && <Badge variant="success">новое</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(r.date)}</span>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {r.items.map((it, j) => (
                        <li key={j} className="flex gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerList>
      </div>
    </AppShell>
  );
}
