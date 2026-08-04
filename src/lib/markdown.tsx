import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "@/store/DataProvider";

/**
 * Tiny, safe markdown renderer (no external deps, no dangerouslySetInnerHTML).
 * Supports: #/##/### headings, - / * bullets, 1. ordered lists, - [ ] / - [x] checkboxes,
 * **bold**, *italic*, `code`, [text](url), [[wiki-link]], --- rules, and paragraph breaks.
 */

/** [[name]] backlink — resolves to a project or task and navigates on click. */
function WikiLink({ name }: { name: string }) {
  // allProjects, not the active-only list — archiving a project shouldn't silently break
  // backlinks that were created while it was still active.
  const { allProjects, allTasks } = useData();
  const navigate = useNavigate();
  const n = name.trim().toLowerCase();
  // Exact matches (either type) always outrank a partial match of the other type —
  // otherwise a project whose name merely *contains* the link text could shadow an
  // exact-matching task with the same link text.
  const exactProj = allProjects.find((p) => p.name.toLowerCase() === n);
  const exactTask = allTasks.find((t) => t.title.toLowerCase() === n);
  const proj = exactProj ?? (exactTask ? undefined : allProjects.find((p) => p.name.toLowerCase().includes(n)));
  const task = exactTask ?? (exactProj ? undefined : allTasks.find((t) => t.title.toLowerCase().includes(n)));
  const target = proj
    ? { label: proj.name, to: `/projects/${proj.id}`, state: undefined }
    : task
    ? { label: task.title, to: "/tasks", state: { openTaskId: task.id } }
    : null;
  if (!target) {
    return (
      <span className="rounded bg-secondary px-1 text-[0.9em] text-muted-foreground" title="Ничего не связано">
        [[{name}]]
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => navigate(target.to, target.state ? { state: target.state } : undefined)}
      className="rounded bg-brand/10 px-1 text-[0.9em] font-medium text-brand transition-colors hover:bg-brand/20"
      title={proj ? "Проект" : "Задача"}
    >
      {target.label}
    </button>
  );
}

/**
 * `::tone Текст::` → a design-system status chip. Tones map onto the same tokens the app's Badge
 * uses, so a status the assistant writes looks identical to one rendered anywhere else in the CRM.
 * Aliases are accepted so slight model wording ("red", "high") still lands on the right colour.
 */
const BADGE_TONES: Record<string, string> = {
  risk: "bg-risk/15 text-risk",
  red: "bg-risk/15 text-risk",
  high: "bg-risk/15 text-risk",
  overdue: "bg-risk/15 text-risk",
  success: "bg-success/15 text-success",
  green: "bg-success/15 text-success",
  done: "bg-success/15 text-success",
  warning: "bg-amber-500/15 text-amber-400",
  warn: "bg-amber-500/15 text-amber-400",
  amber: "bg-amber-500/15 text-amber-400",
  medium: "bg-amber-500/15 text-amber-400",
  info: "bg-brand/15 text-brand",
  brand: "bg-brand/15 text-brand",
  blue: "bg-brand/15 text-brand",
  low: "bg-brand/15 text-brand",
  neutral: "bg-secondary text-muted-foreground",
  muted: "bg-secondary text-muted-foreground",
};

