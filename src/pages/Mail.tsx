import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail as MailIcon,
  Star,
  Archive,
  MailOpen,
  Search,
  RefreshCw,
  Paperclip,
  ExternalLink,
  CalendarPlus,
  ListPlus,
  ArrowLeft,
  ImageIcon,
  Video,
  ChevronDown,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/EmptyState";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { pushUndo } from "@/lib/undoStack";
import { formatDateTime, localDayStr } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  attachmentUrl,
  displayName,
  formatBytes,
  getThread,
  gmailStatus,
  gmailWebUrl,
  inviteToMeeting,
  listThreads,
  modifyThread,
  type GmailStatus,
  type MailBox,
  type MailMessage,
  type MailThread,
  type ThreadSummary,
} from "@/lib/gmail";

const POLL_MS = 2 * 60 * 1000;

/**
 * Gmail inside the CRM — list, thread, mark/star/archive, → Задача, → Встреча.
 *
 * Lives as a pane of the «Сервисы» hub (`embedded`), where the hub already draws the title, the
 * connection badge and the «Подключить» button; standalone (`/mail`) it wraps itself in AppShell
 * so an old bookmark still opens something sensible.
 */
export default function Mail({ embedded = false }: { embedded?: boolean } = {}) {
  const { addTask, deleteTask, addMeeting, meetings, deleteMeeting } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [status, setStatus] = useState<GmailStatus | "loading">("loading");
  const [box, setBox] = useState<MailBox>("inbox");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<MailThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const listReq = useRef(0);
  // Undo for «→ Встреча» must see the list AFTER the add — a closure over `meetings` would be stale.
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  useEffect(() => {
    gmailStatus().then(setStatus);
  }, []);

  const connected = status !== "loading" && status.connected;

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!connected) return;
      const id = ++listReq.current;
      if (!opts.silent) setLoading(true);
      try {
        const r = await listThreads(box, submitted);
        if (id !== listReq.current) return;
        setThreads(r.threads);
        setNextToken(r.nextPageToken);
        setError(null);
      } catch (e) {
        if (id !== listReq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === listReq.current) setLoading(false);
      }
    },
    [box, submitted, connected]
  );

  // Fresh list on box/search change, on tab focus, and every couple of minutes — same contract
  // the Knowledge cards use, so mail that arrived while the tab was in the background is there
  // the moment the user looks.
  useEffect(() => {
    load();
    if (!connected) return;
    const timer = setInterval(() => load({ silent: true }), POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load({ silent: true }); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load, connected]);

  async function loadMore() {
    if (!nextToken) return;
    setLoadingMore(true);
    try {
      const r = await listThreads(box, submitted, nextToken);
      setThreads((prev) => [...prev, ...r.threads.filter((t) => !prev.some((p) => p.id === t.id))]);
      setNextToken(r.nextPageToken);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function open(t: ThreadSummary) {
    setSelectedId(t.id);
    setThread(null);
    setShowImages(false);
    setThreadLoading(true);
    try {
      const full = await getThread(t.id);
      setThread(full);
      if (t.unread) void setLabels(t.id, { remove: ["UNREAD"] }, { silentError: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
      setSelectedId(null);
    } finally {
      setThreadLoading(false);
    }
  }

  /** Optimistic label change on both the list row and the open thread; rolls back on failure. */
  async function setLabels(
    threadId: string,
    change: { add?: ("UNREAD" | "STARRED" | "INBOX")[]; remove?: ("UNREAD" | "STARRED" | "INBOX")[] },
    opts: { silentError?: boolean } = {}
  ) {
    const patch = (t: ThreadSummary): ThreadSummary => ({
      ...t,
      unread: change.add?.includes("UNREAD") ? true : change.remove?.includes("UNREAD") ? false : t.unread,
      starred: change.add?.includes("STARRED") ? true : change.remove?.includes("STARRED") ? false : t.starred,
    });
    const before = threads;
    const archived = change.remove?.includes("INBOX") && box === "inbox";
    setThreads((prev) => (archived ? prev.filter((t) => t.id !== threadId) : prev.map((t) => (t.id === threadId ? patch(t) : t))));
    setThread((prev) =>
      prev && prev.id === threadId
        ? { ...prev, messages: prev.messages.map((m) => ({ ...m, unread: patch({ unread: m.unread, starred: m.starred } as ThreadSummary).unread, starred: patch({ unread: m.unread, starred: m.starred } as ThreadSummary).starred })) }
        : prev
    );
    if (archived && selectedId === threadId) {
      setSelectedId(null);
      setThread(null);
    }
    try {
      await modifyThread(threadId, change);
      // Keep the sidebar badge honest without waiting for the next poll.
      if (change.add?.includes("UNREAD") || change.remove?.includes("UNREAD")) void gmailStatus();
    } catch (e) {
      setThreads(before);
      if (!opts.silentError) toast(e instanceof Error ? e.message : String(e));
    }
  }

  const selected = useMemo(() => threads.find((t) => t.id === selectedId) ?? null, [threads, selectedId]);

  function makeTask(t: MailThread) {
    const last = t.messages[t.messages.length - 1];
    const id = addTask({
      title: t.subject,
      done: false,
      description: last ? `Письмо от ${displayName(last.from)} <${last.from.email}>\n\n${last.snippet}` : undefined,
      links: [gmailWebUrl(t.id)],
      dueDate: localDayStr(),
    });
    const undo = pushUndo(`Задача из письма: ${t.subject}`, () => deleteTask(id));
    toast(`Задача создана: ${t.subject}`, { actionLabel: "Вернуть", onAction: undo });
  }

  function makeMeeting(t: MailThread) {
    const withInvite = t.messages.find((m) => m.invite);
    const withCall = t.messages.find((m) => m.callLinks.length > 0);
    const source = withInvite?.invite;
    const base = source
      ? inviteToMeeting(source)
      : { title: t.subject, date: localDayStr(), time: "12:00", durationMin: 30, url: withCall?.callLinks[0] };
    const url = base.url ?? withCall?.callLinks[0];
    addMeeting({ title: base.title, date: base.date, time: base.time, durationMin: base.durationMin, url });
    // addMeeting doesn't return the id — the newest meeting with this title/date is ours.
    const undo = pushUndo(`Встреча из письма: ${base.title}`, () => {
      const created = [...meetingsRef.current].reverse().find((m) => m.title === base.title && m.date === base.date && m.time === base.time);
      if (created) deleteMeeting(created.id);
    });
    toast(`Встреча добавлена: ${base.title} · ${base.date} ${base.time}`, { actionLabel: "Вернуть", onAction: undo });
  }

  const boxOptions = [
    { value: "inbox" as MailBox, label: "Входящие" },
    { value: "starred" as MailBox, label: "Со звездой" },
    { value: "sent" as MailBox, label: "Отправленные" },
  ];

  if (status === "loading") {
    const spinner = (
      <div className="flex h-40 items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
    return embedded ? spinner : <AppShell title="Почта">{spinner}</AppShell>;
  }

  if (!status.connected) {
    const empty = (
      <EmptyState
        icon={MailIcon}
        title="Почта не подключена"
        description={status.reason ?? "Подключите Gmail — письма, звёзды и архив появятся здесь, а из письма можно будет сделать задачу или встречу."}
        actionLabel="Открыть настройки"
        onAction={() => navigate("/settings")}
      />
    );
    return embedded ? empty : <AppShell title="Почта" description="Gmail внутри рабочего стола">{empty}</AppShell>;
  }

  const toolbar = (
    <>
      <Button variant="outline" size="icon" onClick={() => load()} title="Обновить" aria-label="Обновить" disabled={loading}>
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" /> Gmail
        </a>
      </Button>
    </>
  );

  const body = (
    <>
      {/* Embedded in the hub there is no AppShell header to hang the toolbar on, so it rides above
          the list instead of disappearing. */}
      {embedded && <div className="mb-3 flex justify-end gap-2">{toolbar}</div>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ── List ─────────────────────────────────────────────────────────── */}
        <section className={cn("flex min-w-0 flex-col gap-3", selectedId && "hidden md:flex")} aria-label="Список писем">
          <Segmented<MailBox> ariaLabel="Папка" value={box} onChange={(v) => { setBox(v); setSelectedId(null); setThread(null); }} options={boxOptions} />
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(query.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск как в Gmail: from:ivan has:attachment newer_than:7d"
              className="pl-8 pr-8"
              aria-label="Поиск по почте"
            />
            {query && (
              <button type="button" aria-label="Очистить поиск" onClick={() => { setQuery(""); setSubmitted(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                ✕
              </button>
            )}
          </form>

          {error && <p className="rounded-md border border-risk/30 bg-risk/10 px-3 py-2 text-xs text-risk">{error}</p>}

          <div className="overflow-hidden rounded-lg border border-border">
            {loading && threads.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
              </div>
            ) : threads.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{submitted ? "Ничего не найдено." : "Пусто."}</p>
            ) : (
              <ul className="divide-y divide-border">
                {threads.map((t) => (
                  <li key={t.id}>
                    <ThreadRow
                      thread={t}
                      active={t.id === selectedId}
                      onOpen={() => open(t)}
                      onStar={() => setLabels(t.id, t.starred ? { remove: ["STARRED"] } : { add: ["STARRED"] })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {nextToken && (
            <Button variant="ghost" size="sm" className="self-center" onClick={loadMore} disabled={loadingMore}>
              <ChevronDown className="h-4 w-4" /> {loadingMore ? "Загружаю…" : "Ещё"}
            </Button>
          )}
        </section>

        {/* ── Thread ───────────────────────────────────────────────────────── */}
        <section className={cn("min-w-0", !selectedId && "hidden md:block")} aria-label="Письмо">
          {!selectedId ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Выберите письмо слева
            </div>
          ) : threadLoading || !thread ? (
            <div className="flex h-40 items-center justify-center">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
            </div>
          ) : (
            <ThreadView
              thread={thread}
              summary={selected}
              showImages={showImages}
              onToggleImages={() => setShowImages((v) => !v)}
              onBack={() => { setSelectedId(null); setThread(null); }}
              onStar={() => setLabels(thread.id, selected?.starred ? { remove: ["STARRED"] } : { add: ["STARRED"] })}
              onUnread={() => setLabels(thread.id, selected?.unread ? { remove: ["UNREAD"] } : { add: ["UNREAD"] })}
              onArchive={() => setLabels(thread.id, { remove: ["INBOX"] })}
              onTask={() => makeTask(thread)}
              onMeeting={() => makeMeeting(thread)}
              inInbox={box === "inbox"}
            />
          )}
        </section>
      </div>
    </>
  );

  if (embedded) return body;
  return (
    <AppShell title="Почта" description={status.email ?? undefined} actions={toolbar}>
      {body}
    </AppShell>
  );
}

function ThreadRow({ thread: t, active, onOpen, onStar }: { thread: ThreadSummary; active: boolean; onOpen: () => void; onStar: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      aria-current={active || undefined}
      className={cn(
        "group flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none",
        active && "bg-secondary/70"
      )}
    >
      <button
        type="button"
        aria-label={t.starred ? "Снять звезду" : "Поставить звезду"}
        aria-pressed={t.starred}
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        className={cn("mt-0.5 shrink-0 rounded p-0.5 transition-colors", t.starred ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400")}
      >
        <Star className={cn("h-4 w-4", t.starred && "fill-amber-400")} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate", t.unread ? "font-semibold" : "text-foreground/90")}>{displayName(t.from)}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(t.date)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {t.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-label="Непрочитано" />}
          <span className={cn("truncate", t.unread ? "font-medium" : "")}>{t.subject}</span>
          {t.messageCount > 1 && <span className="shrink-0 text-xs text-muted-foreground">{t.messageCount}</span>}
          {t.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Есть вложения" />}
        </div>
        <p className="truncate text-xs text-muted-foreground">{t.snippet}</p>
      </div>
    </div>
  );
}

/** Today → "14:05", this year → "21 сент.", older → "21.09.25". */
function shortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (localDayStr(d) === localDayStr(now)) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function ThreadView({
  thread,
  summary,
  showImages,
  onToggleImages,
  onBack,
  onStar,
  onUnread,
  onArchive,
  onTask,
  onMeeting,
  inInbox,
}: {
  thread: MailThread;
  summary: ThreadSummary | null;
  showImages: boolean;
  onToggleImages: () => void;
  onBack: () => void;
  onStar: () => void;
  onUnread: () => void;
  onArchive: () => void;
  onTask: () => void;
  onMeeting: () => void;
  inInbox: boolean;
}) {
  const hasMeetingSignal = thread.messages.some((m) => m.invite || m.callLinks.length > 0);
  const hasHtmlImages = thread.messages.some((m) => m.html && /<img\b/i.test(m.html));
  const starred = summary?.starred ?? thread.messages.some((m) => m.starred);
  const unread = summary?.unread ?? false;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([thread.messages[thread.messages.length - 1]?.id]));
  useEffect(() => {
    setExpanded(new Set([thread.messages[thread.messages.length - 1]?.id]));
  }, [thread.id, thread.messages]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Назад к списку">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="mr-auto min-w-0 flex-1 truncate text-base font-semibold" title={thread.subject}>{thread.subject}</h2>
        <Button variant="ghost" size="icon" onClick={onStar} title={starred ? "Снять звезду" : "Звезда"} aria-label={starred ? "Снять звезду" : "Поставить звезду"} aria-pressed={starred}>
          <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onUnread} title={unread ? "Отметить прочитанным" : "Отметить непрочитанным"} aria-label={unread ? "Отметить прочитанным" : "Отметить непрочитанным"}>
          {unread ? <MailOpen className="h-4 w-4" /> : <MailIcon className="h-4 w-4" />}
        </Button>
        {inInbox && (
          <Button variant="ghost" size="icon" onClick={onArchive} title="В архив" aria-label="В архив">
            <Archive className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onTask} title="Создать задачу со ссылкой на письмо">
          <ListPlus className="h-4 w-4" /> Задача
        </Button>
        {hasMeetingSignal && (
          <Button variant="outline" size="sm" onClick={onMeeting} title="Создать встречу из приглашения или ссылки на созвон">
            <CalendarPlus className="h-4 w-4" /> Встреча
          </Button>
        )}
        <Button variant="ghost" size="icon" asChild title="Открыть в Gmail">
          <a href={gmailWebUrl(thread.id)} target="_blank" rel="noopener noreferrer" aria-label="Открыть в Gmail">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>

      {hasHtmlImages && (
        <button type="button" onClick={onToggleImages} className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> {showImages ? "Скрыть картинки" : "Показать картинки"}
        </button>
      )}

      <div className="flex flex-col gap-2">
        {thread.messages.map((m) => (
          <MessageCard
            key={m.id}
            message={m}
            open={expanded.has(m.id)}
            onToggle={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                return next;
              })
            }
            showImages={showImages}
          />
        ))}
      </div>
    </div>
  );
}

function MessageCard({ message: m, open, onToggle, showImages }: { message: MailMessage; open: boolean; onToggle: () => void; showImages: boolean }) {
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
          {(m.from.name || m.from.email).slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{displayName(m.from)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.date)}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {open ? `${m.from.email}${m.to.length ? ` → ${m.to.map(displayName).join(", ")}` : ""}${m.cc.length ? ` · копия: ${m.cc.map(displayName).join(", ")}` : ""}` : m.snippet}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          {m.invite && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand/5 px-4 py-2 text-xs">
              <CalendarPlus className="h-3.5 w-3.5 text-brand" />
              <span className="font-medium">{m.invite.summary}</span>
              <span className="text-muted-foreground">{formatDateTime(m.invite.start)}{m.invite.end ? ` – ${new Date(m.invite.end).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
              {m.invite.location && <span className="text-muted-foreground">· {m.invite.location}</span>}
            </div>
          )}
          {m.callLinks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
              <Video className="h-3.5 w-3.5 text-muted-foreground" />
              {m.callLinks.map((l) => (
                <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="truncate text-brand hover:underline" style={{ maxWidth: "18rem" }}>
                  {l.replace(/^https?:\/\//, "")}
                </a>
              ))}
            </div>
          )}
          <MailBody html={m.html} showImages={showImages} />
          {m.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
              {m.attachments.map((a) => (
                <a
                  key={a.id}
                  href={attachmentUrl(m.id, a)}
                  download={a.filename}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:border-muted-foreground/40"
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{a.filename}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Email HTML in a sandboxed iframe (no scripts, no forms). A CSP <meta> inside the document
 * blocks remote images until the user opts in — tracking pixels don't fire by default. Links open
 * in a new tab via the popup allowances; same-origin is only there so we can read the height.
 */
function MailBody({ html, showImages }: { html?: string; showImages: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const doc = useMemo(() => {
    const imgSrc = showImages ? "https: http: data: cid:" : "'none'";
    return (
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https:; img-src ${imgSrc}; font-src https: data:; frame-src 'none'; script-src 'none'">` +
      `<base target="_blank">` +
      `<style>html,body{margin:0;padding:0;background:#fff;color:#111;color-scheme:light}body{padding:14px 16px;font:14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;word-break:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#1a56db}table{max-width:100%}pre{white-space:pre-wrap}blockquote{margin:0 0 0 .5em;padding-left:.75em;border-left:2px solid #ddd;color:#555}</style>` +
      `</head><body>${html ?? "<p style='color:#888'>(пустое письмо)</p>"}</body></html>`
    );
  }, [html, showImages]);

  function measure() {
    const body = ref.current?.contentDocument?.documentElement;
    if (body) setHeight(Math.min(Math.max(body.scrollHeight + 4, 80), 4000));
  }

  return (
    <iframe
      ref={ref}
      title="Текст письма"
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      onLoad={measure}
      style={{ height }}
      className="block w-full border-0 bg-white"
    />
  );
}
