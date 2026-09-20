import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Throwaway probe (remove once the deploy is understood): does a function that imports the shared
 * api/_lib module survive on Vercel? Every function that imports it returns
 * FUNCTION_INVOCATION_FAILED while functions without the import work, so this isolates the cause
 * instead of guessing at it.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const out: Record<string, unknown> = { node: process.version, cwd: process.cwd() };
  try {
    const mod = await import("./_lib/session");
    out.sharedImport = "ok";
    out.authRequired = mod.authRequired();
  } catch (e) {
    out.sharedImport = "FAILED";
    out.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  res.status(200).json(out);
}
