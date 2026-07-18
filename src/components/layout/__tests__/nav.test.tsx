import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { DataProvider } from "@/store/DataProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { NAV_ITEMS } from "@/lib/navConfig";

/**
 * Regression test for a real crash: Sidebar/MobileNav each keep their own `ICONS` map keyed by
 * nav item id. Adding a new NAV_ITEMS entry (e.g. "clients") without adding a matching icon in
 * BOTH maps throws "Element type is invalid... got: undefined" at render time — a fresh nav item
 * that isn't hidden always lands in Sidebar's full list and (if within the top 5) MobileNav's
 * bottom bar too, so this crashes on first paint of any page, not just when visiting the new one.
 * `npx tsc`/`vitest` alone didn't catch this — untyped `Record<string, Icon>` lookups don't fail
 * to typecheck, and no prior test actually rendered these components.
 */
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <DataProvider>{ui}</DataProvider>
    </MemoryRouter>
  );
}

describe("Sidebar / MobileNav — icon map covers every nav item", () => {
  it("renders Sidebar without crashing for every NAV_ITEMS entry", () => {
    expect(() => renderWithProviders(<Sidebar />)).not.toThrow();
  });

  it("renders MobileNav without crashing for every NAV_ITEMS entry", () => {
    expect(() => renderWithProviders(<MobileNav />)).not.toThrow();
  });

  it("every nav item's label is actually present in the rendered Sidebar", () => {
    const { getByText } = renderWithProviders(<Sidebar />);
    for (const item of NAV_ITEMS) {
      expect(getByText(item.label)).toBeInTheDocument();
    }
  });
});
