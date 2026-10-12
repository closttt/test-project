import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { undoLast } from "@/lib/undoStack";

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

/** Global single-key shortcuts + "G then letter" navigation (Linear-style). */
export function useGlobalShortcuts() {
  const { setQuickAddOpen, setCommandOpen, setQuickNoteOpen, setAssistantOpen } = useUI();
  const { toast } = useToast();
  const navigate = useNavigate();
  const gPressed = useRef(false);

  useEffect(() => {
    const GO: Record<string, string> = {
      d: "/", k: "/clients", p: "/projects", t: "/tasks", n: "/notes",
      a: "/achievements", s: "/settings",
      y: "/analytics", r: "/archive", b: "/knowledge",
    };
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Z — global undo, wins over the per-modifier bail-out below.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
        e.preventDefault();
        const label = undoLast();
        if (label) toast(`Отменено: ${label}`);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (gPressed.current && GO[e.key]) {
        e.preventDefault();
        gPressed.current = false;
        navigate(GO[e.key]);
        return;
      }
      gPressed.current = false;
      if (e.key === "g") {
        gPressed.current = true;
        setTimeout(() => { gPressed.current = false; }, 1200);
      } else if (e.key === "n") {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (e.key === "q") {
        e.preventDefault();
        setQuickNoteOpen(true);
      } else if (e.key === "a") {
        e.preventDefault();
        setAssistantOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setQuickAddOpen, setCommandOpen, setQuickNoteOpen, setAssistantOpen, navigate, toast]);
}
