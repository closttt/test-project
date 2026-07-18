import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, X, Eraser, Send, Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { easeOut } from "@/lib/motion";
import { isAiConfigured, streamChat, requestCompletion, type ChatMessage } from "@/lib/ai";
import { buildAiContext } from "@/lib/aiContext";
import { AI_TOOLS, dispatchToolCall, type AiToolContext } from "@/lib/aiTools";
import { useToast } from "@/store/ToastProvider";
import { cn } from "@/lib/utils";

/** `prompt` is what actually gets sent; `label` is what the button shows — kept short while the
 * sent text (for "Спланируй мой день") carries a fuller instruction so the reply is a concrete,
 * ordered, time-blocked plan instead of generic advice, using exactly the data `buildAiContext`
 * already exposes (today's tasks with estimates/priority, daily limit, Pomodoro settings). */
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

interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** Right-side drawer — live LLM chat over the user's real data. */
export function AiAssistant() {
  const ctx = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { assistantOpen, setAssistantOpen } = useUI();
  const configured = isAiConfigured();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!assistantOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAssistantOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [assistantOpen, setAssistantOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !configured) return;
    setError(null);
    setDraft("");
    const next: Turn[] = [...turns, { role: "user", text: question }, { role: "assistant", text: "" }];
    setTurns(next);
    setBusy(true);

    const baseMessages: ChatMessage[] = [
      { role: "system", content: buildAiContext(ctx) },
      ...turns.map((t): ChatMessage => ({ role: t.role, content: t.text })),
      { role: "user", content: question },
    ];

    const controller = new AbortController();
    abortRef.current = controller;
    const toolCtx: AiToolContext = ctx;

    function setReply(t: string) {
      setTurns((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", text: t };
        return copy;
      });
    }

    try {
      // Tools are always offered — the model decides whether the request needs one. This first
      // call is non-streaming (tool-call arguments arrive as one parsed JSON object, not SSE
      // fragments); if no tool was needed, its own text is the final answer, shown immediately.
      const decision = await requestCompletion(baseMessages, AI_TOOLS, controller.signal);

      if (decision.toolCalls && decision.toolCalls.length > 0) {
        const assistantToolMsg: ChatMessage = {
          role: "assistant",
          content: decision.content ?? "",
          // Verbatim pass-through, not rebuilt — some providers (Gemini) attach required extra
          // metadata per call (e.g. `thought_signature`) that a hand-reconstructed object drops,
          // which then makes the follow-up request fail with a 400.
          tool_calls: decision.rawToolCalls,
        };
        const toolResultMsgs: ChatMessage[] = decision.toolCalls.map((call) => {
          const result = dispatchToolCall(toolCtx, call);
          // Undo runs through the SAME global stack every manual action uses — an AI-made
          // change is exactly as safe to make as a manual one (Ctrl+Z or the toast button).
          if (result.toastLabel) {
            toast(result.toastLabel, result.undoRun ? { actionLabel: "Вернуть", onAction: result.undoRun } : undefined);
          }
          return { role: "tool", tool_call_id: call.id, content: result.resultText };
        });

        let acc = "";
        for await (const delta of streamChat([...baseMessages, assistantToolMsg, ...toolResultMsgs], controller.signal)) {
          acc += delta;
          setReply(acc);
        }
        // Some models return an empty wrap-up after using a tool — fall back to the raw results
        // so the user isn't left staring at a blank bubble despite the action having happened.
        if (!acc) setReply(toolResultMsgs.map((m) => m.content).join(" "));
      } else {
        setReply(decision.content ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <AnimatePresence>
      {assistantOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAssistantOpen(false)}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: easeOut }}
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">AI-ассистент</p>
                <p className="truncate text-xs text-muted-foreground">Может создавать и менять задачи, проекты, заметки</p>
              </div>
              {turns.length > 0 && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTurns([])} title="Очистить">
                  <Eraser className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAssistantOpen(false)} title="Закрыть">
                <X className="h-4 w-4" />
              </Button>
            </header>

            {!configured ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <Bot className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  ИИ ещё не настроен — добавьте ключ и модель в Настройках, чтобы задавать вопросы по своим данным.
                </p>
                <Button size="sm" onClick={() => { setAssistantOpen(false); navigate("/settings"); }}>
                  <SettingsIcon className="h-4 w-4" /> Открыть настройки
                </Button>
              </div>
            ) : (
              <>
                {turns.length === 0 && (
                  <div className="border-b border-border p-3">
                    <p className="mb-2 text-xs text-muted-foreground">Быстрые вопросы:</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PROMPTS.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => send(p.prompt)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-brand/50 hover:text-brand"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {turns.length === 0 && (
                    <p className="pt-6 text-center text-sm text-muted-foreground">
                      Спросите что угодно про свои задачи, проекты и фокус — ответ учитывает актуальные данные.
                    </p>
                  )}
                  {turns.map((t, i) => (
                    <div
                      key={i}
                      className={cn(
                        "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                        t.role === "user" ? "ml-auto bg-brand text-brand-foreground" : "whitespace-pre-wrap border border-border bg-secondary/40"
                      )}
                    >
                      {t.text || (busy && i === turns.length - 1 ? "…" : "")}
                    </div>
                  ))}
                  {error && <p className="text-xs text-risk">{error}</p>}
                </div>

                <div className="flex items-end gap-2 border-t border-border p-3">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(draft);
                      }
                    }}
                    placeholder="Спросите про задачи, проекты, фокус… · Enter — отправить"
                    className="min-h-[2.5rem] flex-1 resize-none"
                    rows={1}
                    disabled={busy}
                  />
                  <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => send(draft)} disabled={busy || !draft.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
