// Supabase Edge Function (Deno): sends due reminders as Web Push.
//
// Deploy:
//   supabase functions deploy send-reminders --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//
// Then have it run every minute (Supabase Dashboard → Database → Cron, or SQL):
//   select cron.schedule('send-reminders', '* * * * *', $$
//     select net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
//       headers := '{"Content-Type":"application/json"}'::jsonb
//     );
//   $$);
//
// It marks each reminder sent BEFORE pushing, so a retry of the same minute can't
// double-notify: at-most-once is the right trade here (a duplicate reminder is worse
// than a missed one you'll still see in-app).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("push_reminders")
    .select("*")
    .is("sent_at", null)
    .lte("remind_at", nowIso);

  if (error) return new Response(error.message, { status: 500 });
  if (!due || due.length === 0) return Response.json({ sent: 0 });

  // Claim first — see the at-most-once note above.
  await supabase
    .from("push_reminders")
    .update({ sent_at: nowIso })
    .in("id", due.map((r: { id: string }) => r.id));

  const { data: subs } = await supabase.from("push_subscriptions").select("*");
  let sent = 0;

  for (const r of due) {
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: "Напоминание",
            body: r.title,
            tag: `reminder-${r.id}`,
            url: r.url ?? "/tasks",
          })
        );
        sent++;
      } catch (e) {
        // 404/410 = the browser dropped this subscription; stop pushing to a dead endpoint.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }
  }

  // The queue is a queue, not a log — drop what we've handled.
  await supabase.from("push_reminders").delete().in("id", due.map((r: { id: string }) => r.id));

  return Response.json({ sent });
});
