/**
 * Settings · Craft Dark — shared model, controls and the settings registry for v1…v5.
 *
 * Every setting the old page (src/pages/SettingsPage.tsx + GoogleCalendarCard + IntegrationsCard)
 * has is listed once in ITEMS. Settings write through `updateSettings`, the daily norm and
 * gamification through `updateGamification`.
 *
 * Production behaviour, same libs as the old page: nav order/visibility persist through
 * lib/navConfig (+ NAV_CHANGED_EVENT), the AI key through lib/ai, the calendar address through
 * lib/gcal (+ runCalendarSync), push through lib/push, invites through lib/meetingSync, Notion /
 * Gmail / sign-out through their /api relays. JSON export/import carry attachment blobs; reset to
 * demo keeps its confirmation dialog. Nothing writes to the store on mount — only on a click.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bot,
  CalendarDays,
  Check,
  Cloud,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Gauge as GaugeIcon,
  GripVertical,
  Inbox,
  LayoutList,
  LockKeyhole,
  Mail,
  Minus,
  Moon,
  Palette,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trash2,
  Trophy,
  Unplug,
  Upload,
  Users,
  Volume2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Btn, C, IconBtn, R, T, TONE, dashed, plural, type Tone } from "@/design-lab/screens/_kit/craft";
import { NAV_ICON } from "@/design-lab/screens/_kit/craftShell";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useData } from "@/store/DataProvider";
import { ACCENTS, type Accent, type AppData, type Density, type EffectsLevel, type Gamification, type Settings, type Theme } from "@/types";
import { NAV_ITEMS, loadNavHidden, loadNavOrder, resetNav as resetNavStorage, saveNavHidden, saveNavOrder } from "@/lib/navConfig";
import { NAV_CHANGED_EVENT } from "@/components/layout/Sidebar";
import { PROVIDER_PRESETS, clearAiConfig, isAiConfigured, isLocalOrInsecureEndpoint, loadAiConfig, saveAiConfig } from "@/lib/ai";
import { GCAL_EVENT, getGcalStatus, getIcsUrl, maskIcsUrl, runCalendarSync, setIcsUrl, type GcalStatus } from "@/lib/gcal";
import { notificationPermission, requestNotifications } from "@/lib/reminders";
import { currentSubscription, isPushConfigured, subscribeToPush, syncReminders, unsubscribeFromPush } from "@/lib/push";
import { isSupabaseConfigured } from "@/lib/supabase";
import { countIncomingMeetings, drainIncomingMeetings } from "@/lib/meetingSync";
import { fetchAuthStatus, logout, type AuthStatus } from "@/lib/auth";
import { loadNotionTarget, notionSearch, notionStatus, saveNotionTarget, type NotionStatus, type NotionTarget } from "@/lib/notion";
import { gmailConnectUrl, gmailDisconnect, gmailStatus, type GmailStatus } from "@/lib/gmail";
import { migrate } from "@/lib/storage";
import { collectAttachmentIds, exportAttachmentBlobs, importAttachmentBlobs, type AttachmentBlobDump } from "@/lib/attachments";
import { formatDateTime, localDayStr } from "@/lib/format";
import { playPop } from "@/lib/sound";

const ICON = { size: 18, strokeWidth: 1.75 } as const;
const ICON16 = { size: 16, strokeWidth: 1.75 } as const;

// ── Hooks ─────────────────────────────────────────────────────────────────────────────────────

function useEsc(on: boolean, close: () => void) {
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [on, close]);
}

// ── Controls ──────────────────────────────────────────────────────────────────────────────────

/** Pill switch: grey track → solid blue with a white knob. */
function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className="relative shrink-0 transition-colors duration-150 disabled:opacity-40"
      style={{ width: 44, height: 26, borderRadius: 999, background: on ? C.accent : "#2C2C33" }}
    >
      <span
        className="absolute"
        style={{ top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 99, background: "#fff", transition: "left .15s ease", boxShadow: "0 1px 3px rgba(0,0,0,.45)" }}
      />
    </button>
  );
}

interface SegOption<V extends string> {
  value: V;
  label: ReactNode;
  title?: string;
}

