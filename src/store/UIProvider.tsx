import { createContext, useContext, useState, type ReactNode } from "react";

interface UIContextValue {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  quickAddOpen: boolean;
  setQuickAddOpen: (v: boolean) => void;
  quickNoteOpen: boolean;
  setQuickNoteOpen: (v: boolean) => void;
  /** The live-LLM AI Assistant drawer. */
  assistantOpen: boolean;
  setAssistantOpen: (v: boolean) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  return (
    <UIContext.Provider
      value={{
        commandOpen, setCommandOpen,
        quickAddOpen, setQuickAddOpen,
        quickNoteOpen, setQuickNoteOpen,
        assistantOpen, setAssistantOpen,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
