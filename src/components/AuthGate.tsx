import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_REQUIRED_EVENT, fetchAuthStatus, login } from "@/lib/auth";

type Phase = "checking" | "open" | "locked" | "unreachable";

/**
 * Wraps the whole app: nothing renders until the server says whether a password is required and
 * whether this device already holds a session. One password, one cookie per device (plan B0).
 * Any later 401 from an integration call re-locks the screen via AUTH_REQUIRED_EVENT.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");

  async function probe() {
    setPhase("checking");
    const status = await fetchAuthStatus();
    if (!status) setPhase("unreachable");
    else setPhase(!status.required || status.authenticated ? "open" : "locked");
  }

  useEffect(() => {
    probe();
    const relock = () => setPhase("locked");
    window.addEventListener(AUTH_REQUIRED_EVENT, relock);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, relock);
  }, []);

  if (phase === "open") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {phase === "checking" ? (
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" aria-label="Загрузка" />
      ) : phase === "unreachable" ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Не удалось проверить вход — сервер приложения не отвечает.</p>
          <Button variant="outline" size="sm" onClick={probe}>Повторить</Button>
        </div>
      ) : (
        <LoginForm onSuccess={() => setPhase("open")} />
      )}
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">Р</span>
        <div>
          <p className="text-sm font-semibold">Рабочий стол</p>
          <p className="text-xs text-muted-foreground">Вход на этом устройстве — один раз</p>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="app-password" className="flex items-center gap-1.5">
          <LockKeyhole className="h-3.5 w-3.5" /> Пароль
        </Label>
        <Input
          id="app-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        {error && <p className="text-xs text-risk">{error}</p>}
      </div>
      <Button type="submit" disabled={busy || !password}>
        {busy ? "Проверяю…" : "Войти"}
      </Button>
    </form>
  );
}
