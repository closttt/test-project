import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useData } from "@/store/DataProvider";
import { cn } from "@/lib/utils";

const FIELDS: [keyof ReturnType<typeof useData>["settings"]["pomodoro"], string][] = [
  ["workMin", "Фокус, мин"],
  ["shortBreakMin", "Перерыв, мин"],
  ["longBreakMin", "Большой, мин"],
  ["roundsBeforeLong", "Раундов"],
];

const PRESETS: { label: string; values: { workMin: number; shortBreakMin: number; longBreakMin: number; roundsBeforeLong: number } }[] = [
  { label: "25 / 5", values: { workMin: 25, shortBreakMin: 5, longBreakMin: 15, roundsBeforeLong: 4 } },
  { label: "50 / 10", values: { workMin: 50, shortBreakMin: 10, longBreakMin: 30, roundsBeforeLong: 3 } },
];

/** Quick pomodoro settings — same fields as Settings, editable inline from the dock or the session bar. */
export function PomodoroSettingsMenu({ className }: { className?: string }) {
  const { settings, updateSettings } = useData();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-10 w-10 rounded-full", className)}
          title="Настройки помодоро"
          aria-label="Настройки помодоро"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" className="w-64 p-3">
        <div className="mb-3 flex items-center gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => updateSettings({ pomodoro: { ...settings.pomodoro, ...preset.values } })}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(([key, label]) => (
            <div key={key} className="grid gap-1">
              <Label htmlFor={`pomo-quick-${key}`} className="text-xs">{label}</Label>
              <Input
                id={`pomo-quick-${key}`}
                type="number"
                min={1}
                className="h-8"
                value={settings.pomodoro[key] as number}
                onChange={(e) =>
                  updateSettings({
                    pomodoro: { ...settings.pomodoro, [key]: Math.max(1, Number(e.target.value) || 1) },
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Автостарт следующей фазы</p>
          <Switch
            checked={settings.pomodoro.autostart}
            onCheckedChange={(v) => updateSettings({ pomodoro: { ...settings.pomodoro, autostart: v } })}
            aria-label="Автостарт помодоро"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
