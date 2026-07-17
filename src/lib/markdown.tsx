import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "@/store/DataProvider";

/**
 * Tiny, safe markdown renderer (no external deps, no dangerouslySetInnerHTML).
 * Supports: #/##/### headings, - / * bullets, - [ ] / - [x] checkboxes,
 * **bold**, *italic*, `code`, [text](url), [[wiki-link]], and paragraph breaks.
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

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: wiki-links, links, code, bold, italic.
  const pattern =
    /(\[\[([^\]]+)\]\])|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
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
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] | null = null;

  const flushList = (key: string) => {
    if (list) {
      blocks.push(
        <ul key={key} className="my-1 flex flex-col gap-1 pl-1">
          {list}
        </ul>
      );
      list = null;
    }
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `l-${idx}`;

    const check = line.match(/^\s*-\s\[( |x|X)\]\s(.*)$/);
    if (check) {
      (list ??= []).push(
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

    const bullet = line.match(/^\s*[-*]\s(.*)$/);
    if (bullet) {
      (list ??= []).push(
        <li key={key} className="flex items-start gap-2 text-sm">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          <span>{renderInline(bullet[1], key)}</span>
        </li>
      );
      return;
    }

    flushList(`ul-${idx}`);

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

    if (line.trim() === "") {
      blocks.push(<div key={key} className="h-2" />);
      return;
    }

    blocks.push(
      <p key={key} className="text-sm text-muted-foreground">
        {renderInline(line, key)}
      </p>
    );
  });
  flushList("ul-end");

  return <div className={className}>{blocks}</div>;
}
