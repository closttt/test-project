import { Outlet } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";

/**
 * Legacy chrome (sidebar + mobile nav) for the pages that have not moved to Craft Dark yet.
 * Globals (reminders, dialogs, shortcuts) live one level up in GlobalLayout.
 */
export function AppLayout() {
  return (
    <div data-ui="app" className="flex min-h-screen bg-background">
      <Sidebar />
      <div data-ui="content" className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <Outlet />
      </div>
      <MobileNav />
    </div>
  );
}
