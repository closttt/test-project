/**
 * «Индекс» · Настройки — the site's settings pattern (refs 23 / 24): a quiet numbered index on the
 * first column, rows «label + description | control» on hairlines in the other three. Five everyday
 * groups; everything technical or rare (calendar, AI, integrations, sync, navigation, templates,
 * archive, appearance) folds into «06 Дополнительно».
 *
 * One lime element: the 2px marker of the section in view. Switches are white when on.
 *
 * Lab sandbox: everything that lives in the store (`useData`) works for real. Settings that the real
 * page keeps in this browser's localStorage (AI key, iCal address, sidebar order) or that call the
 * network with side effects (push, Gmail, logout) stay local to this preview — the lab shares the
 * origin with the dev app, and must not overwrite its keys.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatDateTime, localDayStr } from "@/lib/format";
import { migrate } from "@/lib/storage";
import { seedData } from "@/lib/seed";
import { isSupabaseConfigured } from "@/lib/supabase";
import { drainIncomingMeetings } from "@/lib/meetingSync";
import { isPushConfigured, currentSubscription } from "@/lib/push";
import { requestNotifications, notificationsEnabled, notificationPermission } from "@/lib/reminders";
import { NAV_ITEMS, loadNavOrder, loadNavHidden } from "@/lib/navConfig";
import { PROVIDER_PRESETS, loadAiConfig, isLocalOrInsecureEndpoint } from "@/lib/ai";
import { getIcsUrl, getGcalStatus, maskIcsUrl } from "@/lib/gcal";
import { fetchAuthStatus, type AuthStatus } from "@/lib/auth";
import { loadNotionTarget, isNotionConnected } from "@/lib/notion";
import { isGmailConnected, gmailAccountEmail } from "@/lib/gmail";
import { ACCENTS, type AppData, type Accent, type Density, type EffectsLevel, type Theme } from "@/types";
import { B, T, tab, pad2, Page, PageHeader, SectionHead, Button } from "@/design-lab/screens/_kit/index";

import { Switch, Seg, TextField, NumField, Select, TextAction, Row, Status, Disclosure, SubHead } from "./Settings.parts";

type ExportRange = "all" | 7 | 30 | 90;

const SECTIONS = [
  { id: "day", title: "Рабочий день" },
  { id: "pomodoro", title: "Помодоро" },
  { id: "notify", title: "Уведомления" },
  { id: "feedback", title: "Отклик" },
  { id: "data", title: "Данные" },
  { id: "more", title: "Дополнительно" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const SECTION_IDS = SECTIONS.map((s) => s.id);

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

export default function Settings() {
  const data = useData();
  const { settings, updateSettings, gamification, updateGamification } = data;
  const { toast } = useToast();
  const active = useScrollSpy(SECTION_IDS);

  // ── Notifications ──────────────────────────────────────────────────────────────────────────
  const [notifOn, setNotifOn] = useState(notificationsEnabled());
  const [notifPermission, setNotifPermission] = useState(notificationPermission());
  const pushReady = isPushConfigured();
  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    if (pushReady) currentSubscription().then((s) => setPushOn(!!s));
  }, [pushReady]);

  async function enableNotifications() {
    const res = await requestNotifications();
    setNotifOn(res === "granted");
    setNotifPermission(res);
    toast(res === "granted" ? "Уведомления включены" : "Уведомления не разрешены браузером");
  }

  // ── Data ───────────────────────────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportRange, setExportRange] = useState<ExportRange>("all");
  const [confirmReset, setConfirmReset] = useState(false);

  const cutoffIso = (r: ExportRange) => {
    if (r === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - r);
    return d.toISOString();
  };

  function exportTasksCsv() {
    const cutoff = cutoffIso(exportRange);
    const rows = data.allTasks.filter((t) => !cutoff || t.createdAt >= cutoff || (t.completedAt ?? "") >= cutoff);
    downloadCsv(`crm-tasks-${localDayStr()}.csv`, [
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
    const cutoff = cutoffIso(exportRange);
    const rows = (data.pomodoroSessions ?? []).filter((s) => !cutoff || s.startedAt >= cutoff);
    downloadCsv(`crm-focus-${localDayStr()}.csv`, [
      ["Дата", "Тип", "Минуты", "Задача", "Начало"],
      ...rows.map((s) => [s.date, s.kind === "work" ? "фокус" : "перерыв", s.minutes, data.allTasks.find((t) => t.id === s.taskId)?.title ?? "", s.startedAt]),
    ]);
    toast(`Выгружено сессий: ${rows.length}`);
  }

  function exportJson() {
    // The real page also bundles attachment blobs from IndexedDB; the lab exports the data only.
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
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-backup-${localDayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Данные выгружены в JSON");
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData;
        if (!parsed.tasks) throw new Error("bad shape");
        data.replaceAll(migrate(parsed));
        toast("Данные загружены из файла");
      } catch {
        toast("Не удалось прочитать файл — проверьте формат");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const pomo = settings.pomodoro;
  const setPomo = (patch: Partial<typeof pomo>) => updateSettings({ pomodoro: { ...pomo, ...patch } });

  return (
    <Page>
      <PageHeader
        title="Настройки"
        deck="Всё применяется сразу. Редкое и техническое — в «Дополнительно» внизу."
        graphic="topo"
        seed={6}
      />

      <div className="mt-8 grid grid-cols-4 gap-x-5">
        {/* ── Local index ─────────────────────────────────────────────────────────────────── */}
        <nav aria-label="Разделы настроек" className="sticky top-8 self-start pr-5">
          <ol>
            {SECTIONS.map((s, i) => {
              const on = active === s.id;
              return (
                <li key={s.id}>
                  <a
                    href={`#set-${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(`set-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="group relative flex h-9 items-center gap-3 pl-4 outline-none transition-colors duration-200 focus-visible:bg-white/[0.04]"
                    style={{ color: on ? B.text : B.text3 }}
                  >
                    <span className="absolute inset-y-[10px] left-0 w-[2px] transition-opacity duration-200" style={{ background: B.lime, opacity: on ? 1 : 0 }} />
                    <span className="w-5" style={{ ...T.num, color: on ? B.text2 : B.off }}>{pad2(i + 1)}</span>
                    <span className="transition-colors duration-200 group-hover:text-white" style={T.body}>{s.title}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="col-span-3 min-w-0">
          {/* ── 01 Рабочий день ──────────────────────────────────────────────────────────── */}
          <Group id="day" n="01" title="Рабочий день" first>
            <Row
              label="План дня"
              desc="Сколько задач в день — это «реально» (метод Иви Ли). Всё сверх лимита на дашборде бледнеет и получает «Перенести на завтра»; само ничего не переносится."
            >
              <Seg
                label="Лимит задач на день"
                value={String(settings.dailyFocusLimit ?? 0)}
                onChange={(v) => updateSettings({ dailyFocusLimit: Number(v) })}
                options={[
                  { value: "0", label: "Выкл." },
                  { value: "3", label: "3" },
                  { value: "5", label: "5" },
                  { value: "6", label: "6" },
                ]}
              />
            </Row>
            <Row
              label="Зона риска клиента"
              desc="Клиент без активности дольше порога подсвечивается. Обычно 14 дней — «внимание», 30 — «риск»."
              last
            >
              <Labeled k="внимание">
                <NumField label="«Внимание», дней" min={1} value={settings.riskAttentionDays} onChange={(v) => updateSettings({ riskAttentionDays: v })} unit="дн." />
              </Labeled>
              <Labeled k="риск">
                <NumField label="«Риск», дней" min={1} value={settings.riskRiskDays} onChange={(v) => updateSettings({ riskRiskDays: v })} unit="дн." />
              </Labeled>
            </Row>
          </Group>

          {/* ── 02 Помодоро ──────────────────────────────────────────────────────────────── */}
          <Group id="pomodoro" n="02" title="Помодоро">
            <Row label="Интервалы" desc="Длина фокуса и перерывов, и сколько раундов до большого перерыва.">
              <Labeled k="фокус">
                <NumField label="Фокус, мин" min={1} value={pomo.workMin} onChange={(v) => setPomo({ workMin: v })} unit="мин" width={56} />
              </Labeled>
              <Labeled k="перерыв">
                <NumField label="Перерыв, мин" min={1} value={pomo.shortBreakMin} onChange={(v) => setPomo({ shortBreakMin: v })} unit="мин" width={56} />
              </Labeled>
              <Labeled k="большой">
                <NumField label="Большой перерыв, мин" min={1} value={pomo.longBreakMin} onChange={(v) => setPomo({ longBreakMin: v })} unit="мин" width={56} />
              </Labeled>
              <Labeled k="раунды">
                <NumField label="Раундов до большого" min={1} value={pomo.roundsBeforeLong} onChange={(v) => setPomo({ roundsBeforeLong: v })} width={56} />
              </Labeled>
            </Row>
            <Row label="Автостарт" desc="Следующая фаза начинается сама, без нажатия." last>
              <Switch label="Автостарт помодоро" on={pomo.autostart} onChange={(v) => setPomo({ autostart: v })} />
            </Row>
          </Group>

          {/* ── 03 Уведомления ───────────────────────────────────────────────────────────── */}
          <Group id="notify" n="03" title="Уведомления">
            <Row
              label="Браузерные уведомления"
              desc={
                notifPermission === "denied"
                  ? "Заблокированы в браузере. Разрешите их через значок замка у адресной строки и обновите страницу."
                  : "Напоминания по задачам и встречам — и когда вкладка неактивна."
              }
            >
              {notifOn ? (
                <Status tone="ok">Включены</Status>
              ) : notifPermission === "denied" ? (
                <Status tone="error">Заблокированы</Status>
              ) : (
                <Button variant="outline" size="sm" hook={false} onClick={enableNotifications}>
                  Разрешить
                </Button>
              )}
            </Row>
            <Row
              label="Пуш при закрытой вкладке"
              desc={
                pushReady
                  ? "С устройства уезжают только заголовок задачи и время напоминания; запись удаляется сразу после отправки."
                  : "Недоступно: нужны Supabase, VITE_VAPID_PUBLIC_KEY и функция send-reminders. Без них напоминания — только при открытой вкладке."
              }
            >
              <Switch label="Пуш при закрытой вкладке" on={pushOn} disabled={!pushReady} onChange={() => toast("В лаборатории подписка на пуш отключена")} />
            </Row>
            <Row
              label="Тихие часы"
              desc="В эти часы напоминания не показываются."
              last
              under={
                settings.quietEnabled ? (
                  <div className="flex justify-end gap-4">
                    <Labeled k="с">
                      <NumField label="Тихие часы с" min={0} max={23} value={settings.quietFrom} onChange={(v) => updateSettings({ quietFrom: v })} unit=":00" width={56} />
                    </Labeled>
                    <Labeled k="до">
                      <NumField label="Тихие часы до" min={0} max={23} value={settings.quietTo} onChange={(v) => updateSettings({ quietTo: v })} unit=":00" width={56} />
                    </Labeled>
                  </div>
                ) : undefined
              }
            >
              <Switch label="Тихие часы" on={settings.quietEnabled} onChange={(v) => updateSettings({ quietEnabled: v })} />
            </Row>
          </Group>

          {/* ── 04 Отклик ────────────────────────────────────────────────────────────────── */}
          <Group id="feedback" n="04" title="Отклик">
            <Row label="Звук при закрытии задачи" desc="Короткий мягкий «чпок».">
              <Switch label="Звук" on={settings.soundEnabled} onChange={(v) => updateSettings({ soundEnabled: v })} />
            </Row>
            <Row label="Эффекты" desc="Вспышка на чекбоксе, +XP, конфетти. XP и статистика считаются в любом случае — меняется только анимация.">
              <Seg<EffectsLevel>
                label="Интенсивность эффектов"
                value={settings.effects ?? "full"}
                onChange={(v) => updateSettings({ effects: v })}
                options={[
                  { value: "full", label: "Полные" },
                  { value: "subtle", label: "Сдержанные" },
                  { value: "off", label: "Выкл." },
                ]}
              />
            </Row>
            <Row
              label="Геймификация"
              desc="Уровни, XP, серия и достижения."
              last
              under={
                gamification.enabled ? (
                  <div className="grid gap-x-5 pt-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.25fr)", borderTop: `1px solid ${B.l5}` }}>
                    <div className="pr-6">
                      <div style={{ ...T.body, color: B.text2 }}>Цель по задачам в день</div>
                      <p className="mt-1.5" style={{ ...T.meta, color: B.text3 }}>
                        Отдельно от «Плана дня»: сколько закрыть, чтобы день засчитался в серию.
                      </p>
                    </div>
                    <div className="flex items-start justify-end">
                      <NumField label="Цель по задачам в день" min={1} value={gamification.dailyGoal} onChange={(v) => updateGamification({ dailyGoal: v })} unit="задач" />
                    </div>
                  </div>
                ) : undefined
              }
            >
              <Switch label="Геймификация" on={gamification.enabled} onChange={(v) => updateGamification({ enabled: v })} />
            </Row>
          </Group>

          {/* ── 05 Данные ────────────────────────────────────────────────────────────────── */}
          <Group id="data" n="05" title="Данные">
            <Row label="Таблицы CSV" desc="Задачи или фокус-сессии за выбранный период — для Excel и Google Таблиц.">
              <Seg<ExportRange>
                label="Период для CSV"
                value={exportRange}
                onChange={setExportRange}
                options={[
                  { value: "all", label: "Всё" },
                  { value: 7, label: "7 дн." },
                  { value: 30, label: "30 дн." },
                  { value: 90, label: "90 дн." },
                ]}
              />
              <span className="flex gap-2">
                <Button variant="outline" size="sm" hook={false} onClick={exportTasksCsv}>
                  Задачи
                </Button>
                <Button variant="outline" size="sm" hook={false} onClick={exportFocusCsv}>
                  Фокус
                </Button>
              </span>
            </Row>
            <Row label="Резервная копия" desc="Все данные одним JSON-файлом. Загрузка заменяет текущие данные целиком.">
              <Button variant="outline" size="sm" hook={false} onClick={exportJson}>
                Выгрузить
              </Button>
              <Button variant="outline" size="sm" hook={false} onClick={() => fileRef.current?.click()}>
                Загрузить
              </Button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importJson} />
            </Row>
            <Row label="Сброс к демо-данным" desc="Удаляет все данные и возвращает демо-набор. Необратимо — сначала выгрузите копию." last>
              {confirmReset ? (
                <>
                  <span style={{ ...T.meta, color: B.text3 }}>Удалить всё?</span>
                  <TextAction onClick={() => setConfirmReset(false)}>Отмена</TextAction>
                  <TextAction
                    danger
                    onClick={() => {
                      data.replaceAll(seedData());
                      setConfirmReset(false);
                      toast("Данные сброшены к демо-набору");
                    }}
                  >
                    Удалить всё
                  </TextAction>
                </>
              ) : (
                <TextAction danger onClick={() => setConfirmReset(true)}>
                  Сбросить
                </TextAction>
              )}
            </Row>
          </Group>

          {/* ── 06 Дополнительно ─────────────────────────────────────────────────────────── */}
          <section id="set-more" className="mt-20 scroll-mt-8">
            <SectionHead n="06" title="Дополнительно" />
            <div className="mt-6">
              <Disclosure title="Интеграции и редкое" meta="календарь, ИИ, синхронизация, навигация, шаблоны, архив, оформление">
                <Advanced />
              </Disclosure>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * «Дополнительно» — mounted only when opened (status probes run then, not on page load)
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function Advanced() {
  const data = useData();
  const { settings, updateSettings, cloudSync, cloudPushNow, cloudPullNow, addMeeting } = data;
  const { toast } = useToast();
  const lab = (what: string) => toast(`${what} — в лаборатории не сохраняется`);

  // Google Calendar (iCal address lives in this browser's localStorage — read only here).
  const icsUrl = getIcsUrl();
  const gcal = getGcalStatus();
  const [icsDraft, setIcsDraft] = useState("");

  // AI assistant — local to the preview.
  const savedAi = loadAiConfig();
  const [aiProvider, setAiProvider] = useState(() => PROVIDER_PRESETS.find((p) => p.baseUrl === savedAi?.baseUrl)?.id ?? "ollama");
  const [aiBaseUrl, setAiBaseUrl] = useState(savedAi?.baseUrl ?? PROVIDER_PRESETS[0].baseUrl);
  const [aiModel, setAiModel] = useState(savedAi?.model ?? PROVIDER_PRESETS[0].defaultModel);
  const [aiKey, setAiKey] = useState(savedAi?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const aiUnreachable = window.location.protocol === "https:" && isLocalOrInsecureEndpoint(aiBaseUrl);
  const preset = PROVIDER_PRESETS.find((p) => p.id === aiProvider);

  // Integrations — auth status is a pure GET; Notion/Gmail show the cached state (their live probes
  // write to localStorage, which the lab must not touch).
  const [auth, setAuth] = useState<AuthStatus | null | "loading">("loading");
  useEffect(() => {
    fetchAuthStatus().then(setAuth);
  }, []);
  const notionTarget = loadNotionTarget();
  const notionOn = isNotionConnected();
  const gmailOn = isGmailConnected();
  const gmailEmail = gmailAccountEmail();

  // Meeting invites (Hermes → Supabase queue).
  const supabaseOn = isSupabaseConfigured();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; err: boolean } | null>(null);
  async function drain() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const { imported, firstTitle } = await drainIncomingMeetings(addMeeting);
      setSyncMsg({
        err: false,
        text: imported === 0 ? "Новых приглашений нет." : imported === 1 ? `Импортирована встреча: ${firstTitle}` : `Импортировано встреч: ${imported}`,
      });
    } catch (e) {
      setSyncMsg({ err: true, text: e instanceof Error ? e.message : "Не удалось синхронизировать" });
    } finally {
      setSyncing(false);
    }
  }

  // Sidebar order + visibility — local to the preview.
  const [navOrder, setNavOrder] = useState(() => loadNavOrder());
  const [navHidden, setNavHidden] = useState(() => loadNavHidden());
  const moveNav = (id: string, dir: -1 | 1) => {
    const i = navOrder.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= navOrder.length) return;
    const next = [...navOrder];
    [next[i], next[j]] = [next[j], next[i]];
    setNavOrder(next);
  };

  const cloudText =
    cloudSync.state === "off"
      ? "Не настроено — нет ключей Supabase"
      : cloudSync.state === "idle"
        ? "Ожидание"
        : cloudSync.state === "syncing"
          ? "Синхронизация…"
          : cloudSync.state === "ok"
            ? `${cloudSync.direction === "pushed" ? "Выгружено в облако" : "Загружено из облака"} · ${formatDateTime(cloudSync.at)}`
            : cloudSync.state === "conflict"
              ? "Расхождение — выберите версию"
              : "Ошибка синхронизации";
  const cloudTone = cloudSync.state === "ok" ? "ok" : cloudSync.state === "error" || cloudSync.state === "conflict" ? "error" : "idle";

  return (
    <div className="pb-6">
      <SubHead>Google Календарь</SubHead>
      {icsUrl ? (
        <Row
          label="Встречи из календаря"
          desc={
            gcal ? (
              <span style={{ color: gcal.ok ? B.text3 : B.danger }}>
                {formatDateTime(gcal.at)} — {gcal.message}
              </span>
            ) : (
              "Обновляются каждые 5 минут и попадают во «Встречи», задачи и Планер."
            )
          }
        >
          <Status tone="ok">
            Подключён · <span style={tab}>{maskIcsUrl(icsUrl)}</span>
          </Status>
          <Button variant="outline" size="sm" hook={false} onClick={() => lab("Синхронизация календаря")}>
            Синхронизировать
          </Button>
          <TextAction danger onClick={() => lab("Отключение календаря")}>
            Отключить
          </TextAction>
        </Row>
      ) : (
        <Row
          label="Закрытый адрес iCal"
          desc="Настройки Google Календаря → ваш календарь → «Интеграция календаря» → «Закрытый адрес в формате iCal». Хранится только в этом браузере."
        >
          <TextField label="Закрытый адрес календаря" type="password" value={icsDraft} onChange={setIcsDraft} placeholder="https://calendar.google.com/…/basic.ics" onEnter={() => lab("Адрес календаря")} />
          <Button variant="outline" size="sm" hook={false} disabled={!icsDraft.trim()} onClick={() => lab("Адрес календаря")}>
            Подключить
          </Button>
        </Row>
      )}

      <SubHead>ИИ-ассистент</SubHead>
      <Row label="Провайдер" desc={preset?.keyHint}>
        <Select
          label="Провайдер"
          value={aiProvider}
          onChange={(id) => {
            setAiProvider(id);
            const p = PROVIDER_PRESETS.find((x) => x.id === id);
            if (p && id !== "custom") {
              setAiBaseUrl(p.baseUrl);
              setAiModel(p.defaultModel);
            }
          }}
          options={PROVIDER_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </Row>
      <Row label="API-ключ" desc="Хранится отдельно от данных и никогда не попадает в JSON-копию.">
        <TextField
          label="API-ключ"
          type={showKey ? "text" : "password"}
          value={aiKey}
          onChange={setAiKey}
          placeholder="Вставьте ключ"
          suffix={
            <button type="button" onClick={() => setShowKey((v) => !v)} className="px-1 outline-none hover:text-white" style={{ ...T.meta, color: B.text3 }}>
              {showKey ? "скрыть" : "показать"}
            </button>
          }
        />
      </Row>
      <Row
        label="Модель и endpoint"
        desc={
          aiUnreachable ? (
            <span style={{ color: B.danger }}>Этот endpoint (http или локальный) недоступен с задеплоенного сайта — выберите облачный провайдер по https.</span>
          ) : (
            "Любой OpenAI-совместимый /chat/completions."
          )
        }
        under={
          <div className="flex justify-end gap-4">
            {savedAi && <Status tone="ok">Настроено</Status>}
            {savedAi && (
              <TextAction danger onClick={() => lab("Удаление ключа")}>
                Удалить ключ
              </TextAction>
            )}
            <Button variant="outline" size="sm" hook={false} onClick={() => (aiBaseUrl.trim() && aiKey.trim() && aiModel.trim() ? lab("Настройки ИИ") : toast("Заполните endpoint, ключ и модель"))}>
              Сохранить
            </Button>
          </div>
        }
      >
        <TextField label="Модель" value={aiModel} onChange={setAiModel} placeholder="модель" width={140} />
        <TextField label="Endpoint" value={aiBaseUrl} onChange={setAiBaseUrl} disabled={aiProvider !== "custom"} width={220} />
      </Row>

      <SubHead>Интеграции</SubHead>
      <Row
        label="Вход в приложение"
        desc={
          auth === "loading"
            ? "Проверяю…"
            : auth === null
              ? "Сервер приложения не отвечает — статус входа неизвестен."
              : auth.required
                ? "Пароль включён; сессия устройства живёт год или до смены пароля."
                : "Пароль не задан — приложение открыто всем, у кого есть ссылка. Задайте APP_PASSWORD в переменных окружения."
        }
      >
        {auth !== "loading" && auth?.required ? (
          <TextAction onClick={() => lab("Выход")}>Выйти на этом устройстве</TextAction>
        ) : (
          <Status tone={auth === "loading" ? "idle" : auth === null ? "error" : "idle"}>{auth === "loading" ? "…" : auth === null ? "Нет ответа" : "Без пароля"}</Status>
        )}
      </Row>
      <Row
        label="Notion"
        desc={notionTarget ? <>Страница по умолчанию: <span style={{ color: B.text2 }}>{notionTarget.title}</span></> : "Сюда попадают заметки «→ в Notion» и страницы, которые создаёт ассистент."}
      >
        <Status tone={notionOn ? "ok" : "idle"}>{notionOn ? "Подключено" : "Не подключено"}</Status>
        {notionOn && <TextAction onClick={() => lab("Смена страницы Notion")}>Сменить</TextAction>}
      </Row>
      <Row label="Gmail" desc="Почта для ассистента: чтение, поиск, письма от вашего имени.">
        <Status tone={gmailOn ? "ok" : "idle"}>{gmailOn ? gmailEmail ?? "Подключено" : "Не подключено"}</Status>
        {gmailOn ? (
          <TextAction onClick={() => lab("Отключение Gmail")}>Отключить</TextAction>
        ) : (
          <Button variant="outline" size="sm" hook={false} onClick={() => lab("Подключение Gmail")}>
            Подключить
          </Button>
        )}
      </Row>

      <SubHead>Синхронизация</SubHead>
      <Row
        label="Облако"
        desc="Задачи, проекты, заметки, клиенты, встречи и настройки — одни и те же на всех устройствах. Запись сначала в браузер, следом в облако."
        under={
          cloudSync.state === "conflict" ? (
            <div className="flex flex-col items-end gap-3">
              <p className="max-w-[520px] text-right" style={{ ...T.meta, color: B.text3 }}>
                В облаке более свежая запись, но в ней меньше данных (<span style={tab}>{cloudSync.remoteCount}</span> против{" "}
                <span style={tab}>{cloudSync.localCount}</span> здесь). Ничего не применено автоматически.
              </p>
              <div className="flex gap-4">
                <TextAction danger onClick={cloudPullNow}>
                  Взять версию из облака
                </TextAction>
                <Button variant="outline" size="sm" hook={false} onClick={cloudPushNow}>
                  Оставить эти и перезаписать облако
                </Button>
              </div>
            </div>
          ) : cloudSync.state === "error" ? (
            <p className="text-right" style={{ ...T.meta, color: B.danger }}>{cloudSync.message}</p>
          ) : undefined
        }
      >
        <Status tone={cloudTone}>{cloudText}</Status>
        {cloudSync.state !== "off" && (
          <Button variant="outline" size="sm" hook={false} disabled={cloudSync.state === "syncing"} onClick={cloudPushNow}>
            Выгрузить сейчас
          </Button>
        )}
      </Row>
      <Row
        label="Приглашения на встречи"
        desc={
          syncMsg ? (
            <span style={{ color: syncMsg.err ? B.danger : B.text3 }}>{syncMsg.text}</span>
          ) : (
            "Пересланное в Telegram-бота Hermes приглашение попадает во «Встречи» — раз в минуту."
          )
        }
      >
        <Status tone={supabaseOn ? "ok" : "idle"}>{supabaseOn ? "Supabase подключён" : "Supabase не настроен"}</Status>
        {supabaseOn && (
          <Button variant="outline" size="sm" hook={false} disabled={syncing} onClick={drain}>
            {syncing ? "Синхронизация…" : "Проверить сейчас"}
          </Button>
        )}
      </Row>

      <SubHead>Навигация</SubHead>
      <Row
        label="Разделы сайдбара"
        desc="Порядок стрелками, видимость — переключателем."
        under={
          <ol className="ml-auto max-w-[560px]" style={{ borderTop: `1px solid ${B.l7}` }}>
            {navOrder.map((id, i) => {
              const item = NAV_ITEMS.find((n) => n.id === id);
              if (!item) return null;
              const hidden = navHidden.has(id);
              return (
                <li key={id} className="flex h-10 items-center gap-4" style={{ borderBottom: `1px solid ${B.l7}` }}>
                  <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                  <span className="flex-1 truncate" style={{ ...T.body, color: hidden ? B.text4 : B.text }}>{item.label}</span>
                  <Arrow label={`Выше: ${item.label}`} disabled={i === 0} onClick={() => moveNav(id, -1)} up />
                  <Arrow label={`Ниже: ${item.label}`} disabled={i === navOrder.length - 1} onClick={() => moveNav(id, 1)} />
                  <Switch
                    label={`Показывать «${item.label}»`}
                    on={!hidden}
                    onChange={() => {
                      const next = new Set(navHidden);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setNavHidden(next);
                    }}
                  />
                </li>
              );
            })}
          </ol>
        }
      >
        <TextAction
          onClick={() => {
            setNavOrder(NAV_ITEMS.map((n) => n.id));
            setNavHidden(new Set());
          }}
        >
          Сбросить порядок
        </TextAction>
      </Row>

      {(settings.projectTemplates.length > 0 || settings.checklistTemplates.length > 0) && (
        <>
          <SubHead>Шаблоны</SubHead>
          {settings.projectTemplates.length > 0 && (
            <Row label="Шаблоны проектов" desc="Сохраняются кнопкой «Сохранить как шаблон» на странице проекта." under={
              <TemplateList
                items={settings.projectTemplates.map((t) => ({ id: t.id, name: t.name, meta: `${t.tasks.length} задач · ${t.sections.length} секций` }))}
                onDelete={data.deleteProjectTemplate}
              />
            } />
          )}
          {settings.checklistTemplates.length > 0 && (
            <Row label="Шаблоны чек-листов" desc="Сохраняются кнопкой «В шаблон» у подзадач в карточке задачи." under={
              <TemplateList
                items={settings.checklistTemplates.map((t) => ({ id: t.id, name: t.name, meta: `${t.items.length} пунктов` }))}
                onDelete={data.deleteChecklistTemplate}
              />
            } />
          )}
        </>
      )}

      <SubHead>Архив и оформление</SubHead>
      <Row label="Авто-очистка архива" desc="Архивные задачи, проекты и заметки старше N дней удаляются навсегда при запуске. 0 — хранить всегда.">
        <NumField label="Авто-очистка архива, дней" min={0} value={settings.trashPurgeDays} onChange={(v) => updateSettings({ trashPurgeDays: v })} unit="дн." />
      </Row>
      <Row label="Тема" desc="Для текущей версии приложения. «Индекс» — только тёмный.">
        <Seg<Theme>
          label="Тема"
          value={settings.theme}
          onChange={(v) => updateSettings({ theme: v })}
          options={[
            { value: "dark", label: "Тёмная" },
            { value: "light", label: "Светлая" },
          ]}
        />
      </Row>
      <Row label="Акцент" desc="Для текущей версии приложения. В «Индексе» акцент один — лайм.">
        <Seg<Accent>
          label="Акцентный цвет"
          value={settings.accent}
          onChange={(v) => updateSettings({ accent: v })}
          options={(Object.keys(ACCENTS) as Accent[]).map((a) => ({ value: a, label: ACCENTS[a].label }))}
        />
      </Row>
      <Row label="Плотность" desc="Высота строк в списках текущей версии приложения." last>
        <Seg<Density>
          label="Плотность"
          value={settings.density}
          onChange={(v) => updateSettings({ density: v })}
          options={[
            { value: "comfortable", label: "Просторно" },
            { value: "compact", label: "Компактно" },
          ]}
        />
      </Row>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Local pieces
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function Group({ id, n, title, first, children }: { id: SectionId; n: string; title: string; first?: boolean; children: ReactNode }) {
  return (
    <section id={`set-${id}`} className={`scroll-mt-8 ${first ? "" : "mt-20"}`}>
      <SectionHead n={n} title={title} />
      <div className="mt-6" style={{ borderTop: `1px solid ${B.l10}` }}>
        {children}
      </div>
    </section>
  );
}

/** A control with a tiny grey caption above it («внимание», «фокус»…). */
function Labeled({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="inline-flex flex-col gap-1.5">
      <span style={{ ...T.meta, color: B.text3 }}>{k}</span>
      {children}
    </span>
  );
}

function Arrow({ up, onClick, disabled, label }: { up?: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center outline-none transition-colors duration-200 hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#ADFB0C] disabled:opacity-25"
      style={{ color: B.text3 }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ transform: up ? "rotate(180deg)" : undefined }}>
        <path d="M5 1V9M1.5 5.5L5 9L8.5 5.5" stroke="currentColor" fill="none" strokeWidth="1" />
      </svg>
    </button>
  );
}

function TemplateList({ items, onDelete }: { items: { id: string; name: string; meta: string }[]; onDelete: (id: string) => void }) {
  return (
    <ul className="ml-auto max-w-[560px]" style={{ borderTop: `1px solid ${B.l7}` }}>
      {items.map((t) => (
        <li key={t.id} className="flex h-10 items-center gap-4" style={{ borderBottom: `1px solid ${B.l7}` }}>
          <span className="min-w-0 flex-1 truncate" style={T.body}>{t.name}</span>
          <span style={{ ...T.meta, color: B.text3, ...tab }}>{t.meta}</span>
          <TextAction danger onClick={() => onDelete(t.id)}>
            Удалить
          </TextAction>
        </li>
      ))}
    </ul>
  );
}

/** Which section is in view — drives the lime marker in the local index. */
function useScrollSpy(ids: readonly string[]): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const onScroll = () => {
      const line = window.innerHeight * 0.3;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(`set-${id}`);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // At the very bottom the last section wins even if it never reaches the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = ids[ids.length - 1];
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);
  return active;
}
