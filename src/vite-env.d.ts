/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL — knowledge-base cards only (read-only anon key). Unset = feature disabled. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
