import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plug, LockKeyhole, Mail, Search, X, ExternalLink, LogOut, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/store/ToastProvider";
import { cn } from "@/lib/utils";
import { fetchAuthStatus, logout, type AuthStatus } from "@/lib/auth";
import {
  loadNotionTarget,
  saveNotionTarget,
  notionSearch,
  notionStatus,
  type NotionStatus,
  type NotionTarget,
} from "@/lib/notion";
import { gmailConnectUrl, gmailDisconnect, gmailStatus, type GmailStatus } from "@/lib/gmail";

/**
 * Settings → «Интеграции» (plan B0/B1/B2): the app password, Notion (token + default target),
 * Gmail (OAuth connect/disconnect). Everything here talks to our own `/api/*` functions; the
 * secrets themselves live in Vercel env vars and are described, never entered, on this card.
 */
export function IntegrationsCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <Plug className="h-4 w-4" /> Интеграции
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AuthSection />
        <NotionSection />
        <GmailSection />
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon: Icon, children, right }: { icon: React.ComponentType<{ className?: string }>; children: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {children}
      </p>
      {right}
    </div>
  );
}

function Hint({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "risk" | "success" }) {
  return (
    <p className={cn("text-xs", tone === "risk" ? "text-risk" : tone === "success" ? "text-success" : "text-muted-foreground/70")}>
      {children}
    </p>
  );
}

// ── Вход ────────────────────────────────────────────────────────────────────────────────────

function AuthSection() {
  const [status, setStatus] = useState<AuthStatus | null | "loading">("loading");
  useEffect(() => {
    fetchAuthStatus().then(setStatus);
  }, []);

  async function signOut() {
    await logout();
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle
        icon={LockKeyhole}
        right={
          status !== "loading" && status?.required ? (
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" /> Выйти на этом устройстве
            </Button>
          ) : undefined
        }
      >
        Вход в приложение
      </SectionTitle>
      {status === "loading" ? (
        <Hint>Проверяю…</Hint>
      ) : status === null ? (
        <Hint tone="risk">Сервер приложения не отвечает — статус входа неизвестен.</Hint>
      ) : status.required ? (
        <Hint tone="success">Пароль включён. Это устройство вошло; сессия живёт год или до смены пароля.</Hint>
      ) : (
        <Hint tone="risk">
          Пароль не задан — приложение открыто всем, у кого есть ссылка. Задайте <code className="rounded bg-secondary px-1">APP_PASSWORD</code> в
          переменных окружения Vercel (почта и Notion без него не подключаются).
        </Hint>
      )}
    </div>
  );
}

// ── Notion ──────────────────────────────────────────────────────────────────────────────────

function NotionSection() {
  const { toast } = useToast();
  const [status, setStatus] = useState<NotionStatus | "loading">("loading");
  const [target, setTarget] = useState<NotionTarget | null>(() => loadNotionTarget());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NotionTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    notionStatus().then(setStatus);
  }, []);

  // Debounced search while the picker is open (empty query = recently edited pages).
  useEffect(() => {
    if (!picking || status === "loading" || !status.connected) return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await notionSearch(query);
        if (!cancelled) setResults(r);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, picking, status, toast]);

  function choose(t: NotionTarget) {
    saveNotionTarget(t);
    setTarget(t);
    setPicking(false);
    setQuery("");
    toast(`Notion: по умолчанию — «${t.title}»`);
  }

  const connected = status !== "loading" && status.connected;

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle
        icon={NotionGlyph}
        right={
          <Button variant="ghost" size="sm" onClick={() => { setStatus("loading"); notionStatus().then(setStatus); }} title="Проверить подключение">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        }
      >
        Notion
      </SectionTitle>
      {status === "loading" ? (
        <Hint>Проверяю…</Hint>
      ) : status.connected ? (
        <Hint tone="success">Подключено как «{status.name}». Ассистент умеет создавать страницы, дописывать и искать.</Hint>
      ) : (
        <Hint tone="risk">
          {status.reason ?? "Не подключено."} Создайте internal-интеграцию на notion.so/profile/integrations, положите токен в{" "}
          <code className="rounded bg-secondary px-1">NOTION_TOKEN</code> и расшарьте нужные страницы интеграции (⋯ → Connections).
        </Hint>
      )}

      <div className="grid gap-1.5">
        <Label>Страница или база по умолчанию («Инбокс»)</Label>
        {target && !picking ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[0.65rem] uppercase text-muted-foreground">{target.kind === "database" ? "база" : "страница"}</span>
            <span className="min-w-0 flex-1 truncate">{target.title}</span>
            {target.url && (
              <a href={target.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="Открыть в Notion">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <Button variant="ghost" size="sm" onClick={() => setPicking(true)} disabled={!connected}>Сменить</Button>
            <button type="button" aria-label="Убрать цель" title="Убрать" className="text-muted-foreground hover:text-risk" onClick={() => { saveNotionTarget(null); setTarget(null); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setPicking(true)}
                placeholder={connected ? "Найти страницу или базу в Notion…" : "Сначала подключите Notion"}
                disabled={!connected}
                className="pl-8"
              />
            </div>
            {picking && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                {searching && results.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Ищу…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено — страница расшарена интеграции?</p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => choose(r)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                    >
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[0.65rem] uppercase text-muted-foreground">{r.kind === "database" ? "база" : "страница"}</span>
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    </button>
                  ))
                )}
                <div className="flex justify-end border-t border-border px-2 py-1">
                  <Button variant="ghost" size="sm" onClick={() => { setPicking(false); setQuery(""); }}>Отмена</Button>
                </div>
              </div>
            )}
          </div>
        )}
        <Hint>Сюда попадают заметки по кнопке «→ в Notion» и страницы, которые создаёт ассистент, если не назвать другую.</Hint>
      </div>
    </div>
  );
}

