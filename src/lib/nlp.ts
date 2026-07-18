/**
 * Lightweight natural-language parser (RU) for quick task capture.
 * Extracts a due date, #tags, a "!" importance flag, a time ("в 15:00" → remindAt), a
 * duration ("~30м"/"~1ч30м" → estimateMin), and a recurrence word ("каждый день" etc.) from
 * free text, returns the cleaned title. Recognises dates: сегодня, завтра, послезавтра,
 * "через N дн", weekday names, and "DD.MM". Tags: #word. Priority: ! or !важно.
 * Not exhaustive — a helpful convenience, Todoist-style. Deliberately stateless (no project
 * lookup) — an "@project" token would need the caller's project list to resolve, out of scope here.
 */

import { localDayStr } from "@/lib/format";
import type { Recurrence } from "@/types";

const WEEKDAYS: Record<string, number> = {
  понедельник: 1,
  вторник: 2,
  среда: 3,
  среду: 3,
  четверг: 4,
  пятница: 5,
  пятницу: 5,
  суббота: 6,
  субботу: 6,
  воскресенье: 0,
};

function iso(d: Date): string {
  return localDayStr(d);
}

export interface ParsedInput {
  title: string;
  dueDate?: string;
  tags: string[];
  important: boolean;
  /** Combines a parsed time ("в 15:00") with `dueDate` (or today, if no date word was found). */
  remindAt?: string;
  /** From a duration hint ("~30м", "~1ч30м", "~2ч"). */
  estimateMin?: number;
  /** From a recurrence word ("каждый день", "по будням", "каждую неделю", "каждый месяц"). */
  recurrence?: Recurrence;
}

