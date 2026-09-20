import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";

import { cn } from "@/lib/utils";
import { dndAnnouncements, DND_INSTRUCTIONS } from "@/lib/dndA11y";

/**
 * Drag-and-drop for vertical task lists (the «По проектам» list on /tasks and the sectioned list
 * inside a project). Every row is both a drag source and a drop target, so "drop onto a row" means
 * "place me just before this row" — the same semantics the HTML5 version had, minus its blind spots:
 * this works on touch (long-press), shows a drop indicator on the row under the pointer, and the
 * lifted row follows the finger in an overlay.
 *
 * The context is data-agnostic: rows and zones register `{ type, ...anything }` data, and a drop is
 * reported as `onDrop(active, over)` with both payloads for the page to interpret.
 */

export interface DragPayload {
  type: string;
  [key: string]: unknown;
}

interface ContextProps {
  onDrop: (active: DragPayload & { id: string }, over: DragPayload & { id: string }) => void;
  /** What the lifted row looks like while in flight. */
  renderOverlay: (active: DragPayload & { id: string }) => ReactNode;
  /** Human name for a row/zone id — read out by screen readers while dragging. */
  labelOf: (id: string) => string;
  children: ReactNode;
}

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length > 0) {
    // A row beats the zone that contains it, so dropping on a row is precise.
    const row = within.find((c) => c.data?.droppableContainer?.data.current?.role === "row");
    return row ? [row] : within;
  }
  return rectIntersection(args);
};

export function DragRowsContext({ onDrop, renderOverlay, labelOf, children }: ContextProps) {
  const a11y = useMemo(() => ({ announcements: dndAnnouncements(labelOf), screenReaderInstructions: DND_INSTRUCTIONS }), [labelOf]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } })
  );
  const [active, setActive] = useState<(DragPayload & { id: string }) | null>(null);

  function onDragEnd(e: DragEndEvent) {
    const a = active;
    setActive(null);
    if (!a || !e.over || String(e.over.id) === a.id) return;
    const overData = (e.over.data.current ?? {}) as DragPayload;
    onDrop(a, { ...overData, id: String(e.over.id) });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={a11y}
      onDragStart={(e) => setActive({ ...((e.active.data.current ?? { type: "row" }) as DragPayload), id: String(e.active.id) })}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {active ? <div className="rounded-lg shadow-xl ring-1 ring-brand/30">{renderOverlay(active)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

/** A row that can be lifted and dropped onto. Shows a brand-coloured line on top while a drag hovers it. */
export function DragRow({ id, data, disabled, className, children }: { id: string; data: DragPayload; disabled?: boolean; className?: string; children: ReactNode }) {
  const drag = useDraggable({ id, data, disabled });
  const drop = useDroppable({ id, data: { ...data, role: "row" } });
  return (
    <div
      ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el); }}
      {...drag.listeners}
      className={cn(
        "relative touch-manipulation",
        !disabled && "cursor-grab active:cursor-grabbing",
        drag.isDragging && "opacity-30",
        drop.isOver && !drag.isDragging && "before:absolute before:-top-1 before:left-0 before:right-0 before:z-10 before:h-0.5 before:rounded before:bg-brand",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A drop-only area (a section, a group) — highlights while a drag hovers it. */
export function DropZone({ id, data, className, activeClassName, children }: { id: string; data: DragPayload; className?: string; activeClassName?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { ...data, role: "zone" } });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && (activeClassName ?? "bg-brand/5 ring-1 ring-inset ring-brand/40"))}>
      {children}
    </div>
  );
}

/** A drag-only handle (e.g. a section header that reorders sections). */
export function DragHandle({ id, data, className, children }: { id: string; data: DragPayload; className?: string; children: ReactNode }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, data });
  return (
    <div ref={setNodeRef} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-40", className)}>
      {children}
    </div>
  );
}
