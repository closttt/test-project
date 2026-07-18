import { useEffect, useRef, useState } from "react";
import { Moon, Sun, AlertTriangle, Trash2, Download, Upload, Bell, Trophy, Timer, Volume2, LayoutList, GripVertical, RotateCcw, FileSpreadsheet, Bot, Eye, EyeOff, CalendarClock, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FilterChip } from "@/components/ui/filter-chip";
import { Segmented } from "@/components/ui/segmented";
import { isSupabaseConfigured } from "@/lib/supabase";
import { drainIncomingMeetings } from "@/lib/meetingSync";
import { isPushConfigured, currentSubscription, subscribeToPush, unsubscribeFromPush, syncReminders } from "@/lib/push";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { StaggerList, StaggerItem } from "@/components/motion/Stagger";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { cn } from "@/lib/utils";
import { migrate } from "@/lib/storage";
import { collectAttachmentIds, exportAttachmentBlobs, importAttachmentBlobs, type AttachmentBlobDump } from "@/lib/attachments";
import { requestNotifications, notificationsEnabled, notificationPermission } from "@/lib/reminders";
import { NAV_ITEMS, loadNavOrder, saveNavOrder, loadNavHidden, saveNavHidden, resetNav } from "@/lib/navConfig";
import { NAV_CHANGED_EVENT } from "@/components/layout/Sidebar";
import { PROVIDER_PRESETS, loadAiConfig, saveAiConfig, clearAiConfig, isAiConfigured } from "@/lib/ai";
import { ACCENTS, type AppData, type Theme, type Accent, type Density, type EffectsLevel } from "@/types";

