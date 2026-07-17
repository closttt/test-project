import type { ReactNode } from "react";
import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { ChangelogButton } from "@/components/ChangelogButton";
import { useUI } from "@/store/UIProvider";

/** Per-page header + animated main. Rendered inside the persistent AppLayout. */
export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { setAssistantOpen } = useUI();
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-4 backdrop-blur md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="truncate text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button
            variant="outline"
            size="icon"
            className="text-brand"
            onClick={() => setAssistantOpen(true)}
            title="AI-ассистент (a)"
            aria-label="Открыть AI-ассистента"
          >
            <Bot className="h-4 w-4" />
          </Button>
          <ChangelogButton />
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  );
}
