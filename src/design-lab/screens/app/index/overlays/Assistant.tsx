/**
 * «Индекс» · AI-ассистент — right full-height drawer (parity with components/AiAssistant.tsx):
 * same context (buildAiContext), same tools (getAiTools / runToolCall with undo toasts), same
 * two-step call (requestCompletion → tools → streamChat), same quick prompts incl. the Gmail /
 * Notion ones, Esc / backdrop close, «не настроен» → Настройки.
 *
 * Presentation: the transcript is a numbered editorial list on hairlines (no bubbles), the input
 * is a ↳ row at the foot. The panel frame follows the kit's CasePanel (black, hairline left,
 * ⊹ close) but is built here because CasePanel has no fixed footer slot for a composer.
 *
 * Design lab: the sandbox must not talk to the outside world, so in the lab the request is not
 * sent at all and the turn ends in a quiet «в лаборатории ответы отключены» row; a guard 403
 * (prod-mode lab build) is mapped to the same state. The example exchange in the empty state is a
 * marked illustration, never a real answer.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { isAiConfigured, streamChat, requestCompletion, type ChatMessage } from "@/lib/ai";
import { buildAiContext } from "@/lib/aiContext";
import { getAiTools, runToolCall, type AiToolContext } from "@/lib/aiTools";
import { ensureLibrary } from "@/lib/library";
import { isGmailConnected } from "@/lib/gmail";
import { isNotionConnected } from "@/lib/notion";
import { Markdown } from "@/lib/markdown";
import { B, T, tab, display, pad2, Hook, Sparkle, Button } from "@/design-lab/screens/_kit/index";

/** Same prompts as production: `label` on the row, `prompt` is what is sent. */
const QUICK_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Спланируй мой день",
    prompt:
      "Спланируй мой день: возьми задачи на сегодня (учитывай оценку времени и приоритет), " +
      "дневной лимит и параметры помодоро из контекста. Предложи конкретный порядок с промежутками " +
      "времени (например «10:00–10:25 — …»), закладывая перерывы помодоро между блоками. " +
      "Если по оценкам суммарно не укладывается в разумный рабочий день — прямо скажи, что перенести.",
  },
  { label: "Разбери просроченные задачи", prompt: "Разбери просроченные задачи" },
  { label: "Итоги за неделю", prompt: "Итоги за неделю" },
  { label: "Создай задачу «Позвонить клиенту» на завтра", prompt: "Создай задачу «Позвонить клиенту» на завтра" },
];
const MAIL_PROMPTS = [
  { label: "Что мне писали за неделю?", prompt: "Найди письма за последние 7 дней (newer_than:7d) и коротко перескажи, кто что писал и что требует ответа." },
];
const NOTION_PROMPTS = [
  { label: "Итоги дня → в Notion", prompt: "Собери итоги дня: что закрыто сегодня, что просрочено, встречи — и создай страницу в Notion с этим содержимым." },
];

/** The lab frame (design-lab-frame.html) is a read-only sandbox — no outbound AI calls. */
const IN_LAB = typeof window !== "undefined" && window.location.pathname.includes("design-lab");
const LAB_OFF = "lab-off";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** Markdown from lib/markdown speaks the app theme; this pulls it into Golos / greys / radius 0. */
const MD_CSS = `
.ix-md, .ix-md * { font-family: ${B.font}; letter-spacing: -0.02em; }
.ix-md p, .ix-md li { font-size: 14px; line-height: 1.55; color: rgba(255,255,255,.82); }
.ix-md h1, .ix-md h2, .ix-md h3, .ix-md h4 { color: #fff; font-weight: 500; letter-spacing: -0.035em; }
.ix-md strong { color: #fff; font-weight: 500; }
.ix-md .text-muted-foreground { color: ${B.text3}; }
.ix-md blockquote { border-radius: 0; border-color: ${B.l20}; background: transparent; }
.ix-md a { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
.ix-md code { background: ${B.s2}; border-radius: 0; }
`;