function NotionGlyph({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-[3px] bg-foreground text-[0.6rem] font-black leading-none text-background", className)} style={{ width: "0.875rem", height: "0.875rem" }}>
      N
    </span>
  );
}

// ── Gmail ───────────────────────────────────────────────────────────────────────────────────

function GmailSection() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    gmailStatus().then(setStatus);
  }, []);

  // Back from Google's consent screen: the callback lands on /settings?gmail=connected|error.
  useEffect(() => {
    const result = params.get("gmail");
    if (!result) return;
    if (result === "connected") toast("Gmail подключён");
    else toast(params.get("reason") || "Не удалось подключить Gmail");
    const next = new URLSearchParams(params);
    next.delete("gmail");
    next.delete("reason");
    setParams(next, { replace: true });
  }, [params, setParams, toast]);

  async function disconnect() {
    setBusy(true);
    try {
      await gmailDisconnect();
      setStatus({ connected: false, configured: true });
      toast("Gmail отключён");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle
        icon={Mail}
        right={
          status !== "loading" && status.connected ? (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => navigate("/mail")}>Открыть почту</Button>
              <Button variant="ghost" size="sm" onClick={disconnect} disabled={busy}>Отключить</Button>
            </div>
          ) : status !== "loading" && status.configured ? (
            <Button size="sm" asChild>
              <a href={gmailConnectUrl()}>Подключить Gmail</a>
            </Button>
          ) : undefined
        }
      >
        Gmail
      </SectionTitle>
      {status === "loading" ? (
        <Hint>Проверяю…</Hint>
      ) : status.connected ? (
        <Hint tone="success">
          Подключено: {status.email ?? "аккаунт Google"}{typeof status.unread === "number" ? ` · непрочитанных: ${status.unread}` : ""}. Чтение,
          звёзды, архив, «→ Задача» и «→ Встреча» — на странице «Почта»; ассистент ищет и читает письма по запросу.
        </Hint>
      ) : !status.configured ? (
        <Hint tone="risk">
          {status.reason} Нужны <code className="rounded bg-secondary px-1">GOOGLE_CLIENT_ID</code>, <code className="rounded bg-secondary px-1">GOOGLE_CLIENT_SECRET</code>,{" "}
          <code className="rounded bg-secondary px-1">SUPABASE_SERVICE_ROLE_KEY</code> в Vercel и таблица из <code className="rounded bg-secondary px-1">supabase/integrations.sql</code>.
        </Hint>
      ) : (
        <Hint>{status.reason ?? "Почта не подключена."} Для аккаунта Google Workspace сделайте OAuth-приложение типа Internal — без верификации и с вечным refresh-токеном.</Hint>
      )}
    </div>
  );
}