function badgeClass(tone: string): string {
  return BADGE_TONES[tone.toLowerCase()] ?? BADGE_TONES.neutral;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: badges, wiki-links, links, code, bold, italic. Badge (`::tone text::`) shares
  // no delimiter with the others, so appending it is safe.
  const pattern =
    /(\[\[([^\]]+)\]\])|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(::(\w+)\s+([^:\n]+?)::)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1]) {
      nodes.push(<WikiLink key={key} name={m[2]} />);
    } else if (m[3]) {
      nodes.push(
        <a key={key} href={m[5]} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">
          {m[4]}
        </a>
      );
    } else if (m[6]) {
      nodes.push(
        <code key={key} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">
          {m[7]}
        </code>
      );
    } else if (m[8]) {
      nodes.push(<strong key={key}>{m[9]}</strong>);
    } else if (m[10]) {
      nodes.push(<em key={key}>{m[11]}</em>);
    } else if (m[12]) {
      nodes.push(
        <span
          key={key}
          className={`mx-0.5 inline-flex items-center rounded-full px-2 py-0.5 align-middle text-[0.75em] font-medium ${badgeClass(m[13])}`}
        >
          {m[14]}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({
  source,
  className,
  bodyClassName = "text-sm text-muted-foreground",
}: {
  source: string;
  className?: string;
  /** Class for plain paragraphs — override to raise body contrast (e.g. in the AI chat bubble). */
  bodyClassName?: string;
}) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] | null = null;
  let listType: "ul" | "ol" = "ul";
  let quote: string[] | null = null;

  const flushList = (key: string) => {
    if (list) {
      const Tag = listType === "ol" ? "ol" : "ul";
      blocks.push(
        <Tag key={key} className="my-1 flex flex-col gap-1 pl-1">
          {list}
        </Tag>
      );
      list = null;
    }
  };

  /** Blockquote → a Notion-style callout: accent bar + tinted panel. Good for the reply's takeaway. */
  const flushQuote = (key: string) => {
    if (quote) {
      const q = quote;
      blocks.push(
        <blockquote key={key} className="my-1.5 rounded-r border-l-2 border-brand/60 bg-secondary/40 px-3 py-1.5">
          {q.map((l, i) => (
            <p key={i} className="text-sm text-foreground/90">{renderInline(l, `${key}-q${i}`)}</p>
          ))}
        </blockquote>
      );
      quote = null;
    }
  };

  /** Start (or continue) a list of the given type — switching type flushes the previous one. */
  const openList = (type: "ul" | "ol", idx: number): ReactNode[] => {
    if (list && listType !== type) flushList(`list-${idx}`);
    listType = type;
    return (list ??= []);
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `l-${idx}`;

    // Blockquote / callout — consecutive `>` lines fold into one panel.
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      flushList(`list-${idx}`);
      (quote ??= []).push(q[1]);
      return;
    }
    if (quote) flushQuote(`quote-${idx}`);

    const check = line.match(/^\s*-\s\[( |x|X)\]\s(.*)$/);
    if (check) {
      openList("ul", idx).push(
        <li key={key} className="flex items-start gap-2 text-sm">
          <span
            className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] ${
              check[1].toLowerCase() === "x" ? "border-success bg-success text-success-foreground" : "border-muted-foreground/50"
            }`}
          >
            {check[1].toLowerCase() === "x" ? "✓" : ""}
          </span>
          <span className={check[1].toLowerCase() === "x" ? "text-muted-foreground line-through" : ""}>
            {renderInline(check[2], key)}
          </span>
        </li>
      );
      return;
    }

    const ordered = line.match(/^\s*(\d+)[.)]\s(.*)$/);
    if (ordered) {
      openList("ol", idx).push(
        <li key={key} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5 shrink-0 tabular-nums font-medium text-muted-foreground">{ordered[1]}.</span>
          <span>{renderInline(ordered[2], key)}</span>
        </li>
      );
      return;
    }

    const bullet = line.match(/^\s*[-*]\s(.*)$/);
    if (bullet) {
      openList("ul", idx).push(
        <li key={key} className="flex items-start gap-2 text-sm">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          <span>{renderInline(bullet[1], key)}</span>
        </li>
      );
      return;
    }

    flushList(`list-${idx}`);

    const h = line.match(/^(#{1,3})\s(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "text-base font-semibold" : level === 2 ? "text-sm font-semibold" : "text-sm font-medium";
      blocks.push(
        <p key={key} className={`${cls} mt-2 first:mt-0`}>
          {renderInline(h[2], key)}
        </p>
      );
      return;
    }

    // Horizontal rule: --- / *** / ___ on their own line.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-2 border-border" />);
      return;
    }

    if (line.trim() === "") {
      blocks.push(<div key={key} className="h-2" />);
      return;
    }

    blocks.push(
      <p key={key} className={bodyClassName}>
        {renderInline(line, key)}
      </p>
    );
  });
  flushList("list-end");
  flushQuote("quote-end");

  return <div className={className}>{blocks}</div>;
}