type ExportRange = "all" | 7 | 30 | 90;

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const data = useData();
  const { settings, updateSettings, replaceAll, gamification, updateGamification, addMeeting } = data;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Calendar-invite inbox: same drain the background poller uses, but on demand — and here we
  // surface the real error instead of swallowing it, so a missing table/RLS is diagnosable.
  const supabaseOn = isSupabaseConfigured();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState(false);
  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const { imported, firstTitle } = await drainIncomingMeetings(addMeeting);
      setSyncErr(false);
      setSyncMsg(
        imported === 0
          ? "Новых приглашений нет — очередь пуста."
          : imported === 1
            ? `Импортирована встреча: ${firstTitle}`
            : `Импортировано встреч: ${imported}`
      );
      if (imported > 0) toast(`Импортировано встреч: ${imported}`);
    } catch (e) {
      setSyncErr(true);
      setSyncMsg(e instanceof Error ? e.message : "Не удалось синхронизировать");
    } finally {
      setSyncing(false);
    }
  }
  const [notifOn, setNotifOn] = useState(notificationsEnabled());
  const [notifPermission, setNotifPermission] = useState(notificationPermission());

  // Web Push — reminders with the tab closed. Needs Supabase + VAPID key + the deployed function.
  const pushReady = isPushConfigured();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushErr, setPushErr] = useState(false);
  useEffect(() => {
    if (pushReady) currentSubscription().then((s) => setPushOn(!!s));
  }, [pushReady]);
  async function togglePush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
        setPushErr(false);
        setPushMsg("Пуш отключён — напоминания снова только при открытой вкладке.");
      } else {
        await subscribeToPush();
        await syncReminders(data.allTasks);
        setPushOn(true);
        setPushErr(false);
        setPushMsg("Пуш включён. Напоминания долетят даже при закрытой вкладке.");
      }
    } catch (e) {
      setPushErr(true);
      setPushMsg(e instanceof Error ? e.message : "Не удалось изменить подписку");
    } finally {
      setPushBusy(false);
    }
  }
  const [confirmReset, setConfirmReset] = useState(false);
  const savedAi = loadAiConfig();
  const [aiProvider, setAiProvider] = useState(() => PROVIDER_PRESETS.find((p) => p.baseUrl === savedAi?.baseUrl)?.id ?? "ollama");
  const [aiBaseUrl, setAiBaseUrl] = useState(savedAi?.baseUrl ?? PROVIDER_PRESETS[0].baseUrl);
  const [aiModel, setAiModel] = useState(savedAi?.model ?? PROVIDER_PRESETS[0].defaultModel);
  const [aiKey, setAiKey] = useState(savedAi?.apiKey ?? "");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaved, setAiSaved] = useState(isAiConfigured());

  // Every other control on this page applies instantly via updateSettings — this section was the
  // one island of "type it, then remember to press a separate button", so an unsaved key silently
  // vanished the moment the user navigated away. Auto-persist as soon as all three fields are
  // filled, same as the rest of Settings; the explicit button below stays for a visible confirmation.
  function persistAiIfValid(next: { baseUrl?: string; apiKey?: string; model?: string } = {}) {
    const baseUrl = (next.baseUrl ?? aiBaseUrl).trim();
    const apiKey = (next.apiKey ?? aiKey).trim();
    const model = (next.model ?? aiModel).trim();
    if (!baseUrl || !apiKey || !model) return;
    saveAiConfig({ baseUrl, apiKey, model });
    setAiSaved(true);
  }

  function handleProviderChange(id: string) {
    setAiProvider(id);
    const preset = PROVIDER_PRESETS.find((p) => p.id === id)!;
    if (id !== "custom") {
      setAiBaseUrl(preset.baseUrl);
      setAiModel(preset.defaultModel);
      persistAiIfValid({ baseUrl: preset.baseUrl, model: preset.defaultModel });
    }
  }

  function saveAi() {
    if (!aiBaseUrl.trim() || !aiKey.trim() || !aiModel.trim()) {
      toast("Заполните endpoint, ключ и модель");
      return;
    }
    saveAiConfig({ baseUrl: aiBaseUrl.trim(), apiKey: aiKey.trim(), model: aiModel.trim() });
    setAiSaved(true);
    toast("Настройки ИИ сохранены");
  }

  function removeAi() {
    clearAiConfig();
    setAiKey("");
    setAiSaved(false);
    toast("Ключ ИИ удалён");
  }
  const [navOrder, setNavOrder] = useState(() => loadNavOrder());
  const [navHidden, setNavHidden] = useState(() => loadNavHidden());
  const [exportRange, setExportRange] = useState<ExportRange>("all");

  function commitNav(order: string[], hidden: Set<string>) {
    setNavOrder(order);
    setNavHidden(hidden);
    saveNavOrder(order);
    saveNavHidden(hidden);
    window.dispatchEvent(new Event(NAV_CHANGED_EVENT));
  }

  function moveNavItem(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = navOrder.indexOf(fromId);
    const to = navOrder.indexOf(toId);
    if (from === -1 || to === -1) return;
    const next = [...navOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitNav(next, navHidden);
  }

  function toggleNavHidden(id: string) {
    const next = new Set(navHidden);
    next.has(id) ? next.delete(id) : next.add(id);
    commitNav(navOrder, next);
  }

  function resetNavConfig() {
    resetNav();
    commitNav(loadNavOrder(), loadNavHidden());
    toast("Порядок навигации сброшен");
  }

  function rangeCutoffIso(range: ExportRange): string | null {
    if (range === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - range);
    return d.toISOString();
  }

  function exportTasksCsv() {
    const cutoff = rangeCutoffIso(exportRange);
    const rows = data.allTasks.filter((t) => !cutoff || t.createdAt >= cutoff || (t.completedAt ?? "") >= cutoff);
    downloadCsv(`crm-tasks-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Название", "Проект", "Приоритет", "Срок", "Выполнено", "Затрачено (мин)", "Создано", "Завершено"],
      ...rows.map((t) => [
        t.title,
        data.allProjects.find((p) => p.id === t.projectId)?.name ?? "",
        t.priority,
        t.dueDate ?? "",
        t.done ? "да" : "нет",
        t.spentMin,
        t.createdAt,
        t.completedAt ?? "",
      ]),
    ]);
    toast(`Выгружено задач: ${rows.length}`);
  }

  function exportFocusCsv() {
    const cutoff = rangeCutoffIso(exportRange);
    const rows = (data.pomodoroSessions ?? []).filter((s) => !cutoff || s.startedAt >= cutoff);
    downloadCsv(`crm-focus-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Дата", "Тип", "Минуты", "Задача", "Начало"],
      ...rows.map((s) => [
        s.date,
        s.kind === "work" ? "фокус" : "перерыв",
        s.minutes,
        data.allTasks.find((t) => t.id === s.taskId)?.title ?? "",
        s.startedAt,
      ]),
    ]);
    toast(`Выгружено сессий: ${rows.length}`);
  }

  async function enableNotifications() {
    const res = await requestNotifications();
    setNotifOn(res === "granted");
    setNotifPermission(res);
    toast(res === "granted" ? "Уведомления включены" : "Уведомления не разрешены браузером");
  }

  function doResetData() {
    localStorage.removeItem("crm-taskmanager-data-v1");
    location.reload();
  }

  async function exportData() {
    const payload: AppData = {
      clients: data.clients,
      students: data.students,
      projects: data.allProjects,
      tasks: data.allTasks,
      notes: data.allNotes,
      meetings: data.meetings,
      settings: data.settings,
      completionLog: data.completionLog,
      gamification: data.gamification,
      pomodoroSessions: data.pomodoroSessions,
    };
    // Attachment blobs live in IndexedDB, not AppData — bundle them into the same file so a
    // restore on another device doesn't come back with every photo/file/cover missing.
    const attachmentIds = collectAttachmentIds(data.allTasks, data.allProjects);
    const attachmentBlobs = attachmentIds.length > 0 ? await exportAttachmentBlobs(attachmentIds) : undefined;
    const full: AppData & { attachmentBlobs?: Record<string, AttachmentBlobDump> } = attachmentBlobs
      ? { ...payload, attachmentBlobs }
      : payload;
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(attachmentIds.length > 0 ? `Данные выгружены в JSON (вложений: ${attachmentIds.length})` : "Данные выгружены в JSON");
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData & { attachmentBlobs?: Record<string, AttachmentBlobDump> };
        if (!parsed.tasks) throw new Error("bad shape");
        // Backfill any fields missing from an older backup before adopting it.
        replaceAll(migrate(parsed));
        if (parsed.attachmentBlobs) await importAttachmentBlobs(parsed.attachmentBlobs);
        toast("Данные загружены из файла");
      } catch {
        toast("Не удалось прочитать файл — проверьте формат");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const themes: { value: Theme; label: string; icon: typeof Moon }[] = [
    { value: "dark", label: "Тёмная", icon: Moon },
    { value: "light", label: "Светлая", icon: Sun },
  ];

  return (
    <AppShell title="Настройки" description="Порог зоны риска, тема и данные">
      <StaggerList className="flex max-w-2xl flex-col gap-4">
        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" /> AI-ассистент
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Живой ИИ поверх ваших реальных данных (задачи, проекты, фокус). Ключ хранится
                отдельно от остальных данных и никогда не попадает в JSON-экспорт.
              </p>
              <div className="grid gap-1.5">
                <Label>Провайдер</Label>
                <Select value={aiProvider} onValueChange={handleProviderChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {PROVIDER_PRESETS.find((p) => p.id === aiProvider)?.keyHint}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ai-key">API-ключ</Label>
                <div className="relative">
                  <Input
                    id="ai-key"
                    type={showAiKey ? "text" : "password"}
                    value={aiKey}
                    onChange={(e) => { const v = e.target.value; setAiKey(v); persistAiIfValid({ apiKey: v }); }}
                    placeholder="Вставьте ключ"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAiKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-model">Модель</Label>
                  <Input id="ai-model" value={aiModel} onChange={(e) => { const v = e.target.value; setAiModel(v); persistAiIfValid({ model: v }); }} placeholder="напр. tencent/hy3:free" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ai-url">Endpoint (base URL)</Label>
                  <Input
                    id="ai-url"
                    value={aiBaseUrl}
                    onChange={(e) => { const v = e.target.value; setAiBaseUrl(v); persistAiIfValid({ baseUrl: v }); }}
                    disabled={aiProvider !== "custom"}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveAi}>Сохранить</Button>
                {aiSaved && (
                  <Button variant="ghost" size="sm" className="text-risk hover:text-risk" onClick={removeAi}>
                    <Trash2 className="h-4 w-4" /> Удалить ключ
                  </Button>
                )}
                {aiSaved && <span className="text-xs text-success">Настроено</span>}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" /> Порог «зоны риска» клиента
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Клиент без активности дольше порога подсвечивается на дашборде. Рекомендация: 14 дней
                «внимание», 30 дней «риск».
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="s-attention">«Внимание», дней</Label>
                  <Input
                    id="s-attention"
                    type="number"
                    min={1}
                    value={settings.riskAttentionDays}
                    onChange={(e) =>
                      updateSettings({ riskAttentionDays: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="s-risk">«Риск», дней</Label>
                  <Input
                    id="s-risk"
                    type="number"
                    min={1}
                    value={settings.riskRiskDays}
                    onChange={(e) =>
                      updateSettings({ riskRiskDays: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bell className="h-4 w-4" /> Уведомления
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Напоминания по задачам и встречам всплывают в приложении. Разрешите браузерные
                уведомления, чтобы получать их и когда вкладка неактивна.
              </p>
              {notifOn ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <Bell className="h-4 w-4" /> Браузерные уведомления включены
                </p>
              ) : notifPermission === "denied" ? (
                <p className="text-sm text-risk">
                  Уведомления заблокированы в браузере — кнопка здесь их больше не запросит.
                  Разрешите сайту уведомления через значок замка/настроек рядом с адресной строкой,
                  затем обновите страницу.
                </p>
              ) : (
                <Button variant="outline" size="sm" className="self-start" onClick={enableNotifications}>
                  <Bell className="h-4 w-4" /> Включить уведомления
                </Button>
              )}

              {/* Web Push — the only way a reminder can fire with the tab CLOSED. */}
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm">
                    <span className={cn("h-1.5 w-1.5 rounded-full", pushOn ? "bg-success" : "bg-muted-foreground")} />
                    Пуш при закрытой вкладке {pushOn && <span className="text-success">— включён</span>}
                  </p>
                  {pushReady && (
                    <Button variant="outline" size="sm" className="h-7" onClick={togglePush} disabled={pushBusy}>
                      {pushBusy ? "…" : pushOn ? "Отключить" : "Включить пуш"}
                    </Button>
                  )}
                </div>
                {!pushReady ? (
                  <p className="text-xs text-muted-foreground/70">
                    Недоступно: нужен Supabase и <code className="rounded bg-secondary px-1 py-0.5">VITE_VAPID_PUBLIC_KEY</code> в{" "}
                    <code className="rounded bg-secondary px-1 py-0.5">.env.local</code>, плюс развёрнутая функция{" "}
                    <code className="rounded bg-secondary px-1 py-0.5">send-reminders</code>. Без этого напоминания
                    работают только при открытой вкладке.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/70">
                    <strong className="text-muted-foreground">Что уезжает с устройства:</strong> только заголовок задачи
                    и время напоминания — и только для задач с напоминанием. Записи удаляются сразу после отправки.
                    Ни описаний, ни проектов, ни клиентов. Это не облако-синк.
                  </p>
                )}
                {pushMsg && <p className={cn("text-xs", pushErr ? "text-risk" : "text-muted-foreground")}>{pushMsg}</p>}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" /> Приглашения на встречи
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground/70">
                Пересылаешь приглашение (Google Calendar / Zoom / Teams) в Telegram-бота Hermes — он
                разбирает его и кладёт в очередь, а CRM забирает встречу к себе. Раз в минуту автоматически.
                Ссылка на созвон подхватывается из тела приглашения — отдельная интеграция с Zoom не нужна.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/40 px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className={cn("h-1.5 w-1.5 rounded-full", supabaseOn ? "bg-success" : "bg-muted-foreground")} />
                  {supabaseOn ? "Supabase подключён" : "Supabase не настроен"}
                </span>
                {supabaseOn && (
                  <Button variant="outline" size="sm" className="h-7" onClick={syncNow} disabled={syncing}>
                    <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                    {syncing ? "Синхронизация…" : "Синхронизировать сейчас"}
                  </Button>
                )}
              </div>

              {syncMsg && (
                <p className={cn("text-xs", syncErr ? "text-risk" : "text-muted-foreground")}>{syncMsg}</p>
              )}

              {supabaseOn && (
                <p className="text-xs text-muted-foreground/70">
                  Если синхронизация ругается на таблицу — прогоните{" "}
                  <code className="rounded bg-secondary px-1 py-0.5">supabase/incoming_meetings.sql</code> в
                  Supabase → SQL Editor. Это разово.
                </p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Volume2 className="h-4 w-4" /> Звук, тихие часы и корзина
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Звук «чпок» при закрытии задачи</p>
                <Switch checked={settings.soundEnabled} onCheckedChange={(v) => updateSettings({ soundEnabled: v })} aria-label="Звук" />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Эффекты при закрытии задачи</p>
                  <Segmented<EffectsLevel>
                    ariaLabel="Интенсивность эффектов"
                    value={settings.effects ?? "full"}
                    onChange={(v) => updateSettings({ effects: v })}
                    options={[
                      { value: "full", label: "Полные", title: "Вспышка, конфетти, +XP, живой огонёк" },
                      { value: "subtle", label: "Сдержанные", title: "То же, но тише и меньше" },
                      { value: "off", label: "Выкл.", title: "Без анимаций — XP и стрик считаются как обычно" },
                    ]}
                  />
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Вспышка на чекбоксе, +XP от точки клика, конфетти и мерцание стрика. XP и статистика
                  начисляются в любом случае — меняется только анимация.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">План дня — сколько задач это «реально»</p>
                  <Segmented<string>
                    ariaLabel="Лимит задач на день"
                    value={String(settings.dailyFocusLimit ?? 0)}
                    onChange={(v) => updateSettings({ dailyFocusLimit: Number(v) })}
                    options={[
                      { value: "0", label: "Выкл." },
                      { value: "3", label: "3" },
                      { value: "5", label: "5" },
                      { value: "6", label: "6" },
                    ]}
                  />
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Метод Иви Ли: в день реально закрыть 3–6 важных задач. Всё сверх лимита на дашборде
                  бледнеет и получает кнопку «Перенести на завтра» — ничего не переносится само.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Тихие часы — не показывать напоминания</p>
                  <Switch checked={settings.quietEnabled} onCheckedChange={(v) => updateSettings({ quietEnabled: v })} aria-label="Тихие часы" />
                </div>
                {settings.quietEnabled && (
                  <div className="grid max-w-xs grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="quiet-from">С (час)</Label>
                      <Input id="quiet-from" type="number" min={0} max={23} value={settings.quietFrom}
                        onChange={(e) => updateSettings({ quietFrom: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="quiet-to">До (час)</Label>
                      <Input id="quiet-to" type="number" min={0} max={23} value={settings.quietTo}
                        onChange={(e) => updateSettings({ quietTo: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid max-w-xs gap-1.5">
                <Label htmlFor="purge-days">Авто-очистка архива, дней (0 — хранить всегда)</Label>
                <Input id="purge-days" type="number" min={0} value={settings.trashPurgeDays}
                  onChange={(e) => updateSettings({ trashPurgeDays: Math.max(0, Number(e.target.value) || 0) })} />
                <p className="text-xs text-muted-foreground">Архивные задачи/проекты/заметки старше N дней удаляются навсегда при запуске.</p>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Trophy className="h-4 w-4" /> Геймификация
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Уровни, XP, стрик и достижения</p>
                <Switch checked={gamification.enabled} onCheckedChange={(v) => updateGamification({ enabled: v })} aria-label="Геймификация" />
              </div>
              {gamification.enabled && (
                <div className="grid max-w-xs gap-1.5">
                  <Label htmlFor="daily-goal">Цель по задачам в день</Label>
                  <Input
                    id="daily-goal"
                    type="number"
                    min={1}
                    value={gamification.dailyGoal}
                    onChange={(e) => updateGamification({ dailyGoal: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="h-4 w-4" /> Помодоро
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {([
                  ["workMin", "Фокус, мин"],
                  ["shortBreakMin", "Перерыв, мин"],
                  ["longBreakMin", "Большой, мин"],
                  ["roundsBeforeLong", "Раундов"],
                ] as [keyof typeof settings.pomodoro, string][]).map(([key, label]) => (
                  <div key={key} className="grid gap-1.5">
                    <Label htmlFor={`pomo-${key}`}>{label}</Label>
                    <Input
                      id={`pomo-${key}`}
                      type="number"
                      min={1}
                      value={settings.pomodoro[key] as number}
                      onChange={(e) =>
                        updateSettings({
                          pomodoro: { ...settings.pomodoro, [key]: Math.max(1, Number(e.target.value) || 1) },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Автостарт следующей фазы</p>
                <Switch
                  checked={settings.pomodoro.autostart}
                  onCheckedChange={(v) => updateSettings({ pomodoro: { ...settings.pomodoro, autostart: v } })}
                  aria-label="Автостарт помодоро"
                />
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Оформление</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label>Тема</Label>
                <div className="flex gap-2">
                  {themes.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => updateSettings({ theme: value })}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors",
                        settings.theme === value ? "border-foreground bg-secondary" : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Акцентный цвет</Label>
                <div className="flex gap-2">
                  {(Object.keys(ACCENTS) as Accent[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => updateSettings({ accent: a })}
                      title={ACCENTS[a].label}
                      className={cn(
                        "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                        settings.accent === a ? "border-foreground" : "border-transparent"
                      )}
                      style={{ background: ACCENTS[a].swatch }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Плотность</Label>
                <div className="flex gap-2">
                  {([["comfortable", "Просторно"], ["compact", "Компактно"]] as [Density, string][]).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => updateSettings({ density: v })}
                      className={cn(
                        "flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                        settings.density === v ? "border-foreground bg-secondary" : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <LayoutList className="h-4 w-4" /> Навигация
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Перетащите разделы, чтобы поменять порядок в сайдбаре. Переключателем — скрыть ненужные.
              </p>
              <div className="flex flex-col gap-1">
                {navOrder.map((id) => {
                  const item = NAV_ITEMS.find((n) => n.id === id);
                  if (!item) return null;
                  const isHidden = navHidden.has(id);
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-nav-item", id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const from = e.dataTransfer.getData("application/x-nav-item");
                        if (from) moveNavItem(from, id);
                      }}
                      className={cn(
                        "flex cursor-grab items-center gap-2 rounded-md border border-border px-3 py-2 text-sm active:cursor-grabbing",
                        isHidden && "opacity-50"
                      )}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      <span className="flex-1">{item.label}</span>
                      <Switch checked={!isHidden} onCheckedChange={() => toggleNavHidden(id)} aria-label={`Показывать «${item.label}»`} />
                    </div>
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" className="self-start" onClick={resetNavConfig}>
                <RotateCcw className="h-4 w-4" /> Сбросить порядок
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>

        {data.settings.projectTemplates.length > 0 && (
          <StaggerItem>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Шаблоны проектов</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Сохраняются кнопкой «Сохранить как шаблон» на странице проекта; доступны при создании нового.
                </p>
                {data.settings.projectTemplates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="truncate">{t.name} <span className="text-xs text-muted-foreground">· {t.tasks.length} задач, {t.sections.length} секций</span></span>
                    <button
                      onClick={() => data.deleteProjectTemplate(t.id)}
                      className="shrink-0 text-muted-foreground/60 hover:text-risk"
                      title="Удалить шаблон"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </StaggerItem>
        )}

        {data.settings.checklistTemplates.length > 0 && (
          <StaggerItem>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Шаблоны чек-листов</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Сохраняются кнопкой «В шаблон» у подзадач в карточке задачи; доступны там же через «Шаблон».
                </p>
                {data.settings.checklistTemplates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="truncate">{t.name} <span className="text-xs text-muted-foreground">· {t.items.length} пунктов</span></span>
                    <button
                      onClick={() => data.deleteChecklistTemplate(t.id)}
                      className="shrink-0 text-muted-foreground/60 hover:text-risk"
                      title="Удалить шаблон"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </StaggerItem>
        )}

        <StaggerItem>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Данные</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Все данные хранятся локально в браузере. Синхронизации между устройствами пока нет —
                выгрузите бэкап в JSON, чтобы не потерять.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Период для CSV:</span>
                {([["all", "Всё время"], [7, "7 дн."], [30, "30 дн."], [90, "90 дн."]] as [ExportRange, string][]).map(([v, label]) => (
                  <FilterChip
                    key={String(v)}
                    active={exportRange === v}
                    onClick={() => setExportRange(v)}
                  >
                    {label}
                  </FilterChip>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={exportTasksCsv}>
                  <FileSpreadsheet className="h-4 w-4" /> Задачи → CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportFocusCsv}>
                  <FileSpreadsheet className="h-4 w-4" /> Фокус → CSV
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={exportData}>
                  <Download className="h-4 w-4" /> Выгрузить JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Загрузить JSON
                </Button>
                <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importData} />
              </div>
              <Button variant="ghost" size="sm" className="self-start text-risk hover:text-risk" onClick={() => setConfirmReset(true)}>
                <Trash2 className="h-4 w-4" /> Сбросить к демо-данным
              </Button>
            </CardContent>
          </Card>
        </StaggerItem>

        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="Удалить все локальные данные?"
          description="Вернётся демо-набор. Это необратимо — экспортируйте JSON заранее, если нужна резервная копия."
          confirmLabel="Удалить всё"
          onConfirm={doResetData}
        />
      </StaggerList>
    </AppShell>
  );
}
