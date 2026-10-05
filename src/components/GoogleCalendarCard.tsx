import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Unplug, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatDateTime, localDayStr } from "@/lib/format";
import { GCAL_EVENT, getGcalStatus, getIcsUrl, maskIcsUrl, runCalendarSync, setIcsUrl, type GcalStatus } from "@/lib/gcal";

/**
 * Settings → «Google Календарь»: paste the calendar's secret iCal address once, and every meeting
 * flows into «Встречи» (and from there into the task list and the Planner), refreshed every
 * 5 minutes. The address is shown masked once saved — it is a read key to the whole calendar.
 */
export function GoogleCalendarCard() {
  const { applyCalendarSync } = useData();
  const { toast } = useToast();
  const [url, setUrl] = useState(() => getIcsUrl());
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<GcalStatus | null>(() => getGcalStatus());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => { setUrl(getIcsUrl()); setStatus(getGcalStatus()); };
    window.addEventListener(GCAL_EVENT, on);
    return () => window.removeEventListener(GCAL_EVENT, on);
  }, []);

  async function sync(announce: boolean) {
    setBusy(true);
    try {
      const r = await runCalendarSync(applyCalendarSync);
      if (announce && r) toast(r.added ? `Google Календарь подключён: ${r.added} встреч` : "Google Календарь синхронизирован");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const v = draft.trim();
    if (!v) return;
    setIcsUrl(v);
    setDraft("");
    void sync(true);
  }

  function disconnect() {
    setIcsUrl("");
    // Upcoming imported meetings go with the calendar; past ones stay as history.
    const r = applyCalendarSync([], localDayStr());
    toast(r.removed ? `Календарь отключён, убрано будущих встреч: ${r.removed}` : "Календарь отключён");
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" /> Google Календарь
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {url ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-4 w-4" /> Подключён</span>
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{maskIcsUrl(url)}</code>
            </div>
            {status && (
              <p className={status.ok ? "text-xs text-muted-foreground" : "flex items-start gap-1.5 text-xs text-risk"}>
                {!status.ok && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                {formatDateTime(status.at)} — {status.message}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => sync(true)} disabled={busy}>
                <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Синхронизировать сейчас
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-risk hover:text-risk" onClick={disconnect}>
                <Unplug className="h-4 w-4" /> Отключить
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Встречи обновляются каждые 5 минут и попадают во «Встречи», в список задач и в Планер. Google отдаёт изменения по этой ссылке с задержкой — иногда до пары часов.
            </p>
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                Откройте{" "}
                <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand underline underline-offset-2">
                  настройки Google Календаря <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Слева в «Настройках моих календарей» выберите свой календарь</li>
              <li>Блок «Интеграция календаря» → скопируйте «Закрытый адрес в формате iCal»</li>
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                autoComplete="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                aria-label="Закрытый адрес календаря в формате iCal"
                className="sm:flex-1"
              />
              <Button onClick={save} disabled={!draft.trim() || busy}>Подключить</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ссылка хранится только в этом браузере и не уходит в облачную копию данных. Сами встречи синхронизируются на все устройства.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