/** Segmented pill: raise track, the chosen option is a soft blue tint. */
function Seg<V extends string>({ value, options, onChange, size = 36, full, label }: { value: V; options: SegOption<V>[]; onChange: (v: V) => void; size?: number; full?: boolean; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={`${full ? "flex w-full" : "inline-flex"} shrink-0 items-center gap-1 p-1`} style={{ borderRadius: 999, background: C.raise }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={(e) => {
              e.stopPropagation();
              onChange(o.value);
            }}
            className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-150 ${full ? "flex-1" : ""} ${on ? "" : "hover:text-[#F4F5F7]"}`}
            style={{
              height: size - 8,
              padding: "0 14px",
              borderRadius: 999,
              fontSize: 14,
              background: on ? "rgba(10,132,255,0.18)" : "transparent",
              color: on ? C.text : C.text2,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Number stepper pill: − value + (typing works too). */
function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  label,
  pad,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label: string;
  pad?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn = "grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors duration-150 hover:bg-[#2A2A30] disabled:opacity-30";
  return (
    <div className="inline-flex shrink-0 items-center gap-1 px-1" style={{ height: 36, borderRadius: 999, background: C.raise }} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`${label}: меньше`} className={btn} style={{ color: C.text2 }} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <Minus size={14} strokeWidth={2} />
      </button>
      <label className="flex items-baseline gap-1 px-1">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          value={pad ? String(value).padStart(2, "0") : value}
          onChange={(e) => onChange(clamp(Math.round(Number(e.target.value) || min)))}
          className="bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ width: `${Math.max(2, String(value).length) + 0.6}ch`, fontSize: 14, color: C.text, ...T.num, fontWeight: 500 }}
        />
        {suffix && <span style={{ ...T.foot, color: C.text3 }}>{suffix}</span>}
      </label>
      <button type="button" aria-label={`${label}: больше`} className={btn} style={{ color: C.text2 }} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Labelled field style — the TaskEditor's inputs. */
const field: CSSProperties = { height: 44, borderRadius: 12, background: C.card, boxShadow: `inset 0 0 0 1px ${C.line}`, padding: "0 14px", fontSize: 14, color: C.text, width: "100%" };
const fieldLabel: CSSProperties = { ...T.foot, color: C.text3, marginBottom: 6 };

/** Small status line: dot + text in the tone's hue. */
function StatusLine({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex min-w-0 items-start gap-2" style={{ ...T.body, color: tone === "neutral" ? C.text2 : t.fg }}>
      <span className="mt-[6px] shrink-0" style={{ width: 6, height: 6, borderRadius: 9, background: tone === "neutral" ? C.text3 : t.dot }} />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** Red text button — «Удалить», «Отключить». */
function DangerText({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-2 whitespace-nowrap px-3.5 transition-colors hover:bg-[#2A1A1A]"
      style={{ height: 36, borderRadius: 999, color: TONE.red.fg, fontSize: 14 }}
    >
      {icon}
      {children}
    </button>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center truncate px-2.5" style={{ height: 28, borderRadius: 999, background: C.raise, fontSize: 12, color: C.text2, fontVariantNumeric: "tabular-nums" }}>
      {children}
    </span>
  );
}

// ── Model ─────────────────────────────────────────────────────────────────────────────────────

/** What a setting control reads and writes — swappable for a draft (v5's editor). */
interface Ctl {
  s: Settings;
  g: Gamification;
  set: (p: Partial<Settings>) => void;
  setGam: (p: Partial<Gamification>) => void;
}

type ExportRange = "all" | "7" | "30" | "90";
type Loading<T> = T | "loading";

/** Nav rows shown in the editor — «Планер» is leaving the app, so it isn't offered here. */
const NAV_LIST = NAV_ITEMS.filter((n) => n.id !== "planner");
const NAV_LIST_IDS = new Set(NAV_LIST.map((n) => n.id));

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

export function useSettingsModel() {
  const data = useData();
  const { settings, updateSettings, gamification, updateGamification } = data;

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);
  const navigate = useNavigate();

  // Browser notifications
  const [perm, setPerm] = useState(() => notificationPermission());
  const enableNotif = async () => {
    const r = await requestNotifications();
    setPerm(r);
    toast(r === "granted" ? "Уведомления включены" : "Уведомления не разрешены браузером");
  };

  // Web Push — reminders with the tab closed (Supabase + VAPID key + the send-reminders function).
  const pushReady = isPushConfigured();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ text: string; err: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    if (pushReady)
      currentSubscription()
        .then((s) => live && setPushOn(!!s))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [pushReady]);
  const togglePush = async () => {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
        setPushMsg({ text: "Пуш отключён — напоминания снова только при открытой вкладке.", err: false });
      } else {
        await subscribeToPush();
        await syncReminders(data.allTasks);
        setPushOn(true);
        setPushMsg({ text: "Пуш включён. Напоминания долетят даже при закрытой вкладке.", err: false });
      }
    } catch (e) {
      setPushMsg({ text: e instanceof Error ? e.message : "Не удалось изменить подписку", err: true });
    } finally {
      setPushBusy(false);
    }
  };

  // Navigation — persisted like the old page; the sidebar listens for NAV_CHANGED_EVENT.
  const [navOrder, setNavOrder] = useState<string[]>(() => loadNavOrder());
  const [navHidden, setNavHidden] = useState<Set<string>>(() => loadNavHidden());
  const commitNav = (order: string[], hidden: Set<string>) => {
    setNavOrder(order);
    setNavHidden(hidden);
    saveNavOrder(order);
    saveNavHidden(hidden);
    window.dispatchEvent(new Event(NAV_CHANGED_EVENT));
  };
  const moveNav = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = navOrder.indexOf(fromId);
    const to = navOrder.indexOf(toId);
    if (from === -1 || to === -1) return;
    const next = [...navOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitNav(next, navHidden);
  };
  const toggleNav = (id: string) => {
    const next = new Set(navHidden);
    next.has(id) ? next.delete(id) : next.add(id);
    commitNav(navOrder, next);
  };
  const resetNav = () => {
    resetNavStorage();
    commitNav(loadNavOrder(), loadNavHidden());
    toast("Порядок навигации сброшен");
  };

  // AI — stored by lib/ai (never part of the JSON export). Auto-persists once all three fields
  // are filled, like the old page, so an unsaved key doesn't vanish on navigation.
  const savedAi = useMemo(() => loadAiConfig(), []);
  const [aiProvider, setAiProvider] = useState(() => PROVIDER_PRESETS.find((p) => p.baseUrl === savedAi?.baseUrl)?.id ?? "ollama");
  const [aiBaseUrl, setAiBaseUrl] = useState(savedAi?.baseUrl ?? PROVIDER_PRESETS[0].baseUrl);
  const [aiModel, setAiModel] = useState(savedAi?.model ?? PROVIDER_PRESETS[0].defaultModel);
  const [aiKey, setAiKey] = useState(savedAi?.apiKey ?? "");
  const [aiShowKey, setAiShowKey] = useState(false);
  const [aiSaved, setAiSaved] = useState(() => isAiConfigured());
  const aiUnreachable = typeof window !== "undefined" && window.location.protocol === "https:" && isLocalOrInsecureEndpoint(aiBaseUrl);
  const persistAiIfValid = (next: { baseUrl?: string; apiKey?: string; model?: string } = {}) => {
    const baseUrl = (next.baseUrl ?? aiBaseUrl).trim();
    const apiKey = (next.apiKey ?? aiKey).trim();
    const model = (next.model ?? aiModel).trim();
    if (!baseUrl || !apiKey || !model) return;
    saveAiConfig({ baseUrl, apiKey, model });
    setAiSaved(true);
  };
  const ai = {
    provider: aiProvider,
    baseUrl: aiBaseUrl,
    model: aiModel,
    key: aiKey,
    showKey: aiShowKey,
    saved: aiSaved,
    unreachable: aiUnreachable,
    hint: PROVIDER_PRESETS.find((p) => p.id === aiProvider)?.keyHint ?? "",
    setProvider: (id: string) => {
      setAiProvider(id);
      const preset = PROVIDER_PRESETS.find((p) => p.id === id);
      if (preset && id !== "custom") {
        setAiBaseUrl(preset.baseUrl);
        setAiModel(preset.defaultModel);
        persistAiIfValid({ baseUrl: preset.baseUrl, model: preset.defaultModel });
      }
    },
    setBaseUrl: (v: string) => {
      setAiBaseUrl(v);
      persistAiIfValid({ baseUrl: v });
    },
    setModel: (v: string) => {
      setAiModel(v);
      persistAiIfValid({ model: v });
    },
    setKey: (v: string) => {
      setAiKey(v);
      persistAiIfValid({ apiKey: v });
    },
    toggleShow: () => setAiShowKey((v) => !v),
    save: () => {
      if (!aiBaseUrl.trim() || !aiKey.trim() || !aiModel.trim()) return toast("Заполните endpoint, ключ и модель");
      saveAiConfig({ baseUrl: aiBaseUrl.trim(), apiKey: aiKey.trim(), model: aiModel.trim() });
      setAiSaved(true);
      toast("Настройки ИИ сохранены");
    },
    remove: () => {
      clearAiConfig();
      setAiKey("");
      setAiSaved(false);
      toast("Ключ ИИ удалён");
    },
  };

  // Google Calendar — the secret iCal address lives in this browser only (lib/gcal).
  const [gcalUrl, setGcalUrl] = useState(() => getIcsUrl());
  const [gcalDraft, setGcalDraft] = useState("");
  const [gcalStatus, setGcalStatus] = useState<GcalStatus | null>(() => getGcalStatus());
  const [gcalBusy, setGcalBusy] = useState(false);
  useEffect(() => {
    const on = () => {
      setGcalUrl(getIcsUrl());
      setGcalStatus(getGcalStatus());
    };
    window.addEventListener(GCAL_EVENT, on);
    return () => window.removeEventListener(GCAL_EVENT, on);
  }, []);
  const gcalSync = async (announce: boolean) => {
    setGcalBusy(true);
    try {
      const r = await runCalendarSync(data.applyCalendarSync);
      if (announce && r) toast(r.added ? `Google Календарь подключён: ${r.added} встреч` : "Google Календарь синхронизирован");
    } catch (e) {
      toast(errText(e));
    } finally {
      setGcalBusy(false);
      setGcalStatus(getGcalStatus());
    }
  };
  const gcal = {
    url: gcalUrl,
    masked: gcalUrl ? maskIcsUrl(gcalUrl) : "",
    status: gcalUrl ? gcalStatus : null,
    busy: gcalBusy,
    draft: gcalDraft,
    setDraft: setGcalDraft,
    connect: () => {
      const v = gcalDraft.trim();
      if (!v) return;
      setIcsUrl(v);
      setGcalUrl(v);
      setGcalDraft("");
      void gcalSync(true);
    },
    disconnect: () => {
      setIcsUrl("");
      setGcalUrl("");
      // Upcoming imported meetings go with the calendar; past ones stay as history.
      const r = data.applyCalendarSync([], localDayStr());
      toast(r.removed ? `Календарь отключён, убрано будущих встреч: ${r.removed}` : "Календарь отключён");
    },
    sync: () => void gcalSync(true),
  };

  // Server-side integrations — read-only probes of our /api relays on mount (no store writes).
  const [auth, setAuth] = useState<Loading<AuthStatus | null>>("loading");
  const [notion, setNotion] = useState<Loading<NotionStatus>>("loading");
  const [gmail, setGmail] = useState<Loading<GmailStatus>>("loading");
  const [gmailBusy, setGmailBusy] = useState(false);
  const [invites, setInvites] = useState<number | null>(null);
  const [notionTarget, setNotionTarget] = useState<NotionTarget | null>(() => loadNotionTarget());
  const supabaseOn = isSupabaseConfigured();
  useEffect(() => {
    let live = true;
    fetchAuthStatus().then((s) => live && setAuth(s));
    notionStatus()
      .then((s) => live && setNotion(s))
      .catch((e) => live && setNotion({ connected: false, reason: errText(e) }));
    gmailStatus()
      .then((s) => live && setGmail(s))
      .catch((e) => live && setGmail({ connected: false, configured: true, reason: errText(e) }));
    if (supabaseOn)
      countIncomingMeetings()
        .then((n) => live && setInvites(n))
        .catch(() => live && setInvites(null));
    return () => {
      live = false;
    };
  }, [supabaseOn]);
  const recheckNotion = () => {
    setNotion("loading");
    notionStatus()
      .then(setNotion)
      .catch((e) => setNotion({ connected: false, reason: errText(e) }));
  };

  // Notion default target picker (debounced search while open; empty query = recent pages).
  const [notionPicking, setNotionPicking] = useState(false);
  const [notionQuery, setNotionQuery] = useState("");
  const [notionResults, setNotionResults] = useState<NotionTarget[]>([]);
  const [notionSearching, setNotionSearching] = useState(false);
  const notionOn = notion !== "loading" && notion.connected;
  useEffect(() => {
    if (!notionPicking || !notionOn) return;
    let cancelled = false;
    setNotionSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await notionSearch(notionQuery);
        if (!cancelled) setNotionResults(r);
      } catch (e) {
        if (!cancelled) toast(errText(e));
      } finally {
        if (!cancelled) setNotionSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [notionQuery, notionPicking, notionOn, toast]);
  const notionPicker = {
    picking: notionPicking,
    query: notionQuery,
    results: notionResults,
    searching: notionSearching,
    open: () => setNotionPicking(true),
    cancel: () => {
      setNotionPicking(false);
      setNotionQuery("");
    },
    setQuery: setNotionQuery,
    choose: (t: NotionTarget) => {
      saveNotionTarget(t);
      setNotionTarget(t);
      setNotionPicking(false);
      setNotionQuery("");
      toast(`Notion: по умолчанию — «${t.title}»`);
    },
    clear: () => {
      saveNotionTarget(null);
      setNotionTarget(null);
    },
  };

  // Gmail: back from Google's consent screen the callback lands on /settings?gmail=connected|error.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const result = params.get("gmail");
    if (!result) return;
    toast(result === "connected" ? "Gmail подключён" : params.get("reason") || "Не удалось подключить Gmail");
    const next = new URLSearchParams(params);
    next.delete("gmail");
    next.delete("reason");
    setParams(next, { replace: true });
  }, [params, setParams, toast]);
  const gmailActions = {
    busy: gmailBusy,
    connect: () => {
      window.location.href = gmailConnectUrl();
    },
    open: () => navigate("/mail"),
    disconnect: async () => {
      setGmailBusy(true);
      try {
        await gmailDisconnect();
        setGmail({ connected: false, configured: true });
        toast("Gmail отключён");
      } catch (e) {
        toast(errText(e));
      } finally {
        setGmailBusy(false);
      }
    },
  };

  // Calendar-invite inbox: the same drain the background poller runs, on demand.
  const [invitesBusy, setInvitesBusy] = useState(false);
  const [invitesMsg, setInvitesMsg] = useState<{ text: string; err: boolean } | null>(null);
  const syncInvites = async () => {
    setInvitesBusy(true);
    setInvitesMsg(null);
    try {
      const { imported, firstTitle } = await drainIncomingMeetings(data.addMeeting);
      setInvitesMsg({
        text: imported === 0 ? "Новых приглашений нет — очередь пуста." : imported === 1 ? `Импортирована встреча: ${firstTitle}` : `Импортировано встреч: ${imported}`,
        err: false,
      });
      if (imported > 0) toast(`Импортировано встреч: ${imported}`);
      countIncomingMeetings()
        .then(setInvites)
        .catch(() => setInvites(null));
    } catch (e) {
      setInvitesMsg({ text: e instanceof Error ? e.message : "Не удалось синхронизировать", err: true });
    } finally {
      setInvitesBusy(false);
    }
  };

  // Sign-out on this device (the app password session).
  const signOut = async () => {
    await logout();
    window.location.reload();
  };

  // Data
  const [exportRange, setExportRange] = useState<ExportRange>("all");
  const cutoff = () => {
    if (exportRange === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - Number(exportRange));
    return d.toISOString();
  };
  const exportTasksCsv = () => {
    const c = cutoff();
    const rows = data.allTasks.filter((t) => !c || t.createdAt >= c || (t.completedAt ?? "") >= c);
    downloadCsv(`crm-tasks-${localDayStr()}.csv`, [
      ["Название", "Проект", "Приоритет", "Срок", "Выполнено", "Затрачено (мин)", "Создано", "Завершено"],
      ...rows.map((t) => [t.title, data.allProjects.find((p) => p.id === t.projectId)?.name ?? "", t.priority, t.dueDate ?? "", t.done ? "да" : "нет", t.spentMin, t.createdAt, t.completedAt ?? ""]),
    ]);
    toast(`Выгружено задач: ${rows.length}`);
  };
  const exportFocusCsv = () => {
    const c = cutoff();
    const rows = (data.pomodoroSessions ?? []).filter((s) => !c || s.startedAt >= c);
    downloadCsv(`crm-focus-${localDayStr()}.csv`, [
      ["Дата", "Тип", "Минуты", "Задача", "Начало"],
      ...rows.map((s) => [s.date, s.kind === "work" ? "фокус" : "перерыв", s.minutes, data.allTasks.find((t) => t.id === s.taskId)?.title ?? "", s.startedAt]),
    ]);
    toast(`Выгружено сессий: ${rows.length}`);
  };
  const exportJson = async () => {
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
      // Planner data has no screen any more, but it is still the user's data — keep it in backups.
      planBlocks: data.planBlocks,
      planTemplates: data.planTemplates,
      planDismissed: data.planDismissed,
    };
    // Attachment blobs live in IndexedDB, not AppData — bundle them so a restore on another
    // device doesn't come back with every photo/file/cover missing.
    const ids = collectAttachmentIds(data.allTasks, data.allProjects);
    let blobs: Record<string, AttachmentBlobDump> | undefined;
    try {
      blobs = ids.length > 0 ? await exportAttachmentBlobs(ids) : undefined;
    } catch {
      toast("Не удалось прочитать вложения — выгружаю без них");
    }
    const blob = new Blob([JSON.stringify(blobs ? { ...payload, attachmentBlobs: blobs } : payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-backup-${localDayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(blobs && ids.length > 0 ? `Данные выгружены в JSON (вложений: ${ids.length})` : "Данные выгружены в JSON");
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData & { attachmentBlobs?: Record<string, AttachmentBlobDump> };
        if (!parsed.tasks) throw new Error("bad shape");
        const { attachmentBlobs, ...rest } = parsed;
        // An older backup has no planner fields — keep the ones already here instead of wiping them.
        data.replaceAll(
          migrate({
            ...rest,
            planBlocks: rest.planBlocks ?? data.planBlocks,
            planTemplates: rest.planTemplates ?? data.planTemplates,
            planDismissed: rest.planDismissed ?? data.planDismissed,
          })
        );
        if (attachmentBlobs) {
          try {
            await importAttachmentBlobs(attachmentBlobs);
          } catch {
            toast("Данные загружены, но вложения восстановить не удалось");
            return;
          }
        }
        toast("Данные загружены из файла");
      } catch {
        toast("Не удалось прочитать файл — проверьте формат");
      }
    };
    reader.readAsText(file);
  };
  const [resetOpen, setResetOpen] = useState(false);
  /** Same as the old page: drop the local save and reload — the app boots with the demo set. */
  const doReset = () => {
    localStorage.removeItem("crm-taskmanager-data-v1");
    location.reload();
  };

  const today = localDayStr();
  const closedToday = useMemo(
    () => data.tasks.filter((t) => t.done && t.completedAt && localDayStr(new Date(t.completedAt)) === today).length,
    [data.tasks, today]
  );

  const ctl: Ctl = { s: settings, g: gamification, set: updateSettings, setGam: updateGamification };

  const connected = {
    gcal: !!gcalUrl,
    ai: aiSaved,
    notion: notion !== "loading" && notion.connected,
    gmail: gmail !== "loading" && gmail.connected,
    cloud: data.cloudSync.state === "ok",
  };

  return {
    ctl,
    data,
    toastMsg,
    toast,
    perm,
    enableNotif,
    pushReady,
    push: { on: pushOn, busy: pushBusy, msg: pushMsg, toggle: togglePush },
    nav: { order: navOrder.filter((id) => NAV_LIST_IDS.has(id)), hidden: navHidden, move: moveNav, toggle: toggleNav, reset: resetNav },
    ai,
    gcal,
    auth,
    signOut,
    notion,
    notionTarget,
    notionPicker,
    recheckNotion,
    gmail,
    gmailActions,
    supabaseOn,
    invites,
    invitesBusy,
    invitesMsg,
    syncInvites,
    cloud: data.cloudSync,
    exportRange,
    setExportRange,
    exportTasksCsv,
    exportFocusCsv,
    exportJson,
    fileRef,
    importJson,
    resetOpen,
    setResetOpen,
    doReset,
    closedToday,
    connected,
    connectedCount: Object.values(connected).filter(Boolean).length,
    connectedTotal: Object.keys(connected).length,
  };
}

type SettingsModel = ReturnType<typeof useSettingsModel>;

// ── Value helpers ─────────────────────────────────────────────────────────────────────────────

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const onOff = (v: boolean) => (v ? "Вкл." : "Выкл.");
const tasksN = (n: number) => `${n} ${plural(n, "задача", "задачи", "задач")}`;
const daysN = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;
const navVisible = (m: SettingsModel) => NAV_LIST.filter((n) => !m.nav.hidden.has(n.id)).length;

const EFFECTS: SegOption<EffectsLevel>[] = [
  { value: "full", label: "Полные", title: "Вспышка, конфетти, +XP, живой огонёк" },
  { value: "subtle", label: "Сдержанные", title: "То же, но тише и меньше" },
  { value: "off", label: "Выкл.", title: "Без анимаций — XP и стрик считаются как обычно" },
];
const EFFECT_LABEL: Record<EffectsLevel, string> = { full: "Полные", subtle: "Сдержанные", off: "Выкл." };
const DENSITY: SegOption<Density>[] = [
  { value: "comfortable", label: "Просторно" },
  { value: "compact", label: "Компактно" },
];
const THEMES: SegOption<Theme>[] = [
  { value: "dark", label: <><Moon size={14} strokeWidth={1.75} />Тёмная</> },
  { value: "light", label: <><Sun size={14} strokeWidth={1.75} />Светлая</> },
];
const RANGES: SegOption<ExportRange>[] = [
  { value: "all", label: "Всё время" },
  { value: "7", label: "7 дн." },
  { value: "30", label: "30 дн." },
  { value: "90", label: "90 дн." },
];

function cloudLine(m: SettingsModel): { tone: Tone; text: string } {
  const c = m.cloud;
  switch (c.state) {
    case "off":
      return { tone: "neutral", text: "Не настроено — нет ключей Supabase" };
    case "idle":
      return { tone: "neutral", text: "Ожидание" };
    case "syncing":
      return { tone: "blue", text: "Синхронизация…" };
    case "ok":
      return { tone: "green", text: `${c.direction === "pushed" ? "Выгружено в облако" : "Загружено из облака"} · ${formatDateTime(c.at)}` };
    case "conflict":
      return { tone: "amber", text: "Расхождение — нужно выбрать версию" };
    case "error":
      return { tone: "red", text: "Ошибка синхронизации" };
  }
}

/** Without the /api functions (plain dev server) answers come back as HTML — keep them readable. */
function cleanReason(r?: string): string | undefined {
  if (!r) return undefined;
  if (/json|unexpected token|<!doctype|<html/i.test(r)) return "Сервер приложения не ответил.";
  return r;
}

// ── Groups & items ────────────────────────────────────────────────────────────────────────────

export type GroupId = "day" | "pomodoro" | "notify" | "clients" | "look" | "nav" | "integrations" | "data";

export const GROUPS: { id: GroupId; label: string; icon: LucideIcon; desc: string }[] = [
  { id: "day", label: "План дня", icon: Target, desc: "Лимит задач, дневная норма и геймификация" },
  { id: "pomodoro", label: "Помодоро", icon: Timer, desc: "Длина фокуса, перерывов и раундов" },
  { id: "notify", label: "Уведомления и звук", icon: Bell, desc: "Напоминания, звук, эффекты и тихие часы" },
  { id: "clients", label: "Клиенты", icon: Users, desc: "Когда клиент попадает в зону риска" },
  { id: "look", label: "Оформление", icon: Palette, desc: "Тема, акцентный цвет и плотность" },
  { id: "nav", label: "Навигация", icon: LayoutList, desc: "Порядок и видимость разделов в сайдбаре" },
  { id: "integrations", label: "Интеграции", icon: Plug, desc: "Календарь, ИИ, Notion, почта и облако" },
  { id: "data", label: "Данные", icon: Database, desc: "Экспорт, резервная копия, архив и шаблоны" },
];
const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, (typeof GROUPS)[number]>;

/**
 * s — a compact control (toggle / stepper): inline even in narrow cards.
 * m — a segmented control: inline in rows, below the label in narrow cards.
 * block — a panel of its own (nav editor, AI form…): always below the label.
 */
type ItemSize = "s" | "m" | "block";

export interface Item {
  id: string;
  group: GroupId;
  label: string;
  desc: string;
  icon: LucideIcon;
  size: ItemSize;
  /** true = writes settings/gamification (can be drafted); false = an action that applies at once. */
  setting: boolean;
  keys?: string;
  value: (c: Ctl, m: SettingsModel) => string;
  tone?: (c: Ctl, m: SettingsModel) => Tone | undefined;
  hidden?: (c: Ctl) => boolean;
  control: (c: Ctl, m: SettingsModel, narrow?: boolean) => ReactNode;
}

const POMO: { key: "workMin" | "shortBreakMin" | "longBreakMin" | "roundsBeforeLong"; label: string; desc: string; icon: LucideIcon; suffix: string; max: number }[] = [
  { key: "workMin", label: "Фокус", desc: "Длина одной фокус-сессии", icon: Timer, suffix: "мин", max: 180 },
  { key: "shortBreakMin", label: "Перерыв", desc: "Короткий перерыв между сессиями", icon: Timer, suffix: "мин", max: 60 },
  { key: "longBreakMin", label: "Большой перерыв", desc: "После серии раундов", icon: Timer, suffix: "мин", max: 120 },
  { key: "roundsBeforeLong", label: "Раундов до большого", desc: "Сколько сессий до большого перерыва", icon: Rows3, suffix: "", max: 12 },
];

const ITEMS: Item[] = [
  // План дня
  {
    id: "focusLimit",
    group: "day",
    label: "Лимит задач на день",
    desc: "Метод Иви Ли: в день реально закрыть 3–6 важных задач. Всё сверх лимита на рабочем столе бледнеет и получает «Перенести на завтра».",
    icon: Target,
    size: "m",
    setting: true,
    keys: "план дня фокус лимит иви ли",
    value: (c) => (c.s.dailyFocusLimit ? tasksN(c.s.dailyFocusLimit) : "Выкл."),
    control: (c) => (
      <Seg
        label="Лимит задач на день"
        value={String(c.s.dailyFocusLimit ?? 0) as "0" | "3" | "5" | "6"}
        onChange={(v) => c.set({ dailyFocusLimit: Number(v) })}
        options={[
          { value: "0", label: "Выкл." },
          { value: "3", label: "3" },
          { value: "5", label: "5" },
          { value: "6", label: "6" },
        ]}
      />
    ),
  },
  {
    id: "gamification",
    group: "day",
    label: "Геймификация",
    desc: "Уровни, XP, стрик и достижения",
    icon: Trophy,
    size: "s",
    setting: true,
    keys: "xp уровни стрик достижения",
    value: (c) => (c.g.enabled ? "Включена" : "Выключена"),
    control: (c) => <Toggle label="Геймификация" on={c.g.enabled} onChange={(v) => c.setGam({ enabled: v })} />,
  },
  {
    id: "dailyGoal",
    group: "day",
    label: "Дневная норма",
    desc: "Цель по задачам в день — от неё кольцо и «n из нормы» на рабочем столе",
    icon: GaugeIcon,
    size: "s",
    setting: true,
    keys: "цель дня норма goal",
    hidden: (c) => !c.g.enabled,
    value: (c) => tasksN(c.g.dailyGoal),
    control: (c) => <Stepper label="Дневная норма" value={c.g.dailyGoal} min={1} max={30} onChange={(v) => c.setGam({ dailyGoal: v })} />,
  },

  // Помодоро
  ...POMO.map<Item>((p) => ({
    id: `pomo-${p.key}`,
    group: "pomodoro",
    label: p.label,
    desc: p.desc,
    icon: p.icon,
    size: "s",
    setting: true,
    keys: "помодоро таймер",
    value: (c) => (p.suffix ? `${c.s.pomodoro[p.key]} ${p.suffix}` : `${c.s.pomodoro[p.key]}`),
    control: (c) => (
      <Stepper label={p.label} value={c.s.pomodoro[p.key]} min={1} max={p.max} step={p.key === "workMin" ? 5 : 1} suffix={p.suffix || undefined} onChange={(v) => c.set({ pomodoro: { ...c.s.pomodoro, [p.key]: v } })} />
    ),
  })),
  {
    id: "pomo-autostart",
    group: "pomodoro",
    label: "Автостарт следующей фазы",
    desc: "Перерыв и новая сессия начинаются сами",
    icon: Zap,
    size: "s",
    setting: true,
    keys: "помодоро автостарт",
    value: (c) => onOff(c.s.pomodoro.autostart),
    control: (c) => <Toggle label="Автостарт помодоро" on={c.s.pomodoro.autostart} onChange={(v) => c.set({ pomodoro: { ...c.s.pomodoro, autostart: v } })} />,
  },

  // Уведомления и звук
  {
    id: "notif",
    group: "notify",
    label: "Браузерные уведомления",
    desc: "Напоминания по задачам и встречам, когда вкладка неактивна",
    icon: BellRing,
    size: "s",
    setting: false,
    keys: "уведомления браузер напоминания",
    value: (_c, m) => (m.perm === "granted" ? "Включены" : m.perm === "denied" ? "Заблокированы" : "Не включены"),
    tone: (_c, m) => (m.perm === "granted" ? "green" : m.perm === "denied" ? "amber" : undefined),
    control: (_c, m) =>
      m.perm === "granted" ? (
        <StatusLine tone="green">Включены</StatusLine>
      ) : m.perm === "denied" ? (
        <StatusLine tone="amber">Заблокированы в браузере — разрешите через значок замка у адреса</StatusLine>
      ) : (
        <Btn size={36} icon={<Bell {...ICON16} />} onClick={m.enableNotif}>
          Включить
        </Btn>
      ),
  },
  {
    id: "push",
    group: "notify",
    label: "Пуш при закрытой вкладке",
    desc: "Уезжает только заголовок задачи и время напоминания — и удаляется сразу после отправки",
    icon: Bell,
    size: "m",
    setting: false,
    keys: "push пуш vapid",
    value: (_c, m) => (!m.pushReady ? "Недоступно" : m.push.on ? "Включён" : "Выключен"),
    tone: (_c, m) => (m.pushReady && m.push.on ? "green" : undefined),
    control: (_c, m) =>
      m.pushReady ? (
        <div className="flex min-w-0 flex-col items-start gap-2">
          <Toggle label="Пуш при закрытой вкладке" on={m.push.on} disabled={m.push.busy} onChange={() => void m.push.toggle()} />
          {m.push.msg && <span style={{ ...T.foot, color: m.push.msg.err ? TONE.red.fg : C.text3, lineHeight: 1.4 }}>{m.push.msg.text}</span>}
        </div>
      ) : (
        <StatusLine>Нужны Supabase, VITE_VAPID_PUBLIC_KEY и функция send-reminders</StatusLine>
      ),
  },
  {
    id: "sound",
    group: "notify",
    label: "Звук при закрытии задачи",
    desc: "Мягкий «чпок», когда задача отмечена",
    icon: Volume2,
    size: "s",
    setting: true,
    keys: "звук чпок sound",
    value: (c) => onOff(c.s.soundEnabled),
    control: (c) => (
      <Toggle
        label="Звук"
        on={c.s.soundEnabled}
        onChange={(v) => {
          c.set({ soundEnabled: v });
          if (v) playPop();
        }}
      />
    ),
  },
  {
    id: "effects",
    group: "notify",
    label: "Эффекты при закрытии",
    desc: "Вспышка, +XP и конфетти. XP и статистика начисляются в любом случае",
    icon: Sparkles,
    size: "m",
    setting: true,
    keys: "эффекты конфетти анимация",
    value: (c) => EFFECT_LABEL[c.s.effects ?? "full"],
    control: (c) => <Seg label="Эффекты" value={c.s.effects ?? "full"} options={EFFECTS} onChange={(v) => c.set({ effects: v })} />,
  },
  {
    id: "quiet",
    group: "notify",
    label: "Тихие часы",
    desc: "Не показывать напоминания в эти часы",
    icon: Moon,
    size: "m",
    setting: true,
    keys: "тихие часы ночь не беспокоить",
    value: (c) => (c.s.quietEnabled ? `${hh(c.s.quietFrom)} – ${hh(c.s.quietTo)}` : "Выкл."),
    control: (c) => (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {c.s.quietEnabled && (
          <>
            <Stepper label="Тихие часы с" value={c.s.quietFrom} min={0} max={23} pad suffix=":00" onChange={(v) => c.set({ quietFrom: v })} />
            <span style={{ color: C.text3 }}>–</span>
            <Stepper label="Тихие часы до" value={c.s.quietTo} min={0} max={23} pad suffix=":00" onChange={(v) => c.set({ quietTo: v })} />
          </>
        )}
        <Toggle label="Тихие часы" on={c.s.quietEnabled} onChange={(v) => c.set({ quietEnabled: v })} />
      </div>
    ),
  },

  // Клиенты
  {
    id: "riskAttention",
    group: "clients",
    label: "«Внимание» через",
    desc: "Клиент без активности дольше порога подсвечивается на рабочем столе",
    icon: AlertTriangle,
    size: "s",
    setting: true,
    keys: "зона риска клиент порог внимание",
    value: (c) => daysN(c.s.riskAttentionDays),
    control: (c) => <Stepper label="«Внимание», дней" value={c.s.riskAttentionDays} min={1} max={365} suffix="дн." onChange={(v) => c.set({ riskAttentionDays: v })} />,
  },
  {
    id: "riskRisk",
    group: "clients",
    label: "«Риск» через",
    desc: "После этого порога клиент — в зоне риска",
    icon: ShieldAlert,
    size: "s",
    setting: true,
    keys: "зона риска клиент порог",
    value: (c) => daysN(c.s.riskRiskDays),
    control: (c) => <Stepper label="«Риск», дней" value={c.s.riskRiskDays} min={1} max={365} suffix="дн." onChange={(v) => c.set({ riskRiskDays: v })} />,
  },

  // Оформление
  {
    id: "theme",
    group: "look",
    label: "Тема",
    desc: "Цветовая схема приложения",
    icon: Moon,
    size: "m",
    setting: true,
    keys: "тема тёмная светлая",
    value: (c) => (c.s.theme === "light" ? "Светлая" : "Тёмная"),
    control: (c) => <Seg label="Тема" value={c.s.theme} options={THEMES} onChange={(v) => c.set({ theme: v })} />,
  },
  {
    id: "accent",
    group: "look",
    label: "Акцентный цвет",
    desc: "Кнопки, активные пункты, графики",
    icon: Palette,
    size: "m",
    setting: true,
    keys: "акцент цвет",
    value: (c) => ACCENTS[c.s.accent]?.label ?? "",
    control: (c) => (
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Акцентный цвет">
        {(Object.keys(ACCENTS) as Accent[]).map((a) => {
          const on = c.s.accent === a;
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              title={ACCENTS[a].label}
              aria-label={ACCENTS[a].label}
              onClick={(e) => {
                e.stopPropagation();
                c.set({ accent: a });
              }}
              className="grid shrink-0 place-items-center transition-transform duration-150 hover:scale-110"
              style={{ width: 28, height: 28, borderRadius: 99, background: ACCENTS[a].swatch, boxShadow: on ? `0 0 0 3px ${C.card}, 0 0 0 4.5px rgba(255,255,255,0.55)` : undefined }}
            >
              {on && <Check size={14} strokeWidth={3} color="#fff" />}
            </button>
          );
        })}
      </div>
    ),
  },
  {
    id: "density",
    group: "look",
    label: "Плотность",
    desc: "Отступы в списках и карточках",
    icon: Rows3,
    size: "m",
    setting: true,
    keys: "плотность компактно просторно",
    value: (c) => (c.s.density === "compact" ? "Компактно" : "Просторно"),
    control: (c) => <Seg label="Плотность" value={c.s.density} options={DENSITY} onChange={(v) => c.set({ density: v })} />,
  },

  // Навигация
  {
    id: "nav",
    group: "nav",
    label: "Разделы сайдбара",
    desc: "Перетащите, чтобы поменять порядок; переключателем — скрыть ненужные",
    icon: LayoutList,
    size: "block",
    setting: false,
    keys: "навигация сайдбар меню порядок скрыть",
    value: (_c, m) => `${navVisible(m)} из ${NAV_LIST.length} видно`,
    control: (_c, m) => <NavEditor m={m} />,
  },

  // Интеграции
  {
    id: "gcal",
    group: "integrations",
    label: "Google Календарь",
    desc: "Встречи из календаря попадают во «Встречи» и список задач, обновляются каждые 5 минут",
    icon: CalendarDays,
    size: "block",
    setting: false,
    keys: "google календарь ical встречи",
    value: (_c, m) => (m.gcal.url ? "Подключён" : "Не подключён"),
    tone: (_c, m) => (m.gcal.url ? "green" : undefined),
    control: (_c, m, narrow) => <GcalBlock m={m} narrow={narrow} />,
  },
  {
    id: "ai",
    group: "integrations",
    label: "AI-ассистент",
    desc: "Живой ИИ поверх ваших задач, проектов и фокуса. Ключ хранится отдельно и не попадает в экспорт",
    icon: Bot,
    size: "block",
    setting: false,
    keys: "ии ai ассистент ключ модель ollama gemini",
    value: (_c, m) => (m.ai.saved ? m.ai.model || "Настроен" : "Не настроен"),
    tone: (_c, m) => (m.ai.saved ? "green" : undefined),
    control: (_c, m, narrow) => <AiBlock m={m} narrow={narrow} />,
  },
  {
    id: "notion",
    group: "integrations",
    label: "Notion",
    desc: "Страница или база по умолчанию — для заметок «→ в Notion» и страниц ассистента",
    icon: Inbox,
    size: "block",
    setting: false,
    keys: "notion ноушен инбокс",
    value: (_c, m) => (m.notion === "loading" ? "Проверяю…" : m.notion.connected ? "Подключён" : "Не подключён"),
    tone: (_c, m) => (m.notion !== "loading" && m.notion.connected ? "green" : undefined),
    control: (_c, m) => <NotionBlock m={m} />,
  },
  {
    id: "gmail",
    group: "integrations",
    label: "Gmail",
    desc: "Письма, «→ Задача» и «→ Встреча» на странице «Почта»",
    icon: Mail,
    size: "block",
    setting: false,
    keys: "gmail почта google",
    value: (_c, m) => (m.gmail === "loading" ? "Проверяю…" : m.gmail.connected ? "Подключён" : "Не подключён"),
    tone: (_c, m) => (m.gmail !== "loading" && m.gmail.connected ? "green" : undefined),
    control: (_c, m) => <GmailBlock m={m} />,
  },
  {
    id: "cloud",
    group: "integrations",
    label: "Облачная синхронизация",
    desc: "Задачи, проекты, заметки и настройки — одни и те же на всех устройствах. Файлы остаются на своём устройстве",
    icon: Cloud,
    size: "block",
    setting: false,
    keys: "облако supabase синхронизация",
    value: (_c, m) => cloudLine(m).text,
    tone: (_c, m) => cloudLine(m).tone,
    control: (_c, m) => <CloudBlock m={m} />,
  },
  {
    id: "invites",
    group: "integrations",
    label: "Приглашения на встречи",
    desc: "Пересланные в Telegram-бота Hermes приглашения забираются в CRM раз в минуту",
    icon: CalendarDays,
    size: "block",
    setting: false,
    keys: "приглашения hermes telegram zoom встречи",
    value: (_c, m) => (m.supabaseOn ? "Supabase подключён" : "Supabase не настроен"),
    tone: (_c, m) => (m.supabaseOn ? "green" : undefined),
    control: (_c, m) => <InvitesBlock m={m} />,
  },
  {
    id: "auth",
    group: "integrations",
    label: "Вход в приложение",
    desc: "Пароль приложения — без него почта и Notion не подключаются",
    icon: LockKeyhole,
    size: "block",
    setting: false,
    keys: "пароль вход выйти",
    value: (_c, m) => (m.auth === "loading" ? "Проверяю…" : m.auth === null ? "Нет ответа" : m.auth.required ? "Пароль включён" : "Пароль не задан"),
    tone: (_c, m) => (m.auth !== "loading" && m.auth?.required ? "green" : m.auth !== "loading" ? "amber" : undefined),
    control: (_c, m) => <AuthBlock m={m} />,
  },

  // Данные
  {
    id: "purge",
    group: "data",
    label: "Авто-очистка архива",
    desc: "Архивные задачи, проекты и заметки старше N дней удаляются навсегда. 0 — хранить всегда",
    icon: Trash2,
    size: "s",
    setting: true,
    keys: "архив корзина очистка",
    value: (c) => (c.s.trashPurgeDays ? daysN(c.s.trashPurgeDays) : "Хранить всегда"),
    control: (c) => <Stepper label="Авто-очистка архива, дней" value={c.s.trashPurgeDays} min={0} max={365} suffix="дн." onChange={(v) => c.set({ trashPurgeDays: v })} />,
  },
  {
    id: "csv",
    group: "data",
    label: "Выгрузка в CSV",
    desc: "Задачи и фокус-сессии за выбранный период",
    icon: FileSpreadsheet,
    size: "block",
    setting: false,
    keys: "csv экспорт таблица выгрузка",
    value: (_c, m) => RANGES.find((r) => r.value === m.exportRange)?.label as string,
    control: (_c, m) => (
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Период для CSV" value={m.exportRange} options={RANGES} onChange={m.setExportRange} />
        <Btn size={36} kind="ghost" icon={<FileSpreadsheet {...ICON16} />} onClick={m.exportTasksCsv}>
          Задачи
        </Btn>
        <Btn size={36} kind="ghost" icon={<FileSpreadsheet {...ICON16} />} onClick={m.exportFocusCsv}>
          Фокус
        </Btn>
      </div>
    ),
  },
  {
    id: "json",
    group: "data",
    label: "Резервная копия",
    desc: "Все данные в одном JSON-файле, вместе с вложениями",
    icon: Download,
    size: "block",
    setting: false,
    keys: "json бэкап резервная копия импорт экспорт",
    value: () => "JSON",
    control: (_c, m) => (
      <div className="flex flex-wrap items-center gap-2">
        <Btn size={36} icon={<Download {...ICON16} />} onClick={m.exportJson}>
          Выгрузить JSON
        </Btn>
        <Btn size={36} kind="ghost" icon={<Upload {...ICON16} />} onClick={() => m.fileRef.current?.click()}>
          Загрузить JSON
        </Btn>
      </div>
    ),
  },
  {
    id: "templates",
    group: "data",
    label: "Шаблоны",
    desc: "Шаблоны проектов и чек-листов — сохраняются со страницы проекта и из карточки задачи",
    icon: LayoutList,
    size: "block",
    setting: false,
    keys: "шаблоны проектов чек-листов",
    value: (c) => {
      const n = c.s.projectTemplates.length + c.s.checklistTemplates.length;
      return n ? `${n} ${plural(n, "шаблон", "шаблона", "шаблонов")}` : "Нет";
    },
    control: (_c, m) => <TemplatesBlock m={m} />,
  },
  {
    id: "reset",
    group: "data",
    label: "Сбросить к демо-данным",
    desc: "Удалить все локальные данные и вернуть демо-набор. Необратимо",
    icon: RotateCcw,
    size: "s",
    setting: false,
    keys: "сброс удалить демо",
    value: () => "",
    control: (_c, m) => (
      <DangerText icon={<Trash2 {...ICON16} />} onClick={() => m.setResetOpen(true)}>
        Сбросить
      </DangerText>
    ),
  },
];

export const visibleItems = (c: Ctl) => ITEMS.filter((i) => !i.hidden?.(c));

export function matchItem(i: Item, q: string) {
  if (!q) return true;
  const hay = `${i.label} ${i.desc} ${i.keys ?? ""} ${GROUP[i.group].label}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** One-line summary of a group's current values (rail, cards). */
export function groupSummary(id: GroupId, c: Ctl, m: SettingsModel): string {
  const s = c.s;
  switch (id) {
    case "day":
      return [s.dailyFocusLimit ? `лимит ${s.dailyFocusLimit}` : "лимит выкл.", c.g.enabled ? `норма ${c.g.dailyGoal}` : "без геймификации"].join(" · ");
    case "pomodoro":
      return `${s.pomodoro.workMin} / ${s.pomodoro.shortBreakMin} / ${s.pomodoro.longBreakMin} мин · ${s.pomodoro.roundsBeforeLong} ${plural(s.pomodoro.roundsBeforeLong, "раунд", "раунда", "раундов")}`;
    case "notify":
      return [`звук ${s.soundEnabled ? "вкл." : "выкл."}`, s.quietEnabled ? `тихо ${hh(s.quietFrom)}–${hh(s.quietTo)}` : "тихие часы выкл."].join(" · ");
    case "clients":
      return `${s.riskAttentionDays} / ${s.riskRiskDays} дней`;
    case "look":
      return `${s.theme === "light" ? "Светлая" : "Тёмная"} · ${ACCENTS[s.accent]?.label ?? ""}`;
    case "nav":
      return `${navVisible(m)} из ${NAV_LIST.length} разделов`;
    case "integrations":
      return `подключено ${m.connectedCount} из ${m.connectedTotal}`;
    case "data":
      return s.trashPurgeDays ? `архив ${s.trashPurgeDays} дн.` : "архив хранится всегда";
  }
}

// ── Block controls ────────────────────────────────────────────────────────────────────────────

const LABEL_BY_ID = Object.fromEntries(NAV_ITEMS.map((n) => [n.id, n.label]));

function NavEditor({ m, columns = 1 }: { m: SettingsModel; columns?: 1 | 2 }) {
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-1.5 ${columns === 2 ? "grid-cols-2" : ""}`}>
        {m.nav.order.map((id) => {
          const Icon = NAV_ICON[id];
          const hidden = m.nav.hidden.has(id);
          return (
            <div
              key={id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("application/x-nav-item", id)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(id);
              }}
              onDragLeave={() => setOver((o) => (o === id ? null : o))}
              onDrop={(e) => {
                const from = e.dataTransfer.getData("application/x-nav-item");
                if (from) m.nav.move(from, id);
                setOver(null);
              }}
              className="group flex cursor-grab items-center gap-3 pl-2 pr-3 active:cursor-grabbing"
              style={{ height: 48, borderRadius: R.small, background: over === id ? "rgba(10,132,255,0.12)" : C.raise, opacity: hidden ? 0.5 : 1, transition: "background .15s" }}
            >
              <GripVertical size={16} strokeWidth={1.75} color={C.text3} />
              {Icon && <Icon {...ICON16} color={C.text2} />}
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14 }}>
                {LABEL_BY_ID[id]}
              </span>
              <Toggle label={`Показывать «${LABEL_BY_ID[id]}»`} on={!hidden} onChange={() => m.nav.toggle(id)} />
            </div>
          );
        })}
      </div>
      <div>
        <Btn size={36} kind="ghost" icon={<RotateCcw {...ICON16} />} onClick={m.nav.reset}>
          Сбросить порядок
        </Btn>
      </div>
    </div>
  );
}

function GcalBlock({ m, narrow }: { m: SettingsModel; narrow?: boolean }) {
  const g = m.gcal;
  if (g.url)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLine tone="green">Подключён</StatusLine>
          <Mono>{g.masked}</Mono>
        </div>
        {g.status && (
          <div style={{ ...T.foot, color: g.status.ok ? C.text3 : TONE.red.fg }}>
            {formatDateTime(g.status.at)} — {g.status.message}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Btn size={36} kind="ghost" icon={<RefreshCw {...ICON16} className={g.busy ? "animate-spin" : undefined} />} onClick={g.sync} disabled={g.busy}>
            {g.busy ? "Синхронизация…" : "Синхронизировать сейчас"}
          </Btn>
          <DangerText icon={<Unplug {...ICON16} />} onClick={g.disconnect}>
            Отключить
          </DangerText>
        </div>
        <div style={{ ...T.foot, color: C.text3, lineHeight: 1.45 }}>Google отдаёт изменения по этой ссылке с задержкой — иногда до пары часов.</div>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div style={{ ...T.body, color: C.text2, lineHeight: 1.45 }}>
        В{" "}
        <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer" style={{ color: "#5AA9FF" }}>
          настройках Google Календаря
        </a>{" "}
        выберите свой календарь → «Интеграция календаря» → скопируйте «Закрытый адрес в формате iCal».
      </div>
      <form
        className={`flex gap-2 ${narrow ? "flex-col" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          g.connect();
        }}
      >
        <input
          type="password"
          autoComplete="off"
          value={g.draft}
          onChange={(e) => g.setDraft(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          aria-label="Закрытый адрес календаря в формате iCal"
          className={`min-w-0 outline-none placeholder:text-[#5E6068] ${narrow ? "" : "flex-1"}`}
          style={field}
        />
        <Btn type="submit" disabled={!g.draft.trim() || g.busy}>
          Подключить
        </Btn>
      </form>
      <div style={{ ...T.foot, color: C.text3 }}>Ссылка хранится только в этом браузере и не уходит в облачную копию. Сами встречи синхронизируются на все устройства.</div>
    </div>
  );
}

function AiBlock({ m, narrow }: { m: SettingsModel; narrow?: boolean }) {
  const a = m.ai;
  return (
    <div className="flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
      <label className="flex flex-col">
        <span style={fieldLabel}>Провайдер</span>
        <select value={a.provider} onChange={(e) => a.setProvider(e.target.value)} className="outline-none [color-scheme:dark]" style={field}>
          {PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="mt-1.5" style={{ ...T.foot, color: C.text3 }}>
          {a.hint}
        </span>
      </label>
      <label className="flex flex-col">
        <span style={fieldLabel}>API-ключ</span>
        <span className="relative flex">
          <input
            type={a.showKey ? "text" : "password"}
            value={a.key}
            onChange={(e) => a.setKey(e.target.value)}
            placeholder="Вставьте ключ"
            className="outline-none placeholder:text-[#5E6068]"
            style={{ ...field, paddingRight: 44 }}
          />
          <button type="button" aria-label={a.showKey ? "Скрыть ключ" : "Показать ключ"} onClick={a.toggleShow} className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full hover:bg-[#232327]" style={{ color: C.text2 }}>
            {a.showKey ? <EyeOff {...ICON16} /> : <Eye {...ICON16} />}
          </button>
        </span>
      </label>
      <div className={`grid gap-3 ${narrow ? "" : "grid-cols-2"}`}>
        <label className="flex min-w-0 flex-col">
          <span style={fieldLabel}>Модель</span>
          <input value={a.model} onChange={(e) => a.setModel(e.target.value)} placeholder="напр. tencent/hy3:free" className="outline-none placeholder:text-[#5E6068]" style={field} />
        </label>
        <label className="flex min-w-0 flex-col">
          <span style={fieldLabel}>Endpoint (base URL)</span>
          <input value={a.baseUrl} onChange={(e) => a.setBaseUrl(e.target.value)} disabled={a.provider !== "custom"} className="outline-none disabled:opacity-60" style={field} />
        </label>
      </div>
      {a.unreachable && (
        <div className="flex items-start gap-2 px-4 py-3" style={{ borderRadius: R.small, background: TONE.amber.bg, boxShadow: `inset 0 0 0 1px ${TONE.amber.bd}`, ...T.foot, color: TONE.amber.fg }}>
          <AlertTriangle size={14} strokeWidth={1.75} className="mt-px shrink-0" />
          Этот endpoint (http или локальный) недоступен с задеплоенного сайта. На онлайн-версии выберите облачный провайдер по https.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Btn size={36} onClick={a.save}>
          Сохранить
        </Btn>
        {a.saved && (
          <>
            <DangerText icon={<Trash2 {...ICON16} />} onClick={a.remove}>
              Удалить ключ
            </DangerText>
            <StatusLine tone="green">Настроено</StatusLine>
          </>
        )}
      </div>
    </div>
  );
}

function NotionBlock({ m }: { m: SettingsModel }) {
  const st = m.notion;
  const t = m.notionTarget;
  const p = m.notionPicker;
  const on = st !== "loading" && st.connected;
  const kindLabel = (k: NotionTarget["kind"]) => (k === "database" ? "база" : "страница");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        {st === "loading" ? (
          <StatusLine>Проверяю…</StatusLine>
        ) : st.connected ? (
          <StatusLine tone="green">{st.name ? `Подключено как «${st.name}»` : "Подключено"}</StatusLine>
        ) : (
          <StatusLine tone="amber">{cleanReason(st.reason) ?? "Не подключено"} — нужен NOTION_TOKEN</StatusLine>
        )}
        <IconBtn size={36} title="Проверить подключение" onClick={m.recheckNotion}>
          <RefreshCw size={15} strokeWidth={1.75} />
        </IconBtn>
      </div>
      {p.picking ? (
        <div className="flex flex-col gap-2">
          <label className="relative flex items-center">
            <Search size={15} strokeWidth={1.75} color={C.text3} className="pointer-events-none absolute left-3.5" />
            <input
              autoFocus
              value={p.query}
              onChange={(e) => p.setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), p.cancel())}
              placeholder="Найти страницу или базу в Notion…"
              aria-label="Поиск страницы Notion"
              className="outline-none placeholder:text-[#5E6068]"
              style={{ ...field, paddingLeft: 38 }}
            />
          </label>
          <div className="flex max-h-56 flex-col overflow-y-auto [scrollbar-width:thin]" style={{ borderRadius: R.small, background: C.raise }}>
            {p.searching && p.results.length === 0 ? (
              <span className="px-4 py-3" style={{ ...T.foot, color: C.text3 }}>
                Ищу…
              </span>
            ) : p.results.length === 0 ? (
              <span className="px-4 py-3" style={{ ...T.foot, color: C.text3 }}>
                Ничего не найдено — страница расшарена интеграции?
              </span>
            ) : (
              p.results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => p.choose(r)}
                  className="flex items-center gap-3 px-4 text-left transition-colors duration-150 hover:bg-[#2A2A30] focus-visible:bg-[#2A2A30] focus-visible:outline-none"
                  style={{ minHeight: 44 }}
                >
                  <span className="shrink-0" style={{ ...T.foot, color: C.text3, width: 64 }}>
                    {kindLabel(r.kind)}
                  </span>
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14 }}>
                    {r.title}
                  </span>
                </button>
              ))
            )}
          </div>
          <div>
            <Btn size={36} kind="ghost" onClick={p.cancel}>
              Отмена
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4" style={{ minHeight: 48, borderRadius: R.small, background: C.raise }}>
          {t ? (
            <>
              <span className="shrink-0" style={{ ...T.foot, color: C.text3 }}>
                {kindLabel(t.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14 }}>
                {t.title}
              </span>
              {t.url && (
                <a href={t.url} target="_blank" rel="noopener noreferrer" title="Открыть в Notion" aria-label="Открыть в Notion" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[#2A2A30]" style={{ color: C.text2 }}>
                  <ExternalLink size={15} strokeWidth={1.75} />
                </a>
              )}
            </>
          ) : (
            <span className="min-w-0 flex-1" style={{ ...T.body, color: C.text3 }}>
              Цель по умолчанию не выбрана
            </span>
          )}
          <Btn size={36} kind="ghost" onClick={p.open} disabled={!on}>
            {t ? "Сменить" : "Выбрать"}
          </Btn>
          {t && (
            <button type="button" title="Убрать цель" aria-label="Убрать цель" onClick={p.clear} className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-[#2A1A1A] hover:text-[#FF7A73]" style={{ color: C.text3 }}>
              <X size={15} strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}
      <div style={{ ...T.foot, color: C.text3, lineHeight: 1.45 }}>Сюда попадают заметки по кнопке «→ в Notion» и страницы, которые создаёт ассистент, если не назвать другую.</div>
    </div>
  );
}

function GmailBlock({ m }: { m: SettingsModel }) {
  const st = m.gmail;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {st === "loading" ? (
        <StatusLine>Проверяю…</StatusLine>
      ) : st.connected ? (
        <StatusLine tone="green">
          {st.email ?? "Аккаунт Google"}
          {typeof st.unread === "number" ? ` · непрочитанных ${st.unread}` : ""}
        </StatusLine>
      ) : (
        <StatusLine tone={st.configured ? "neutral" : "amber"}>{cleanReason(st.reason) ?? "Почта не подключена"}</StatusLine>
      )}
      {st !== "loading" &&
        (st.connected ? (
          <div className="flex gap-2">
            <Btn size={36} kind="ghost" onClick={m.gmailActions.open}>
              Открыть почту
            </Btn>
            <DangerText onClick={() => !m.gmailActions.busy && void m.gmailActions.disconnect()}>Отключить</DangerText>
          </div>
        ) : st.configured ? (
          <Btn size={36} icon={<Mail {...ICON16} />} onClick={m.gmailActions.connect}>
            Подключить Gmail
          </Btn>
        ) : null)}
    </div>
  );
}

function CloudBlock({ m }: { m: SettingsModel }) {
  const line = cloudLine(m);
  const c = m.cloud;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusLine tone={line.tone}>{line.text}</StatusLine>
        {c.state !== "off" && (
          <Btn size={36} kind="ghost" icon={<RefreshCw {...ICON16} />} onClick={m.data.cloudPushNow} disabled={c.state === "syncing"}>
            Выгрузить сейчас
          </Btn>
        )}
      </div>
      {c.state === "error" && <div style={{ ...T.foot, color: TONE.red.fg }}>{c.message}</div>}
      {c.state !== "off" && (
        <div style={{ ...T.foot, color: C.text3, lineHeight: 1.45 }}>
          Запись всегда идёт сначала в этот браузер, а в облако — следом. Если синхронизация ругается на таблицу — прогоните supabase/app_state.sql в Supabase → SQL Editor.
        </div>
      )}
      {c.state === "conflict" && (
        <div className="flex flex-col gap-3 px-4 py-3" style={{ borderRadius: R.small, background: TONE.amber.bg, boxShadow: `inset 0 0 0 1px ${TONE.amber.bd}` }}>
          <span style={{ ...T.foot, color: TONE.amber.fg, lineHeight: 1.45 }}>
            В облаке более свежая запись, но в ней меньше данных ({c.remoteCount} против {c.localCount} здесь). Автоматически ничего не применено — выберите сами.
          </span>
          <div className="flex flex-wrap gap-2">
            <Btn size={36} onClick={m.data.cloudPushNow}>
              Оставить эти данные
            </Btn>
            <DangerText onClick={m.data.cloudPullNow}>Взять версию из облака</DangerText>
          </div>
        </div>
      )}
    </div>
  );
}

function InvitesBlock({ m }: { m: SettingsModel }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusLine tone={m.supabaseOn ? "green" : "neutral"}>
          {m.supabaseOn ? "Supabase подключён" : "Supabase не настроен"}
          {m.supabaseOn && m.invites !== null && <span style={{ color: C.text3 }}> · в очереди {m.invites}</span>}
        </StatusLine>
        {m.supabaseOn && (
          <Btn size={36} kind="ghost" icon={<RefreshCw {...ICON16} className={m.invitesBusy ? "animate-spin" : undefined} />} onClick={() => void m.syncInvites()} disabled={m.invitesBusy}>
            {m.invitesBusy ? "Синхронизация…" : "Синхронизировать сейчас"}
          </Btn>
        )}
      </div>
      {m.invitesMsg && <div style={{ ...T.foot, color: m.invitesMsg.err ? TONE.red.fg : C.text3, lineHeight: 1.45 }}>{m.invitesMsg.text}</div>}
    </div>
  );
}

function AuthBlock({ m }: { m: SettingsModel }) {
  const st = m.auth;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {st === "loading" ? (
        <StatusLine>Проверяю…</StatusLine>
      ) : st === null ? (
        <StatusLine tone="amber">Сервер приложения не отвечает — статус входа неизвестен</StatusLine>
      ) : st.required ? (
        <StatusLine tone="green">Пароль включён · сессия живёт год</StatusLine>
      ) : (
        <StatusLine tone="amber">Пароль не задан — приложение открыто всем, у кого есть ссылка (APP_PASSWORD)</StatusLine>
      )}
      {st !== "loading" && st?.required && (
        <Btn size={36} kind="ghost" onClick={() => void m.signOut()}>
          Выйти на этом устройстве
        </Btn>
      )}
    </div>
  );
}

