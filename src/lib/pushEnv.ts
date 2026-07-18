import { isSupabaseEnvSet } from "@/lib/supabaseEnv";

/**
 * Env/feature check only — no `@/lib/push` (and therefore no `@supabase/supabase-js`) import,
 * so ReminderEngine can test this synchronously on every mount without pulling the push/
 * supabase client into the main bundle. `push.ts` re-exports this as `isPushConfigured` so
 * both the logic and the public name stay in one place.
 */
export function isPushEnvSet(): boolean {
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  return !!vapid && isSupabaseEnvSet() && "serviceWorker" in navigator && "PushManager" in window;
}
