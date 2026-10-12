/**
 * «Индекс» · pomodoro menus — shared by the dock, the session plate and the Focus page.
 *  · PomodoroSettingsButton — the quick-settings trigger (same fields as Settings: presets,
 *    four durations, autostart), parity with components/PomodoroSettingsMenu.tsx.
 *  · PomodoroStartBody — «запустить на задачу» picker (Без задачи + up to 30 open tasks),
 *    parity with the dock's DropdownMenu in components/BottomDock.tsx.
 */
import { type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";

import { useData } from "@/store/DataProvider";
import { usePomodoro, formatClock } from "@/store/PomodoroProvider";
import { B, T, tab } from "@/design-lab/screens/_kit/index";
import { FloatMenu, MenuItem, MenuLabel, MenuSep, useFloat, Switch, Seg, NumField } from "@/design-lab/screens/_kit/index-ui";
import type { PomodoroSettings } from "@/types";

type NumKey = "workMin" | "shortBreakMin" | "longBreakMin" | "roundsBeforeLong";

const FIELDS: { key: NumKey; label: string; unit?: string }[] = [
  { key: "workMin", label: "Фокус", unit: "мин" },
  { key: "shortBreakMin", label: "Перерыв", unit: "мин" },
  { key: "longBreakMin", label: "Большой перерыв", unit: "мин" },
  { key: "roundsBeforeLong", label: "Раундов до большого" },
];

const PRESETS: { id: string; label: string; values: Pick<PomodoroSettings, NumKey> }[] = [
  { id: "25", label: "25 / 5", values: { workMin: 25, shortBreakMin: 5, longBreakMin: 15, roundsBeforeLong: 4 } },
  { id: "50", label: "50 / 10", values: { workMin: 50, shortBreakMin: 10, longBreakMin: 30, roundsBeforeLong: 3 } },
];

/** The settings body (presets · durations · autostart). Lives inside a FloatMenu. */
export function PomodoroSettingsBody() {
  const { settings, updateSettings } = useData();
  const p = settings.pomodoro;
  const set = (patch: Partial<PomodoroSettings>) => updateSettings({ pomodoro: { ...p, ...patch } });
  const preset = PRESETS.find((x) => (Object.keys(x.values) as NumKey[]).every((k) => x.values[k] === p[k]))?.id ?? "";

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between pb-2 pt-3">
        <span style={{ ...T.caps, color: B.off }}>Помодоро</span>
        <Seg
          label="Пресет помодоро"
          value={preset}
          onChange={(id) => {
            const hit = PRESETS.find((x) => x.id === id);
            if (hit) set(hit.values);
          }}
          options={PRESETS.map((x) => ({ value: x.id, label: x.label }))}
        />
      </div>
      <div style={{ borderTop: `1px solid ${B.l10}` }}>
        {FIELDS.map((f) => (
          <div key={f.key} className="flex h-11 items-center justify-between gap-3" style={{ borderBottom: `1px solid ${B.l7}` }}>
            <span style={{ ...T.body, color: B.text2 }}>{f.label}</span>
            <NumField label={f.label} value={p[f.key]} min={1} unit={f.unit} width={56} onChange={(v) => set({ [f.key]: v } as Partial<PomodoroSettings>)} />
          </div>
        ))}
      </div>
      <div className="flex h-12 items-center justify-between gap-3">
        <span style={{ ...T.body, color: B.text2 }}>Автостарт следующей фазы</span>
        <Switch label="Автостарт помодоро" on={p.autostart} onChange={(v) => set({ autostart: v })} />
      </div>
    </div>
  );
}

/** Square icon trigger that opens the settings menu above/below itself. */
export function PomodoroSettingsButton({ size = 56, style, className = "" }: { size?: number; style?: CSSProperties; className?: string }) {
  const fl = useFloat();
  return (
    <>
      <button
        type="button"
        data-float-trigger
        onClick={(e) => fl.toggle(e.currentTarget, "right")}
        title="Настройки помодоро"
        aria-label="Настройки помодоро"
        aria-expanded={!!fl.at}
        className={`flex shrink-0 items-center justify-center outline-none transition-colors duration-150 hover:bg-[#101010] hover:!text-white focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#ADFB0C] ${className}`}
        style={{ width: size, height: size, color: fl.at ? B.text : B.text3, ...style }}
      >
        <SlidersHorizontal size={14} strokeWidth={1.25} />
      </button>
      {/* Portalled: the trigger can sit inside a transformed / pointer-events-none plate. */}
      {fl.at &&
        createPortal(
          <FloatMenu at={fl.at} onClose={fl.close} width={312}>
            <PomodoroSettingsBody />
          </FloatMenu>,
          document.body
        )}
    </>
  );
}

/** «Запустить помодоро» — without a task or on one of the open tasks. */
export function PomodoroStartBody() {
  const { allTasks, settings } = useData();
  const { start } = usePomodoro();
  const openTasks = allTasks.filter((t) => !t.done && !t.archivedAt).slice(0, 30);
  return (
    <>
      <MenuLabel>Запустить помодоро · {formatClock(settings.pomodoro.workMin * 60)}</MenuLabel>
      <MenuItem onSelect={() => start()} hint="без задачи">
        <span style={{ color: B.text }}>Просто фокус</span>
      </MenuItem>
      {openTasks.length > 0 && <MenuSep />}
      {openTasks.map((t, i) => (
        <MenuItem key={t.id} onSelect={() => start(t.id)}>
          <span className="w-5 shrink-0" style={{ ...T.num, color: B.off, ...tab }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="truncate">{t.title}</span>
        </MenuItem>
      ))}
    </>
  );
}
