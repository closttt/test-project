/**
 * «Индекс» · global hotkeys. Parity with src/components/layout/AppLayout.tsx (+ the ⌘K listener of
 * CommandPalette and the «?» listener of ShortcutsDialog):
 *   ⌘/Ctrl+K palette (toggle, works even inside a field — same as the real one)
 *   ⌘/Ctrl+Z undo the last destructive action via lib/undoStack, with a toast
 *   N quick add · Q quick note · A assistant · / palette · ? shortcuts
 *   G then a letter → section (table in ./routes; adds W planner, B knowledge, R archive, F focus;
 *   the real app's G→M /mail is gone because /mail no longer exists)
 * Single keys never fire while typing, with a modifier, or when a page already handled the key
 * (e.g. N and / on the Tasks screen focus its own add bar / search first). Keys are matched by
 * physical code, so they also work on the Russian layout. Silent on /focus — the real app mounts
 * these inside AppLayout, which the full-screen focus mode is outside of.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { undoLast } from "@/lib/undoStack";
import { GO_BY_CODE } from "./routes";
import { isTyping, openShortcuts } from "./ui";

export function Hotkeys() {
  const { commandOpen, setCommandOpen, setQuickAddOpen, setQuickNoteOpen, setAssistantOpen } = useUI();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const gPressed = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout>>();
  const cmd = useRef(commandOpen);
  cmd.current = commandOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // ⌘/Ctrl+K — palette toggle, even from a field.
      if (mod && !e.altKey && !e.shiftKey && e.code === "KeyK") {
        e.preventDefault();
        setCommandOpen(!cmd.current);
        return;
      }
      if (pathname === "/focus") return;
      // ⌘/Ctrl+Z — global undo; outside fields so native text undo keeps working.
      if (mod && !e.shiftKey && !e.altKey && e.code === "KeyZ" && !isTyping(e.target)) {
        e.preventDefault();
        const label = undoLast();
        if (label) toast(`Отменено: ${label}`);
        return;
      }
      if (mod || e.altKey || isTyping(e.target) || e.defaultPrevented || e.repeat) return;

      if (gPressed.current && GO_BY_CODE[e.code]) {
        e.preventDefault();
        gPressed.current = false;
        navigate(GO_BY_CODE[e.code]);
        return;
      }
      gPressed.current = false;
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        openShortcuts();
      } else if (e.key === "/" || e.code === "Slash") {
        e.preventDefault();
        setCommandOpen(true);
      } else if (e.code === "KeyG") {
        gPressed.current = true;
        clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => (gPressed.current = false), 1200);
      } else if (e.code === "KeyN") {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (e.code === "KeyQ") {
        e.preventDefault();
        setQuickNoteOpen(true);
      } else if (e.code === "KeyA") {
        e.preventDefault();
        setAssistantOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pathname, navigate, toast, setCommandOpen, setQuickAddOpen, setQuickNoteOpen, setAssistantOpen]);

  return null;
}