function TemplatesBlock({ m }: { m: SettingsModel }) {
  const { projectTemplates, checklistTemplates } = m.ctl.s;
  const rows = [
    ...projectTemplates.map((t) => ({ id: t.id, kind: "Проект", name: t.name, meta: `${t.tasks.length} задач · ${t.sections.length} секций`, del: () => m.data.deleteProjectTemplate(t.id) })),
    ...checklistTemplates.map((t) => ({ id: t.id, kind: "Чек-лист", name: t.name, meta: `${t.items.length} пунктов`, del: () => m.data.deleteChecklistTemplate(t.id) })),
  ];
  if (rows.length === 0)
    return (
      <div className="px-4 py-3" style={{ borderRadius: R.small, border: `1px dashed ${C.line2}`, ...T.body, color: C.text3 }}>
        Шаблонов пока нет — «Сохранить как шаблон» на странице проекта или «В шаблон» у подзадач.
      </div>
    );
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div key={r.id} className="group flex items-center gap-3" style={{ minHeight: 48, ...dashed }}>
          <span style={{ ...T.foot, color: C.text3, width: 64 }}>{r.kind}</span>
          <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14 }}>
            {r.name}
          </span>
          <span style={{ ...T.foot, color: C.text3 }}>{r.meta}</span>
          <button
            type="button"
            title="Удалить шаблон"
            aria-label="Удалить шаблон"
            onClick={r.del}
            className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-[opacity,background,color] duration-150 hover:bg-[#2A1A1A] hover:text-[#FF7A73] focus-visible:opacity-100 group-hover:opacity-100"
            style={{ color: C.text3 }}
          >
            <Trash2 {...ICON16} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Overlays ──────────────────────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center">
      <div
        role="status"
        className="flex items-center gap-2.5 px-5"
        style={{ height: 48, borderRadius: 999, background: C.panel, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 20px 50px rgba(0,0,0,0.55)`, fontSize: 14, color: C.text }}
      >
        <Check size={16} strokeWidth={2} color={C.accent} />
        {msg}
      </div>
    </div>
  );
}

function Dialog({ title, onClose, children, footer, width = 560 }: { title: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode; width?: number }) {
  useEsc(true, onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={typeof title === "string" ? title : undefined}
        className="flex max-h-[calc(100vh-48px)] w-full flex-col gap-5 overflow-y-auto p-6"
        style={{ maxWidth: width, background: C.panel, borderRadius: R.page, boxShadow: `inset 0 0 0 1px ${C.line2}, 0 30px 80px rgba(0,0,0,0.6)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <span style={T.h2}>{title}</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <X {...ICON} />
          </IconBtn>
        </div>
        {children}
        <div className="flex items-center justify-between gap-2 pt-1">{footer}</div>
      </div>
    </div>
  );
}

/** Reset confirmation — the only way to the destructive reset. */
function ResetDialog({ m }: { m: SettingsModel }) {
  if (!m.resetOpen) return null;
  const close = () => m.setResetOpen(false);
  return (
    <Dialog
      title="Удалить все локальные данные?"
      onClose={close}
      width={480}
      footer={
        <>
          <span />
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={close}>
              Отмена
            </Btn>
            <Btn
              kind="danger"
              onClick={() => {
                close();
                m.doReset();
              }}
            >
              Удалить всё
            </Btn>
          </div>
        </>
      }
    >
      <p style={{ ...T.body, color: C.text2, lineHeight: 1.5 }}>Вернётся демо-набор. Это необратимо — выгрузите JSON заранее, если нужна резервная копия.</p>
    </Dialog>
  );
}

/** Toast + reset dialog + hidden import input — mount once per screen. */
export function Overlays({ m }: { m: SettingsModel }) {
  return (
    <>
      <input
        ref={m.fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) m.importJson(f);
          e.target.value = "";
        }}
      />
      <ResetDialog m={m} />
      <Toast msg={m.toastMsg} />
    </>
  );
}

// ── Shared row renderers ──────────────────────────────────────────────────────────────────────

export function ItemText({ item, sub = true }: { item: Item; sub?: boolean }) {
  return (
    <div className="min-w-0">
      <div style={{ ...T.cell, fontSize: 15, color: C.text }}>{item.label}</div>
      {sub && <div style={{ ...T.body, color: C.text3, marginTop: 4, lineHeight: 1.4 }}>{item.desc}</div>}
    </div>
  );
}
