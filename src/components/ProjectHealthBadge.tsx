import { HEALTH_META, type HealthLevel } from "@/lib/projectHealth";
import { cn } from "@/lib/utils";

/** Small dot + label health signal for a project. Renders nothing when the project has no tasks. */
export function ProjectHealthBadge({ level, className }: { level: HealthLevel; className?: string }) {
  if (level === "empty") return null;
  const m = HEALTH_META[level];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", m.text, className)}
      title="Состояние по срокам задач (отдельно от приоритета)"
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
