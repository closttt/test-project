import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ServiceMeta, ServiceState } from "@/lib/services";
import { ServiceLogo } from "@/components/services/ServiceLogo";

/**
 * One tile in the «Подключённые инструменты» rail. Clicking it switches the hub's active tool —
 * it never navigates away, which is the whole point of the hub.
 */
export function ServiceTile({
  service, state, active, onClick,
}: {
  service: ServiceMeta;
  state?: ServiceState;
  active: boolean;
  onClick: () => void;
}) {
  const connected = !!state?.connected;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={service.label}
      className={cn(
        "group relative flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors",
        active ? "border-brand bg-brand/5" : "border-border bg-secondary/20 hover:bg-secondary/40"
      )}
    >
      <ServiceLogo id={service.id} tint={service.tint} className={cn("h-9 w-9", !connected && "opacity-50 grayscale")} />
      <span className="w-full truncate text-center text-[0.7rem] leading-tight">{service.label}</span>
      <span
        className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-success" : "bg-muted-foreground/30")}
        title={connected ? "Подключено" : "Не подключено"}
      />
    </button>
  );
}

/** The «+ Добавить» tile — opens the shelf of tools that aren't wired up yet. */
export function AddServiceTile({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-3 transition-colors",
        active ? "border-brand bg-brand/5" : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/60">
        <Plus className="h-4 w-4" />
      </span>
      <span className="text-[0.7rem] leading-tight">Добавить</span>
      <span className="h-1.5 w-1.5" />
    </button>
  );
}
