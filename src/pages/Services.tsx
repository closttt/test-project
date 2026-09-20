import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalLink, Plug, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SERVICES,
  loadActiveService,
  saveActiveService,
  serviceById,
  type ServiceId,
  type ServiceState,
} from "@/lib/services";
import { ServiceLogo } from "@/components/services/ServiceLogo";
import { ServiceTile, AddServiceTile } from "@/components/services/ServiceTile";
import { NotionPane } from "@/components/services/NotionPane";
import Mail from "@/pages/Mail";

/**
 * «Сервисы» — one section for every connected tool instead of a nav item per tool. The active
 * tool fills the page, the rail of tiles underneath switches between them, and «Добавить» shows
 * what could be connected next. Adding a tool means one entry in `lib/services.ts` plus a pane.
 */
export default function Services() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("tool");
  const [active, setActive] = useState<ServiceId | "add">(() => (serviceById(fromUrl ?? "")?.available ? (fromUrl as ServiceId) : loadActiveService()));
  const [states, setStates] = useState<Partial<Record<ServiceId, ServiceState>>>({});
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const entries = await Promise.all(
      SERVICES.filter((s) => s.fetchState).map(async (s) => {
        try {
          return [s.id, await s.fetchState!()] as const;
        } catch (e) {
          return [s.id, { connected: false, configured: false, reason: e instanceof Error ? e.message : String(e) }] as const;
        }
      })
    );
    setStates(Object.fromEntries(entries));
    setRefreshing(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function select(id: ServiceId | "add") {
    setActive(id);
    if (id !== "add") saveActiveService(id);
    // Keep the URL shareable but tidy — one param, replaced not pushed.
    setParams(id === "add" ? {} : { tool: id }, { replace: true });
  }

  const meta = active === "add" ? undefined : serviceById(active);
  const state = active === "add" ? undefined : states[active];
  const connected = SERVICES.filter((s) => s.available);
  const planned = SERVICES.filter((s) => !s.available);

  return (
    <AppShell
      title="Сервисы"
      description="Почта, Notion и остальные подключённые инструменты в одном месте"
      actions={
        <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={refreshing} title="Обновить статусы" aria-label="Обновить статусы">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ── Active tool ─────────────────────────────────────────────────── */}
        <section className="min-w-0 rounded-xl border border-border bg-secondary/10 p-3 sm:p-4" aria-label="Активный инструмент">
          {active === "add" ? (
            <AddShelf />
          ) : meta ? (
            <>
              <header className="mb-3 flex flex-wrap items-center gap-3">
                <ServiceLogo id={meta.id} tint={meta.tint} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-medium">{meta.label}</h2>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
                        state?.connected ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", state?.connected ? "bg-success" : "bg-muted-foreground/40")} />
                      {state?.connected ? "Подключено" : "Не подключено"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{state?.account ?? meta.tagline}</p>
                </div>
                {!state?.connected && meta.connect && (
                  <ConnectButton meta={meta} />
                )}
              </header>
              {meta.id === "gmail" ? <Mail embedded /> : <NotionPane state={state} />}
            </>
          ) : null}
        </section>

        {/* ── Tile rail ───────────────────────────────────────────────────── */}
        <section aria-label="Подключённые инструменты" className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Подключённые инструменты</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {connected.map((s) => (
              <ServiceTile key={s.id} service={s} state={states[s.id]} active={active === s.id} onClick={() => select(s.id)} />
            ))}
            {planned.map((s) => (
              <ServiceTile key={s.id} service={s} state={states[s.id]} active={false} onClick={() => select("add")} />
            ))}
            <AddServiceTile active={active === "add"} onClick={() => select("add")} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ConnectButton({ meta }: { meta: NonNullable<ReturnType<typeof serviceById>> }) {
  const target = meta.connect!();
  if (target.href) {
    return (
      <Button size="sm" className="gap-1.5" asChild>
        <a href={target.href}>Подключить <ExternalLink className="h-3.5 w-3.5" /></a>
      </Button>
    );
  }
  return (
    <Button size="sm" className="gap-1.5" asChild>
      <a href={target.to}>Подключить</a>
    </Button>
  );
}

/** «Добавить» — what could join the hub next, honest about what isn't wired up yet. */
function AddShelf() {
  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-base font-medium">Добавить инструмент</h2>
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        {SERVICES.map((s) => (
          <div key={s.id} className={cn("flex items-center gap-3 rounded-lg border border-border p-3", !s.available && "opacity-60")}>
            <ServiceLogo id={s.id} tint={s.tint} className={cn("h-8 w-8", !s.available && "grayscale")} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{s.label}</p>
              <p className="truncate text-xs text-muted-foreground">{s.tagline}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{s.available ? "Готово" : "Скоро"}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground/70">
        Календарь и Диск — следующие в очереди: тот же вход через Google, что и у почты, так что подключение будет одним нажатием.
      </p>
    </div>
  );
}
