/**
 * Lightweight natural-language parser (RU) for quick task capture.
 * Extracts a due date, #tags and a "!" importance flag from free text,
 * returns the cleaned title. Recognises dates: сегодня, завтра, послезавтра,
 * "через N дн", weekday names, and "DD.MM". Tags: #word. Priority: ! or !важно.
 * Not exhaustive — a helpful convenience, Todoist-style.
 */

import { localDayStr } from "@/lib/format";

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

  return { title: text.replace(/\s+/g, " ").trim(), dueDate, tags, important };
}

/** Back-compat helper: date-only parse. */
export function parseNaturalDate(input: string): { title: string; dueDate?: string } {
  const { title, dueDate } = parseNaturalInput(input);
  return { title, dueDate };
}
