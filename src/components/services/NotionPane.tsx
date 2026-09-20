import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, FileText, RefreshCw, Search, Star, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { loadNotionTarget, notionSearch, saveNotionTarget, type NotionTarget } from "@/lib/notion";
import { syncedAgo, type ServiceState } from "@/lib/services";

/**
 * Notion inside the hub. Read-only on purpose: writing happens through the assistant («закинь это
 * в Notion»), so this pane answers the other question — what is actually connected, and which page
 * new notes land on. Picking a target here is the same setting Settings → Интеграции edits.
 */
export function NotionPane({ state }: { state?: ServiceState }) {
  const navigate = useNavigate();
  const [pages, setPages] = useState<NotionTarget[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [target, setTarget] = useState<NotionTarget | null>(() => loadNotionTarget());

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setPages(await notionSearch(q));
      setSyncedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state?.connected) void load("");
  }, [state?.connected, load]);

  function pick(p: NotionTarget) {
    const next = target?.id === p.id ? null : p;
    setTarget(next);
    saveNotionTarget(next);
  }

  if (!state?.connected) {
    return (
      <EmptyState
        icon={FileText}
        title="Notion не подключён"
        description={state?.reason ?? "Добавьте NOTION_TOKEN в переменные Vercel и дайте интеграции доступ к нужным страницам. После этого выберите здесь страницу по умолчанию — туда ассистент будет складывать заметки."}
        actionLabel="Открыть настройки"
        onAction={() => navigate("/settings")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void load(query.trim()); }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по страницам и базам…" className="pl-8" aria-label="Поиск по Notion" />
        </div>
        <Button variant="outline" size="icon" type="button" onClick={() => void load(query.trim())} disabled={loading} title="Обновить" aria-label="Обновить">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </form>

      {error && <p className="rounded-md border border-risk/30 bg-risk/10 px-3 py-2 text-xs text-risk">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border">
        {loading && pages.length === 0 ? (
          <div className="flex h-28 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : pages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Интеграции не дали доступ ни к одной странице. В Notion откройте нужную страницу → «…» → Connections → выберите свою интеграцию.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pages.map((p) => {
              const isTarget = target?.id === p.id;
              return (
                <li key={p.id} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/40">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary/60 text-muted-foreground">
                    {p.kind === "database" ? <Table2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{p.title || "Без названия"}</span>
                    <span className="block text-xs text-muted-foreground">{p.kind === "database" ? "База" : "Страница"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    title={isTarget ? "Сейчас сюда пишет ассистент — снять" : "Сделать страницей по умолчанию для ассистента"}
                    aria-label={isTarget ? "Снять страницу по умолчанию" : "Сделать страницей по умолчанию"}
                    className={cn("shrink-0 rounded p-1 transition-colors", isTarget ? "text-amber-400" : "text-muted-foreground/40 hover:text-foreground")}
                  >
                    <Star className={cn("h-4 w-4", isTarget && "fill-current")} />
                  </button>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-brand" title="Открыть в Notion">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{syncedAgo(syncedAt)}</span>
        <span className="ml-auto">
          {target ? (
            <>Ассистент пишет в <span className="text-foreground">{target.title}</span></>
          ) : (
            <>Страница по умолчанию не выбрана — отметьте звёздочкой, иначе ассистент не сможет писать</>
          )}
        </span>
        <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">Настройки</Link>
      </div>
    </div>
  );
}
