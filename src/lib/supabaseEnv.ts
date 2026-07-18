/**
 * Cheap, dependency-free env check. `supabase.ts` imports the real `@supabase/supabase-js`
 * client at module scope, so anything that statically imports it — even just to read
 * `isSupabaseConfigured()` — pulls the whole client into its bundle chunk. Always-mounted
 * background engines (ReminderEngine, MeetingSyncEngine — see AppLayout.tsx) need this boolean
 * synchronously on every load, so they use this instead and dynamic-`import()` the real client
 * only once they know it's actually configured.
 */
export function isSupabaseEnvSet(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