export function parseNaturalInput(input: string): ParsedInput {
  let text = ` ${input} `;
  let dueDate: string | undefined;
  const tags: string[] = [];
  let important = false;

  // #tags
  const tagRe = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
  text = text.replace(tagRe, (_m, pre, tag) => {
    tags.push(String(tag).toLowerCase());
    return pre;
  });

  // priority: !важно or a standalone "!"
  if (/!\s*важно/iu.test(text)) {
    important = true;
    text = text.replace(/!\s*важно/iu, " ");
  } else if (/(^|\s)!(\s|$)/u.test(text)) {
    important = true;
    text = text.replace(/(^|\s)!(\s|$)/u, " ");
  }

  const setFromOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    dueDate = iso(d);
  };

  // сегодня / завтра / послезавтра
  // NB: JS `\b` is defined against [A-Za-z0-9_] and never matches next to Cyrillic letters, so a
  // plain `\bзавтра\b` silently never matches here — use a Unicode-aware boundary instead.
  const NOT_WORD = "\\p{L}\\p{N}_";
  if (new RegExp(`(?<![${NOT_WORD}])сегодня(?![${NOT_WORD}])`, "iu").test(text)) {
    setFromOffset(0);
    text = text.replace(new RegExp(`(?<![${NOT_WORD}])сегодня(?![${NOT_WORD}])`, "iu"), " ");
  } else if (new RegExp(`(?<![${NOT_WORD}])послезавтра(?![${NOT_WORD}])`, "iu").test(text)) {
    setFromOffset(2);
    text = text.replace(new RegExp(`(?<![${NOT_WORD}])послезавтра(?![${NOT_WORD}])`, "iu"), " ");
  } else if (new RegExp(`(?<![${NOT_WORD}])завтра(?![${NOT_WORD}])`, "iu").test(text)) {
    setFromOffset(1);
    text = text.replace(new RegExp(`(?<![${NOT_WORD}])завтра(?![${NOT_WORD}])`, "iu"), " ");
  }

  // через N дней
  const through = text.match(/через\s+(\d+)\s*(дн|день|дня|дней)/i);
  if (!dueDate && through) {
    setFromOffset(parseInt(through[1], 10));
    text = text.replace(through[0], " ");
  }

  // weekday (next occurrence)
  if (!dueDate) {
    for (const [word, dow] of Object.entries(WEEKDAYS)) {
      const re = new RegExp(`(?<![${NOT_WORD}])(в\\s+)?${word}(?![${NOT_WORD}])`, "iu");
      if (re.test(text)) {
        const d = new Date();
        const diff = (dow - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        dueDate = iso(d);
        text = text.replace(re, " ");
        break;
      }
    }
  }

  // DD.MM
  const dm = text.match(/\b(\d{1,2})\.(\d{1,2})\b/);
  if (!dueDate && dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10) - 1;
    const d = new Date();
    d.setMonth(month, day);
    if (d < new Date(new Date().toDateString())) d.setFullYear(d.getFullYear() + 1);
    dueDate = iso(d);
    text = text.replace(dm[0], " ");
  }

  // time: "в 15:00" (preferred) or a bare "15:00" — combines with the resolved due date
  // (or today, if no date word was found) into a reminder datetime.
  let remindAt: string | undefined;
  // Both alternatives share the same capture-group shape: [full, leadBoundary, hh, mm, trailBoundary].
  const timeMatch = text.match(/(^|\s)в\s+(\d{1,2}):(\d{2})(\s|$)/iu) ?? text.match(/(^|\s)(\d{1,2}):(\d{2})(\s|$)/u);
  if (timeMatch) {
    const hh = Math.min(23, parseInt(timeMatch[2], 10));
    const mm = Math.min(59, parseInt(timeMatch[3], 10));
    const base = dueDate ?? iso(new Date());
    remindAt = `${base}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    text = text.replace(timeMatch[0], " ");
  }

  // duration: "~30м"/"~45мин" / "~1ч30м" / "~2ч" — estimated effort in minutes. Bare `\b` would
  // silently never match right after a Cyrillic letter (same class of bug fixed once already for
  // date words) — use the Unicode-aware boundary instead. The combined ч+м form only recognizes
  // the single-letter "м" shorthand for minutes, not a spelled-out "мин" — a documented, minor gap.
  let estimateMin: number | undefined;
  const durHM = text.match(new RegExp(`~\\s*(\\d+)\\s*ч\\s*(\\d+)?\\s*м?(?![${NOT_WORD}])`, "iu"));
  const durM = !durHM ? text.match(new RegExp(`~\\s*(\\d+)\\s*(?:м|мин)(?![${NOT_WORD}])`, "iu")) : null;
  if (durHM) {
    estimateMin = parseInt(durHM[1], 10) * 60 + (durHM[2] ? parseInt(durHM[2], 10) : 0);
    text = text.replace(durHM[0], " ");
  } else if (durM) {
    estimateMin = parseInt(durM[1], 10);
    text = text.replace(durM[0], " ");
  }

  // recurrence — the unambiguous set only (no grammatical-case weekday matching here, that
  // risks silent mismatches; "каждый понедельник"-style phrasing stays a manual task-card edit).
  let recurrence: Recurrence | undefined;
  const RECURRENCE_PATTERNS: [RegExp, Recurrence][] = [
    [/(^|\s)каждый\s+день(\s|$)/iu, "daily"],
    [/(^|\s)по\s+будням(\s|$)/iu, "weekdays"],
    [/(^|\s)каждую\s+неделю(\s|$)/iu, "weekly"],
    [/(^|\s)каждый\s+месяц(\s|$)/iu, "monthly"],
  ];
  for (const [re, rec] of RECURRENCE_PATTERNS) {
    if (re.test(text)) {
      recurrence = rec;
      text = text.replace(re, " ");
      break;
    }
  }

  return { title: text.replace(/\s+/g, " ").trim(), dueDate, tags, important, remindAt, estimateMin, recurrence };
}

/** Back-compat helper: date-only parse. */
export function parseNaturalDate(input: string): { title: string; dueDate?: string } {
  const { title, dueDate } = parseNaturalInput(input);
  return { title, dueDate };
}
