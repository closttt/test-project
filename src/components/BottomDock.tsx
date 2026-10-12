import { Plus, Search } from "lucide-react";

import { C } from "@/design-lab/screens/_kit/craft";
import { useUI } from "@/store/UIProvider";

/**
 * Persistent bottom-center dock — just search and «+ задача», in the Craft Dark style.
 * The Pomodoro controls and their settings were removed by the owner (2026-10-12); focus work
 * lives in the full-screen «Фокус» mode (/focus).
 */
export function BottomDock() {
  const { setCommandOpen, setQuickAddOpen } = useUI();

  const btn =
    "grid h-11 w-11 place-items-center rounded-full transition-colors duration-150 hover:bg-[#19191C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/60";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center">
      <div
        data-ui="dock"
        className="pointer-events-auto flex items-center gap-1 rounded-full p-1.5"
        style={{ background: C.panel, boxShadow: `inset 0 0 0 1px ${C.line}, 0 16px 40px rgba(0,0,0,0.6)` }}
      >
        <button type="button" className={btn} style={{ color: C.text2 }} onClick={() => setCommandOpen(true)} title="Поиск (/)" aria-label="Поиск и команды">
          <Search size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full transition-[filter] duration-150 hover:brightness-110"
          style={{ background: C.accent, color: "#fff" }}
          onClick={() => setQuickAddOpen(true)}
          title="Новая задача (N)"
          aria-label="Новая задача"
        >
          <Plus size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
