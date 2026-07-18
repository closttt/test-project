import { describe, it, expect } from "vitest";

import { isDismissedFor } from "@/lib/rollover";

describe("isDismissedFor", () => {
  it("is dismissed only when the stored date matches today exactly", () => {
    expect(isDismissedFor("2026-07-17", "2026-07-17")).toBe(true);
  });

  it("is not dismissed on a new day, even if dismissed yesterday", () => {
    expect(isDismissedFor("2026-07-16", "2026-07-17")).toBe(false);
  });

  it("is not dismissed when nothing was ever stored", () => {
    expect(isDismissedFor(null, "2026-07-17")).toBe(false);
  });
});