/** One row of the transcript: number + speaker on the left, text on the right. */
function TurnRow({ n, who, children, dim }: { n: number; who: string; children: ReactNode; dim?: boolean }) {
  return (
    <li className="grid gap-4 py-5" style={{ gridTemplateColumns: "28px 72px minmax(0,1fr)", borderBottom: `1px solid ${B.l7}`, opacity: dim ? 0.55 : 1 }}>
      <span className="pt-[3px]" style={{ ...T.num, color: B.off }}>
        {pad2(n)}
      </span>
      <span className="pt-[2px]" style={{ ...T.meta, color: B.text3 }}>
        {who}
      </span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

export default function Assistant() {
  const ctx = useData();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const { assistantOpen, setAssistantOpen } = useUI();
  const configured = isAiConfigured();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const open = assistantOpen && pathname !== "/focus";
  const close = () => setAssistantOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAssistantOpen(false);
    document.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
    };
  }, [open, setAssistantOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, error]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Composer grows with its text up to ~6 lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [draft, open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !configured) return;
    setError(null);
    setDraft("");
    setTurns((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: "" }]);
    setBusy(true);

    function setReply(t: string) {
      setTurns((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", text: t };
        return copy;
      });
    }

    if (IN_LAB) {
      // Sandbox: nothing leaves the lab — the request is not sent.
      setError(LAB_OFF);
      setTurns((prev) => prev.slice(0, -1));
      setBusy(false);
      return;
    }

    await ensureLibrary();
    const baseMessages: ChatMessage[] = [
      { role: "system", content: buildAiContext(ctx) },
      ...turns.map((t): ChatMessage => ({ role: t.role, content: t.text })),
      { role: "user", content: question },
    ];
    const controller = new AbortController();
    abortRef.current = controller;
    const toolCtx: AiToolContext = ctx;

    try {
      const decision = await requestCompletion(baseMessages, getAiTools(), controller.signal);
      if (decision.toolCalls && decision.toolCalls.length > 0) {
        const assistantToolMsg: ChatMessage = { role: "assistant", content: decision.content ?? "", tool_calls: decision.rawToolCalls };
        const toolResultMsgs: ChatMessage[] = [];
        for (const call of decision.toolCalls) {
          const result = await runToolCall(toolCtx, call);
          if (result.toastLabel) {
            toast(result.toastLabel, result.undoRun ? { actionLabel: "Вернуть", onAction: result.undoRun } : undefined);
          }
          toolResultMsgs.push({ role: "tool", tool_call_id: call.id, content: result.resultText });
        }
        let acc = "";
        for await (const delta of streamChat([...baseMessages, assistantToolMsg, ...toolResultMsgs], controller.signal)) {
          acc += delta;
          setReply(acc);
        }
        if (!acc) setReply(toolResultMsgs.map((m) => m.content).join(" "));
      } else {
        setReply(decision.content ?? "");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The lab guard answers 403 «Песочница…» — same quiet state as the in-lab short-circuit.
      setError(/Песочница|403/.test(msg) ? LAB_OFF : msg);
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  if (!open) return null;

  const prompts = [...QUICK_PROMPTS, ...(isGmailConnected() ? MAIL_PROMPTS : []), ...(isNotionConnected() ? NOTION_PROMPTS : [])];

  return (
    <>
      <style>{MD_CSS}</style>
      <div aria-hidden className="fixed inset-0 z-[45] animate-in fade-in-0 duration-200" style={{ background: "rgba(0,0,0,.55)" }} onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="AI-ассистент"
        className="fixed inset-y-0 right-0 z-50 flex w-[560px] max-w-full flex-col animate-in slide-in-from-right-8 fade-in-0 duration-300"
        style={{ background: B.bg, borderLeft: `1px solid ${B.l10}`, fontFamily: B.font, color: B.text }}
      >
        {/* ── top rail ─────────────────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center gap-4 px-8" style={{ borderBottom: `1px solid ${B.l7}` }}>
          <span className="min-w-0 flex-1 truncate" style={{ ...T.meta, color: B.text3 }}>
            Ассистент · задачи, проекты, заметки · Notion · почта
          </span>
          {turns.length > 0 && (
            <button type="button" onClick={() => { setTurns([]); setError(null); }} className="outline-none transition-colors hover:!text-white" style={{ ...T.meta, color: B.text3 }} title="Очистить">
              Очистить
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            title="Закрыть · Esc"
            className="-mr-2 flex h-8 w-8 items-center justify-center outline-none transition-colors duration-200 hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
            style={{ color: B.text2 }}
          >
            <Sparkle open size={14} />
          </button>
        </div>

        {!configured ? (
          /* ── not configured ───────────────────────────────────────── */
          <div className="flex min-h-0 flex-1 flex-col px-8 pb-10 pt-10">
            <h2 style={display(44)}>ИИ не настроен</h2>
            <p className="mt-4 max-w-[400px]" style={{ ...T.bodyL, color: B.text2 }}>
              Добавьте ключ и модель в Настройках — тогда можно спрашивать про свои задачи, проекты и фокус.
            </p>
            <div className="mt-8">
              <Button
                variant="outline"
                onClick={() => {
                  close();
                  navigate("/settings");
                }}
              >
                Открыть настройки
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
              {turns.length === 0 ? (
                /* ── empty: title · quick prompts · marked example ─────── */
                <>
                  <h2 className="pt-10" style={display(44)}>
                    Что разобрать?
                  </h2>
                  <p className="mt-3" style={{ ...T.bodyL, color: B.text2 }}>
                    Ответ учитывает актуальные данные — задачи, проекты, фокус. Ассистент может и действовать: создать задачу, перенести срок.
                  </p>

                  <div className="mt-10 flex items-baseline gap-3 pb-3" style={{ borderBottom: `1px solid ${B.l10}` }}>
                    <span style={{ ...T.num, color: B.off }}>01</span>
                    <h3 style={T.title}>Быстрые вопросы</h3>
                  </div>
                  <ul>
                    {prompts.map((p, i) => (
                      <li key={p.label}>
                        <button
                          type="button"
                          onClick={() => send(p.prompt)}
                          className="group grid h-12 w-full items-center gap-4 text-left outline-none transition-colors duration-150 hover:bg-white/[0.02] focus-visible:bg-white/[0.03]"
                          style={{ gridTemplateColumns: "28px minmax(0,1fr) 16px", borderBottom: `1px solid ${B.l7}` }}
                        >
                          <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                          <span className="truncate transition-colors group-hover:text-white" style={{ ...T.body, color: B.text2 }}>
                            {p.label}
                          </span>
                          <span className="opacity-0 transition-opacity group-hover:opacity-100" style={{ color: B.text3 }}>
                            <Hook size={12} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {/* Illustration only — what an exchange looks like. Clearly not an answer. */}
                  <div className="mt-12" aria-hidden>
                    <div className="flex items-center justify-between pb-3" style={{ borderBottom: `1px dashed ${B.l15}` }}>
                      <span style={{ ...T.caps, color: B.off }}>Пример · так выглядит ответ</span>
                      <span style={{ ...T.meta, color: B.off }}>не ваши данные</span>
                    </div>
                    <ol className="pointer-events-none select-none">
                      <TurnRow n={1} who="Вы" dim>
                        <p style={{ ...T.bodyL, color: B.text }}>Что горит на сегодня?</p>
                      </TurnRow>
                      <TurnRow n={2} who="Ассистент" dim>
                        <p style={{ ...T.body, color: B.text2 }}>Две задачи с просрочкой и созвон в 15:00. Предлагаю порядок:</p>
                        <ol className="mt-2 space-y-1" style={{ ...T.body, color: B.text2, ...tab }}>
                          <li>10:00–10:50 — макет главной</li>
                          <li>11:00–11:25 — правки по договору</li>
                          <li>15:00 — созвон</li>
                        </ol>
                      </TurnRow>
                    </ol>
                  </div>
                </>
              ) : (
                /* ── transcript ────────────────────────────────────────── */
                <ol className="pt-4">
                  {turns.map((t, i) => (
                    <TurnRow key={i} n={i + 1} who={t.role === "user" ? "Вы" : "Ассистент"}>
                      {t.role === "user" ? (
                        <p className="whitespace-pre-wrap" style={{ ...T.bodyL, color: B.text }}>
                          {t.text}
                        </p>
                      ) : t.text ? (
                        <div className="ix-md">
                          <Markdown source={t.text} bodyClassName="text-[14px] leading-[1.55]" />
                        </div>
                      ) : (
                        <span className="animate-pulse" style={{ ...T.body, color: B.text3 }}>
                          {busy && i === turns.length - 1 ? "думаю…" : ""}
                        </span>
                      )}
                    </TurnRow>
                  ))}
                  {error === LAB_OFF && (
                    <li className="grid gap-4 py-5" style={{ gridTemplateColumns: "28px 72px minmax(0,1fr)", borderBottom: `1px solid ${B.l7}` }}>
                      <span style={{ ...T.num, color: B.off }}>—</span>
                      <span style={{ ...T.meta, color: B.text3 }}>Ассистент</span>
                      <div>
                        <p style={{ ...T.bodyStrong, color: B.text2 }}>В лаборатории ответы отключены</p>
                        <p className="mt-1" style={{ ...T.meta, color: B.text3 }}>
                          Песочница не отправляет запросы к ИИ. В приложении здесь будет ответ по вашим данным.
                        </p>
                      </div>
                    </li>
                  )}
                  {error && error !== LAB_OFF && (
                    <li className="py-4" style={{ ...T.meta, color: B.danger }}>
                      {error}
                    </li>
                  )}
                </ol>
              )}
            </div>

            {/* ── composer ──────────────────────────────────────────────── */}
            <form
              className="flex shrink-0 items-start gap-4 px-8 py-4"
              style={{ borderTop: `1px solid ${B.l10}` }}
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              <span className="pt-[11px]" style={{ color: B.text3 }}>
                <Hook size={14} />
              </span>
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                placeholder="Спросите про задачи, проекты, фокус…"
                aria-label="Вопрос ассистенту"
                className="min-w-0 flex-1 resize-none bg-transparent py-[9px] outline-none placeholder:text-[#454545] disabled:opacity-50"
                style={{ ...T.body, color: B.text }}
              />
              <div className="flex shrink-0 items-center gap-4 pt-[2px]">
                <span style={{ ...T.meta, color: B.off }}>Enter</span>
                <Button size="sm" type="submit" disabled={busy || !draft.trim()} variant={draft.trim() ? "lime" : "outline"}>
                  Спросить
                </Button>
              </div>
            </form>
          </>
        )}
      </aside>
    </>
  );
}
