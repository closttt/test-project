import { gmailStatus, gmailConnectUrl, type GmailStatus } from "@/lib/gmail";
import { notionStatus, type NotionStatus } from "@/lib/notion";

/**
 * Registry behind «Сервисы» (/services) — the one hub where connected tools live. The page draws
 * its tile rail and its «Добавить» shelf from this list, so a new integration is one entry here
 * plus one pane component; nothing else on the page needs to know the tool exists.
 *
 * Deliberately NOT one nav item per tool: the owner picks the tool inside the section, the way
 * the reference screen does it — active tool on top, tiles underneath.
 */

export type ServiceId = "gmail" | "notion" | "calendar" | "drive";

export interface ServiceState {
  /** Ready to use right now. */
  connected: boolean;
  /** The server has the env vars for it at all — false means "not set up on the backend yet". */
  configured: boolean;
  /** Account/workspace name shown under the tile. */
  account?: string;
  /** Why it isn't connected, in the user's words. */
  reason?: string;
}

export interface ServiceMeta {
  id: ServiceId;
  label: string;
  /** One line under the title in the pane header. */
  tagline: string;
  /** Brand tint for the tile logo plate — DS-friendly rgb triple. */
  tint: string;
  /** Live tools have a pane; planned ones are shown under «Добавить» only. */
  available: boolean;
  /** Where «Подключить» goes: an OAuth redirect (full URL) or an in-app route. */
  connect?: () => { href?: string; to?: string };
  fetchState?: () => Promise<ServiceState>;
}

export const SERVICES: ServiceMeta[] = [
  {
    id: "gmail",
    label: "Gmail",
    tagline: "Письма, звёзды, архив — и «в задачу» одним кликом",
    tint: "234 67 53",
    available: true,
    connect: () => ({ href: gmailConnectUrl() }),
    fetchState: async () => fromGmail(await gmailStatus()),
  },
  {
    id: "notion",
    label: "Notion",
    tagline: "Страницы и базы — ассистент умеет писать в них из чата",
    tint: "255 255 255",
    available: true,
    connect: () => ({ to: "/settings" }),
    fetchState: async () => fromNotion(await notionStatus()),
  },
  {
    id: "calendar",
    label: "Google Календарь",
    tagline: "Встречи из календаря прямо в рабочий стол",
    tint: "66 133 244",
    available: false,
  },
  {
    id: "drive",
    label: "Google Диск",
    tagline: "Файлы проекта из Диска, без скачивания",
    tint: "0 172 71",
    available: false,
  },
];

export function serviceById(id: string): ServiceMeta | undefined {
  return SERVICES.find((s) => s.id === id);
}

function fromGmail(s: GmailStatus): ServiceState {
  return { connected: s.connected, configured: s.configured, account: s.email ?? undefined, reason: s.reason };
}

function fromNotion(s: NotionStatus): ServiceState {
  // The relay only answers «connected/not» — an unreachable token reads as "not configured yet".
  return { connected: s.connected, configured: s.connected || !!s.name, account: s.name, reason: s.reason };
}

const ACTIVE_KEY = "crm-services-active-v1";

/** Which tool the hub opens on — the one you left it on. */
export function loadActiveService(): ServiceId {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    const found = raw ? SERVICES.find((s) => s.id === raw && s.available) : undefined;
    return found?.id ?? "gmail";
  } catch {
    return "gmail";
  }
}

export function saveActiveService(id: ServiceId): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // A full localStorage must not break the hub.
  }
}

/** «Синхронизировано минуту назад» — relative, in Russian, for the pane header. */
export function syncedAgo(at: number | null): string {
  if (!at) return "";
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 10) return "Синхронизировано только что";
  if (sec < 60) return `Синхронизировано ${sec} с назад`;
  const min = Math.round(sec / 60);
  if (min === 1) return "Синхронизировано минуту назад";
  if (min < 60) return `Синхронизировано ${min} мин назад`;
  const h = Math.round(min / 60);
  return h === 1 ? "Синхронизировано час назад" : `Синхронизировано ${h} ч назад`;
}
