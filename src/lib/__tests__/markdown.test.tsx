import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { Markdown } from "@/lib/markdown";

afterEach(cleanup);

// A trimmed version of the kind of plan the AI assistant returns — headings, bold, bullets, numbers.
const PLAN = [
  "## План на день",
  "",
  "* **10:00–11:00** — Созвон (Высокий приоритет)",
  "* 11:00–11:05 — Перерыв",
  "",
  "1. Первый шаг",
  "2. Второй шаг",
  "",
  "**Итог:** 6 часов работы.",
].join("\n");

describe("Markdown", () => {
  it("renders bold via <strong>, not literal **", () => {
    const { container } = render(<Markdown source="**Итог:** готово" />);
    expect(container.querySelector("strong")?.textContent).toBe("Итог:");
    expect(container.textContent).not.toContain("**");
  });

  it("renders * bullets as an unordered list", () => {
    const { container } = render(<Markdown source={"* один\n* два"} />);
    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    expect(ul!.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("ol")).toBeNull();
  });

  it("renders 1. items as an ordered list, separate from bullets", () => {
    const { container } = render(<Markdown source={"1. первый\n2. второй"} />);
    const ol = container.querySelector("ol");
    expect(ol).not.toBeNull();
    expect(ol!.querySelectorAll("li")).toHaveLength(2);
    expect(ol!.textContent).toContain("1.");
  });

  it("renders headings as bold blocks without the # marker", () => {
    const { container } = render(<Markdown source="## Заголовок" />);
    expect(container.textContent).toBe("Заголовок");
    expect(container.querySelector("p")?.className).toContain("font-semibold");
  });

  it("renders a horizontal rule for ---", () => {
    const { container } = render(<Markdown source={"текст\n---\nещё"} />);
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("keeps a bold-prefixed line as text, not a rule or bullet", () => {
    const { container } = render(<Markdown source="**Итог:** 6 часов" />);
    expect(container.querySelector("hr")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
    expect(container.textContent).toContain("6 часов");
  });

  it("handles a full plan: a heading, both list kinds, and no leftover markers", () => {
    const { container } = render(<Markdown source={PLAN} />);
    expect(container.querySelector("ul")).not.toBeNull();
    expect(container.querySelector("ol")).not.toBeNull();
    expect(container.querySelectorAll("strong").length).toBeGreaterThan(0);
    // The raw markdown markers must not leak into the visible text.
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("##");
  });
});
