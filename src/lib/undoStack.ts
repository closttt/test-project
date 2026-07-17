/**
 * Global undo stack. Every destructive action pushes a one-shot restore entry;
 * Ctrl+Z pops and runs the most recent one. Toasts that already offer a "Вернуть"
 * button call the SAME wrapped function, so whichever fires first (click or Ctrl+Z)
 * consumes the entry and the other becomes a no-op — no double-restore.
 */

interface UndoEntry {
  label: string;
  run: () => void;
}

let stack: UndoEntry[] = [];
const MAX = 50;

/** Register a restorable action; returns a wrapped, idempotent runner to hand to a toast's onAction. */
export function pushUndo(label: string, action: () => void): () => void {
  let done = false;
  const entry: UndoEntry = { label, run: () => {} };
  entry.run = () => {
    if (done) return;
    done = true;
    action();
    stack = stack.filter((e) => e !== entry);
  };
  stack.push(entry);
  if (stack.length > MAX) stack.shift();
  return entry.run;
}

/** Run the most recent still-pending undo entry (Ctrl+Z). Returns its label, or null if the stack is empty. */
export function undoLast(): string | null {
  const entry = stack[stack.length - 1];
  if (!entry) return null;
  entry.run();
  return entry.label;
}

/** Drop every pending entry — call before any wholesale data replacement (JSON import/restore),
 * so a stale toast/Ctrl+Z can't resurrect an object from the dataset that was just replaced. */
export function clearUndo(): void {
  stack = [];
}
