# CRM self-audit — reusable process

This is not a one-time findings report. It is a checklist a future agent runs periodically against this
codebase to re-audit it, grounded in the actual architecture as of the 2026-07-15 nine-area / 77-agent
research pass. Re-derive facts (file sizes, line numbers, exact counts) each run — the numbers below are a
starting point, not a fixed baseline; this app changes fast and line numbers drift within days.

## What this app is

A local-first personal task manager + lite CRM ("Рабочий стол") for a single owner who opens it roughly
10x/day. React 18 + TypeScript + Vite + Tailwind (token-based DS) + shadcn/radix primitives + framer-motion.
The single source of truth is `src/store/DataProvider.tsx`: one `useState<AppData>` holds every entity
(clients, projects, tasks, notes, meetings, pomodoro sessions, gamification state, settings), exposed through
one memoized context value wrapping ~60 action closures, consumed via `useData()` across the app. Persistence
is `src/lib/storage.ts`: the entire `AppData` blob is JSON-serialized to `localStorage` (key
`crm-taskmanager-data-v1`) on every mutation. There is no backend for the core product — Supabase is used
**only** for: Knowledge (Telegram-sourced cards synced via a Hermes agent), the calendar-invite inbox
(`incoming_meetings`, drained into local `Meeting` records), and Web Push (`push_subscriptions`,
`push_reminders`, one Deno edge function `send-reminders`). There is no login/auth anywhere. The Dashboard is
a `react-grid-layout` 12-column drag board. Tasks.tsx is the main triage surface (smart lists + list/kanban
views). A gamification/streak layer sits on top of task completion. Do not treat any of this as legacy to
modernize — it is the intended architecture for a single-owner local-first tool.

## Hard constraints / guardrails — respect on every run

These come from the project's own memory notes and repeated user feedback. Violating any of them is worse
than missing a finding.

- **Never run `git` commands in this repo.** The git root is the entire user profile
  (`C:\Users\singa`), not just `CRM/` — `add`/`commit`/`push`/`reset`/`clean` from here is unsafe. Narrating
  `git status` conceptually is fine; do not execute git.
- **Never launch Playwright** (`mcp__playwright__*`) for verification, even for a quick visual check — the
  user has said this twice explicitly. Verify with `npx tsc --noEmit`, `npx vitest run`, `npm run build`, and
  careful code reading. If a visual confirmation is genuinely needed, ask the user for a screenshot rather
  than driving a browser yourself.
- **All colors/spacing/radius/font-size come from Tailwind DS tokens** (`tailwind.config.ts` + the HSL vars
  in `src/index.css`). No hardcoded hex, no arbitrary `text-[]`/`rounded-[]`/`gap-[]`/`w-[]`/`h-[]`/`mb-[]`
  etc., except the documented exceptions: `mask-`/`transform-`/`backdrop-` arbitraries, Radix-internal
  component files, the 5 swatch-preview hex pairs in `types.ts`, and `Celebration.tsx`'s confetti particle
  colors.
- **Filters are always inline and visible**, right-aligned in the existing toolbar row (`sm:ml-auto` on a
  wrapping flex div) — **never** a collapsible/toggle side panel. The user explicitly rejected a slide-out
  filter rail once already; treat any future "move filters aside" request as "keep them on the page,
  right-aligned," not "hide them behind a toggle."
- **`service_role` must never reach the browser/`src/`.** Only the anon/publishable Supabase key and RLS
  policies are allowed client-side. If an AI/LLM feature exists, its API key must be user-entered at runtime
  and stored in `localStorage` only — never baked into `import.meta.env`/the build.
- **Meetings are one record, never duplicated as a task.** "Closed everywhere" is an architectural property
  (the sync engine deletes the inbox row after import, and Tasks renders the Meeting itself as a row) — not
  something achieved by creating a linked task copy. Never introduce a second record that mirrors a meeting.
- **Depth over breadth.** The user explicitly stopped a breadth-first `/loop` because it felt "raw" and
  chose to polish Projects/Tasks/Dashboard instead. Default to fewer, fully-finished passes over many shallow
  additions. Do not propose new pages/sections/features in an audit — propose depth (consistency, states,
  consolidation) on what exists. When a roadmap item ships, delete it from `SHIPPED_TITLES` (and make sure it
  was ever added to `DEFAULT_PLANNED`) in `src/lib/roadmap.ts` — never leave a checked-off "done" list.
- **Icon sizing inside flex containers uses CSS** (`className`/`style` width+height+`shrink-0`+`block`),
  never bare HTML `width`/`height` attributes — flex `align-items: stretch` overrides those silently.
- **Do not invent findings.** Where an area checks out clean, say so plainly in `.audit-report.md` rather
  than padding it with generic advice. A documented, deliberate trade-off (there are several — see the SQL
  comments in `supabase/*.sql`, the Dashboard "Focus mode" toggle's own in-code rationale, the empty
  `DEFAULT_PLANNED` after a roadmap closeout) is not a defect; note it as confirmed-intentional instead of
  re-flagging it as a gap.

## Known drift as of this writing — check before trusting any Clients-related citation

The 2026-07-15 research pass ran while `src/pages/Clients.tsx` and `src/pages/ClientDetail.tsx` existed (with
`/clients` and `/clients/:id` routes) and produced multiple detailed findings against them (token violations,
icon-button a11y gaps, a "deepen the Clients daily loop" product recommendation). **As of the current tree,
those two page files and both routes do not exist** — `src/App.tsx` has no `/clients` route, and
`src/lib/navConfig.ts`'s `NAV_ITEMS` has no `clients` entry. This matches an earlier, separate decision
("Clients removed from UI, kept in schema") that appears to have been re-applied after a same-day rebuild.
**The underlying data model is still fully present and tested**: `Client`/`Payment`/`Touch` types in
`types.ts`, `clients: Client[]` in `AppData`, `addClient`/`updateClient`/`deleteClient`/`clientRisk`/
`addPayment`/`addTouch` in `DataProvider.tsx`, and `clientRisk` assertions in
`src/lib/__tests__/flows.test.tsx`.

Before reusing or re-filing any finding that cites `Clients.tsx`/`ClientDetail.tsx`:
1. Run `Glob "src/pages/Client*.tsx"` and grep `src/App.tsx` for `path="/clients"`.
2. If they still don't exist, treat those specific old findings as historical/inapplicable — the files
   don't resolve. Do not "fix" a token or a11y issue in a file that isn't there.
3. Flag the dead-but-tested Client subsystem itself as a standing question for the user (fully built,
   fully typed, covered by a test, zero UI surface) rather than silently building a page back or silently
   ignoring it — this is a product decision, not something to resolve unilaterally in an audit pass.

## Cross-cutting root causes to know before you start

The last pass found several confirmed findings that are really one underlying defect filed under multiple
files. Fix (or re-verify) these as one unit, not as separate tickets, or you'll do the work twice:

- **UTC day-key.** `todayStr()`/`isToday()` (`src/lib/format.ts`), `completionLog` writes (`DataProvider.tsx`
  `toggleTask`), `taskGrouping.ts` bucketing, and `gameStats.ts` streak/comeback math all derive "today" from
  `new Date().toISOString().slice(0,10)` — UTC, not local. For a UTC+3 (Moscow) user, the day flips 3 hours
  early. One `localDayStr()` helper fixes all of these at once; write it before touching any of the four
  files individually.
- **DataProvider god-context.** The single `useMemo` keyed on `[data]` bundling ~60 action closures with the
  data snapshot is the same architectural fact whether you're looking at it from a data-layer angle
  ("mutations invalidate everything") or a components-arch angle ("every consumer re-renders on any
  mutation"). One fix (split a stable actions context from the data context), not two.
- **No shared `TaskRow`/`DueDateMenu`.** Tasks.tsx's `renderRow`/`kanbanCard`, `ProjectDetail.tsx`'s
  `renderTaskRow`, and the due-date reschedule dropdown duplicated across 3-4 call sites are one root cause
  (task-row markup never got componentized) with many symptoms (missing memoization, missing a11y attributes
  applied inconsistently, missing touch-target sizing, drifting due-date behavior). Extract the component
  first; the a11y/memo/token fixes then apply once instead of N times.
- **Hard deletes don't cascade or reclaim storage.** Orphaned `projectId`/`clientId`/`blockedBy` references
  after a delete, and leaked IndexedDB attachment blobs after a delete or an auto-purge, are the same missing
  discipline (delete removes the row, nothing else). Fix cascade-cleanup and blob-reclaim together in the
  same delete/purge reducers.
- **Eager bundle weight.** `supabase-js` loading eagerly, no `manualChunks` in `vite.config.ts`, and
  `react-grid-layout` loading on the home route regardless of mobile/focus mode are three symptoms of one
  gap (nothing in the app statically analyzes "does this route actually need this dependency"). Sequence:
  make `supabase.ts` lazy first, then add `manualChunks` (it explicitly wants supabase already lazy so it
  lands in its own chunk cleanly), then lazy the grid.
- **No Supabase Auth → uniform `using(true)` RLS.** `push_subscriptions`, `push_reminders`,
  `incoming_meetings`, and `knowledge_cards` all ship anon policies with no ownership binding. This is a
  single access-model decision (Supabase Auth vs. route sensitive writes through a service-role function),
  not four independent policy fixes — decide once, then rewrite all four the same way.

## Per-area audit checklists

### 1. Data layer & persistence
Files: `src/store/DataProvider.tsx`, `src/lib/storage.ts`, `src/lib/attachments.ts`, `src/lib/undoStack.ts`,
`src/lib/meetingSync.ts`, `src/components/MeetingSyncEngine.tsx`, `src/types.ts`.

- [ ] Grep `useEffect.*saveData` in `DataProvider.tsx` and read `saveData` in `storage.ts`. Confirm whether a
      debounce and a `try/catch` (surfacing `QuotaExceededError` via toast) now exist around the full-blob
      `JSON.stringify` write. Framer `Reorder.Group onReorder` (Tasks.tsx, Notes.tsx) fires this repeatedly
      mid-drag — a burst write pattern that benefits most from a debounce.
- [ ] Check for `src/lib/__tests__/storage.test.ts`. If absent, this remains the single highest-value gap:
      `loadData()` swallows any `migrate()` throw and returns `null`, `DataProvider` falls back to
      `seedData()`, and the very next save effect overwrites the real `crm-taskmanager-data-v1` key with seed
      data — silent, irreversible data loss from one malformed persisted record. Do not modify `migrate()`
      for any other reason in this section until this test exists.
- [ ] Read `migrate()`'s `trashPurgeDays` branch. Confirm a malformed/non-parseable `archivedAt` is treated
      as "keep" (not silently dropped via a `NaN >= cutoff` false), and that the purge doesn't run
      unconditionally on every load without ever telling the user (default `trashPurgeDays` is 30).
- [ ] Grep `deleteAttachmentBlob` call sites. Confirm `deleteTask`/`deleteProject`(/`deleteClient` if that UI
      returns) and the purge path in `migrate()` all enumerate and free `coverAttachmentId`/attachment/photo
      blobs in IndexedDB — not just explicit per-file removal in `TaskEditDialog`/`ProjectDetail`.
- [ ] Grep `deleteProject`, `deleteTask`, `deleteClient` in `DataProvider.tsx`. Confirm they cascade: a
      deleted project clears/reparents `task.projectId`/`task.section` and any `note.linkedProjectId`
      (mirror `deleteProjectSection`'s existing reparenting, which already does this correctly); a deleted
      task strips its id from every other task's `blockedBy` array.
- [ ] Grep `updatedAt`/`deletedAt`/`revision` in `types.ts`. If a future server-sync feature is ever
      scheduled, the tombstone-vs-hard-delete schema decision must be made and backfilled in `migrate()`
      *before* any cascade-delete work is built on top of hard deletes — otherwise the cascade logic gets
      rewritten twice.
- [ ] Check `MeetingSyncEngine.tsx`'s `busy` ref against `SettingsPage.tsx`'s manual "Синхронизировать
      сейчас" button. Confirm they share one in-flight guard, or that `addMeeting` dedupes on the inbox row's
      source id — a concurrent poll + manual click can otherwise double-import a meeting, directly violating
      the "meetings are one record" guardrail.
- [ ] Check `undoStack.ts` for a `clearUndo()` export and confirm `replaceAll` (used by JSON import/restore in
      `SettingsPage.tsx`) calls it, so a post-restore Ctrl+Z can't resurrect a stale entity from the previous
      dataset.
- [ ] Grep `window.addEventListener("storage"` repo-wide. If still absent, two open tabs/instances (or the
      installed PWA + a browser tab) each hold an independent copy of `AppData` and silently last-writer-wins
      on save with no conflict signal — flag as a known limitation; only worth fixing if the user actually
      runs multiple instances regularly.

### 2. Security & Supabase/backend
Files: `supabase/*.sql`, `supabase/functions/send-reminders/index.ts`, `src/lib/supabase.ts`, `src/lib/ai.ts`
(if reintroduced), `src/lib/push.ts`, `public/sw.js`, `.env.local`/`.env.example`.

- [ ] Read every RLS policy in `supabase/*.sql`. This is a personal, single-owner deploy by explicit design
      (the SQL files' own comments document that trade-off) — the question is not "add Supabase Auth," it's
      "does any policy expose more than necessary for that design." `push_subscriptions` and `push_reminders`
      use `for all using(true)` (broader than `knowledge_cards`/`incoming_meetings`, which restrict INSERT).
      A stranger with the anon key can read/delete every device's Web Push credentials or enqueue an
      arbitrary push. Confirm the user has knowingly accepted this, don't silently "fix" it without asking —
      but do surface it every run until it's addressed or explicitly re-accepted.
- [ ] Check `supabase/functions/send-reminders/index.ts` for `--no-verify-jwt` and no shared-secret check in
      the `Deno.serve` handler. If a fix landed, confirm the cron `net.http_post` call actually passes the
      secret header.
- [ ] Grep `import.meta.env` across `src/`. Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
      `VITE_VAPID_PUBLIC_KEY`, and `DEV`/`PROD` should appear — no `service_role`, no LLM key baked into a
      build-time env var. Any AI feature's key must stay user-entered + `localStorage`-only.
- [ ] Run `npm audit --production`. Confirm 0 vulnerabilities (or note new ones). Confirm `agentation` (the
      dev feedback tool) is still gated behind `import.meta.env.DEV` and lazy-imported in `main.tsx`; after a
      `npm run build`, grep `dist/` for `agentation` to confirm it did not leak into the prod bundle.
- [ ] If Web Push is live, re-check `public/sw.js`'s `notificationclick` handler — it navigates to whatever
      `notification.data.url` was on the row with no origin allow-list. This is only a live phishing vector
      if `push_reminders` is genuinely world-writable, so it's coupled to the RLS item above, not independent.

### 3. Frontend performance & bundle
Files: `vite.config.ts`, `src/lib/supabase.ts` (and its import graph: `push.ts`, `MeetingSyncEngine.tsx`,
`ReminderEngine.tsx`, `AppLayout.tsx`), `src/pages/Dashboard.tsx`.

- [ ] Run `npm run build`. Read the emitted chunk-size table and any "chunks are larger than 500 kB" warning.
      Compare the initial/vendor chunk's raw+gzip size against the previous run to see if it grew or shrank
      (baseline at last audit: ~735 kB raw / ~227 kB gzip, no `manualChunks`).
- [ ] Grep `src/lib/supabase.ts` for a top-level `import { createClient } from "@supabase/supabase-js"`. If
      still synchronous, convert `getClient()`/`isSupabaseConfigured()` to lazy (`await import(...)`) so the
      SDK isn't forced into the eager graph by `ReminderEngine`/`MeetingSyncEngine`, both mounted
      unconditionally in `AppLayout.tsx` — neither needs Supabase for first paint.
- [ ] Check `vite.config.ts` for `build.rollupOptions.output.manualChunks`. Add it (React/framer-motion/
      radix/supabase as separate named chunks) once supabase is lazy, not before — the ordering matters for
      where supabase ends up.
- [ ] Grep `Dashboard.tsx` for a module-scope `import RGL`/`react-grid-layout`. Confirm whether the grid
      still loads even when `isMobile`/`focusMode` never render it; if so, wrap the grid-rendering branch in
      `React.lazy` + `Suspense`.
- [ ] Check `Tasks.tsx` for `visible`/`rows`/`visibleMeetings` — are they wrapped in `useMemo` like their
      neighbors `counts`/`meetingItems`? Low urgency at this app's data scale; do it alongside any `TaskRow`
      extraction rather than standalone.
- [ ] Grep `React.memo` repo-wide. Zero occurrences was the state at last audit — not urgent on its own;
      revisit once a shared `TaskRow` exists so one memoization covers every duplicated row-render path.

### 4. Core UX flows (daily loop)
Files: `src/lib/nlp.ts`, `src/components/QuickAddDialog.tsx`, `src/pages/Tasks.tsx`,
`src/pages/Dashboard.tsx`, `src/lib/format.ts`, `src/lib/taskGrouping.ts`, `src/lib/recent.ts`,
`src/components/CommandPalette.tsx`.

- [ ] **Regression-test the NLP date words first.** In a scratch Node/vitest check, test
      `/\bсегодня\b/i.test(' сегодня ')`, `/\bзавтра\b/i.test(' завтра ')`, and one weekday pattern from
      `nlp.ts`. `\b` in JS is defined against `[A-Za-z0-9_]` and never matches next to Cyrillic letters —
      if these return `false`, the flagship "type a date word into quick-add" capture feature is silently
      broken: the word is neither parsed into a due date nor stripped from the title. This is advertised in
      the QuickAddDialog placeholder, the Tasks empty state, and the shortcuts dialog. Fix by anchoring on
      whitespace/string boundaries (`\u` flag + `(^|\s)word(\s|$)`) instead of `\b`, and add
      `src/lib/__tests__/nlp.test.ts` (does not exist yet) so this can't regress silently again.
- [ ] Compare `Dashboard.tsx`'s inline "add today task" input against `QuickAddDialog.tsx`. Confirm both
      route through `parseNaturalInput` (or a shared helper) — if Dashboard's inline add still only passes
      the raw title through, `#tags`/`!важно`/date words typed there become literal text while the same
      string in QuickAddDialog (`n` shortcut) parses correctly. Fix this only after the NLP regex above is
      actually fixed, or you propagate a broken parser to a second surface.
- [ ] Grep `toISOString().slice(0, 10)` across `format.ts`, `taskGrouping.ts`, `DataProvider.tsx`
      (`toggleTask`'s `completionLog` write), and `gameStats.ts`. This is the UTC-day-key issue described in
      Cross-cutting root causes — add one `localDayStr()`/`addDays()` helper to `format.ts` and sweep every
      "today" derivation in one pass (the same idiom is copy-pasted in ~18 files with no shared helper today
      — consolidate those call sites at the same time). Add a `vi.setSystemTime` test pinned to ~01:00 MSK.
- [ ] Check whether Tasks.tsx multi-select is still Ctrl/Cmd/Shift+click on the row body only, with no
      visible checkbox or "select all" affordance. If so, a hover-revealed per-row checkbox is a bounded fix
      that makes the bulk-action bar (complete/today/archive/delete) discoverable.
- [ ] Check `QuickAddDialog.tsx`'s `projectId` initial state. Does it seed from the current route when opened
      from inside `/projects/:id`, or does it always default to "no project"? If the latter, seeding from
      route context is a small, safe win for in-project capture.
- [ ] Grep `pushRecent` call sites in `src/lib/recent.ts`. If still only invoked from project/client detail
      pages and never when opening a task or note, the Command Palette's "Недавнее" group can never surface
      a recently-opened task/note — a real gap in a task-centric daily loop.

### 5. UI craft & design-system fidelity
Files: `tailwind.config.ts`, `src/index.css`, `src/components/ui/*`.

- [ ] Grep `src/**/*.tsx` for `#[0-9a-fA-F]{3,8}`. Only the documented exceptions should match (5
      swatch-preview hex pairs in `types.ts`, `Celebration.tsx` confetti particles) — anything new is a
      violation of the token rule.
- [ ] Grep for `amber-400`/`amber-500` (or any raw Tailwind accent color used for semantic meaning, outside
      gamification/streak decorative flair). `src/components/ui/badge.tsx`'s `warning` variant was still raw
      `bg-amber-500/15 text-amber-400` at last check, with no `--warning` HSL var anywhere, while its
      `success`/`risk` siblings are properly tokenized — and the same raw amber is hand-rolled across ~10+
      files for the same "important/pinned/attention" semantic. Add `--warning`/`--warning-foreground` to
      both `.dark` and `.light` in `index.css`, register `warning` in `tailwind.config.ts` next to
      `risk`/`success`, then sweep every raw usage. This also fixes light-theme correctness (a fixed amber
      value never adapts the way a token does).
- [ ] Grep for `text-\[`, `rounded-\[`, `gap-\[`, `mb-\[`, `mt-\[`, `pt-\[`, `pb-\[`, `pl-\[`, `pr-\[`, `w-\[`,
      `h-\[` across `src/`. Zero matches expected outside `mask-`/`transform-`/`backdrop-` arbitraries and
      Radix-internal files (`select.tsx`, `command.tsx`). At last check the recurring offender was three
      different ad-hoc sub-`text-xs` sizes (`text-[0.7rem]`, `text-[0.65rem]`, `text-[0.6rem]`) doing the
      same "micro-label" job with no shared step — pick one, add a `2xs` fontSize token, sweep.
- [ ] Grep for `rounded-xl`/`rounded-2xl`. `tailwind.config.ts`'s `borderRadius` only defines `sm/md/lg` off
      `--radius`; `xl`/`2xl` fall back to Tailwind's hardcoded values and won't track a `--radius` retune —
      add derived `xl`/`2xl` steps if these are still used off-token.
- [ ] Grep for `text-muted-foreground/40` and `/50`. Separate purely decorative-icon uses (fine to leave
      faint) from anything carrying real text meaning (e.g. a due-date placeholder label) — text-bearing uses
      at that opacity drop well under WCAG's 4.5:1 and need a dedicated `--muted-foreground-subtle`-style
      token instead of an alpha modifier.
- [ ] Check the two-tier empty-state pattern: `EmptyState` component on list pages (Tasks/Projects/Notes/
      Archive/Calendar/Knowledge) vs. bare `<p className="text-sm text-muted-foreground">` inside Dashboard/
      Analytics widgets. If still inconsistent, a small shared "inline-empty" helper (no illustration) is the
      right weight for in-widget emptiness — not the full `EmptyState`.
- [ ] Confirm the shared-primitive conventions are used for any new UI: `Segmented` (role=group,
      aria-pressed) for list/kanban/tab-style toggles, `FilterChip` (aria-pressed + `count`) for tag/filter
      pills, `IconAction` (mandatory `label`, `reveal` hover pattern) for any icon-only button. Grep for
      hand-rolled `aria-pressed` toggles or bare `<button><Icon/></button>` outside `src/components/ui` —
      any hit is a straggler that should be routed through the shared component instead of re-implemented.
      (These three primitives were already well-adopted at last check — 8, 5, and 7+ surfaces respectively —
      don't rebuild them, just keep new work consistent with them.)

### 6. Component architecture & duplication
Files: `src/pages/Tasks.tsx`, `src/pages/ProjectDetail.tsx`, `src/pages/SettingsPage.tsx`,
`src/pages/Dashboard.tsx`, `src/store/DataProvider.tsx`, `src/components/TaskEditDialog.tsx`.

- [ ] `wc -l` every file in `src/pages` and `src/store`. Re-derive the current largest files rather than
      assuming old counts hold — `Tasks.tsx` was the largest at ~1370-1400 lines and is a genuine god
      component: filter/sort/group logic, list-row render, kanban-card render, kanban-column CRUD, the
      right-click context menu, and bulk-action handlers all live inline in one default export.
- [ ] Grep for the due-date `DropdownMenuContent` pattern (сегодня/завтра/через неделю items + a date
      `Input`) across `Tasks.tsx` (list row + kanban card), `ProjectDetail.tsx`, and `TaskEditDialog.tsx`. If
      still duplicated 3-4x with drift (one copy using a `reschedule()` helper, others inlining
      `d.setDate(d.getDate()+n)`), extract `<DueDateMenu task onChange>` — this is the highest-ROI single
      extraction in the codebase: it freezes drifting behavior and removes ~4x the same ~20 lines.
- [ ] Confirm whether a shared `<TaskRow>` exists yet (`variant="full"|"compact"|"readonly"` or similar). If
      not, and `Tasks.tsx`'s `renderRow`/`kanbanCard` and `ProjectDetail.tsx`'s `renderTaskRow` are still
      hand-separate reimplementations of the checkbox+title+priority+tags+due+delete cluster, prioritize the
      read-only variant first (covers Dashboard/Calendar/Analytics summary rows) — lowest regression risk,
      and it's the prerequisite for `React.memo` and stable callbacks to pay off anywhere.
- [ ] Grep the `setDate(getDate()±n)` + `toISOString().slice(0,10)` idiom repo-wide (it was ~18 files at last
      check). Confirm `format.ts` has grown `addDays`/`offsetDateStr` helpers to replace it — same root cause
      as the UTC-day-key UX finding, fix together.
- [ ] Re-check `DataProvider.tsx`'s exported context value. Is it still one `useMemo` keyed on `[data]`
      wrapping both the data snapshot and all ~60 action closures? If refactoring, split a stable "actions"
      context (functions already use functional `setData` updaters, so they're safe to detach) from the
      volatile "data" context — this only pays off combined with `React.memo` on consumers, so sequence them
      together.
- [ ] Grep `React.memo` repo-wide. If still zero, that's consistent with the current architecture (local
      dataset sizes, single user) — not urgent standalone; revisit once `TaskRow` exists.

### 7. Accessibility & mobile
Files: `src/store/ToastProvider.tsx`, `src/components/ui/icon-action.tsx` and other shared primitives,
`src/pages/Tasks.tsx`, `src/components/layout/MobileNav.tsx`, `index.html`, `public/manifest.webmanifest`,
`src/pages/CalendarPage.tsx`, `src/pages/ProjectDetail.tsx`.

- [ ] Check `ToastProvider.tsx`'s toast container `div` for `role="status"`/`aria-live="polite"`/
      `aria-atomic="true"`. Toasts are the app's only async feedback channel, including the 5-second undo
      window — if still missing, this is a one-line, high-impact fix.
- [ ] Grep for `Button size="icon"` (or any bare `<button>` wrapping a single lucide icon) outside
      `icon-action.tsx`. Cross-check each for an `aria-label`/`title`. At last check several existed with
      neither (Notes.tsx edit/delete, CalendarPage.tsx nav chevrons, Dashboard.tsx add buttons,
      ProjectDetail.tsx add buttons, Tasks.tsx subtask-expand chevron and clear-selection). Route through
      `IconAction` (its `label` prop is mandatory by type) or add `aria-label` directly; toggle-style icons
      (the "Важное" star, tag button) additionally need `aria-pressed`.
- [ ] Grep `index.html`/`public/manifest.webmanifest` and `src/` for `env(safe-area-inset`. If still absent
      despite `viewport-fit=cover` being set, `MobileNav.tsx`'s fixed bottom bar renders under the iOS
      home-indicator strip in standalone PWA mode — add `padding-bottom: env(safe-area-inset-bottom)` to
      `MobileNav`/`BottomDock`/the content's bottom clearance.
- [ ] Check `index.html`'s `apple-touch-icon` link and the manifest's icon list for a 192px/512px PNG. If
      only `icon.svg` exists, export PNG sizes — iOS Safari silently fails to use an SVG apple-touch-icon.
- [ ] Grep `draggable` in `CalendarPage.tsx` and `ProjectDetail.tsx` (section reorder). Confirm these still
      have no touch/keyboard alternative, unlike `Tasks.tsx`'s kanban cards (`tabIndex`, `role`,
      `ArrowLeft/Right` move). At minimum ensure every drag-only interaction has an edit-dialog/dropdown
      escape hatch reachable without a mouse.
- [ ] Re-check `role="listitem"` usages (kanban cards in `Tasks.tsx`) for an enclosing `role="list"`
      container — an orphaned `listitem` is invalid ARIA.
- [ ] Spot-check touch-target sizing on dense inline icon controls (star toggle, tag-remove `X`,
      priority/date pills) — anything under roughly a 40-44px hit area on a surface that's an actual mobile
      PWA is worth padding out (padding, not icon size).
- [ ] Note that `prefers-reduced-motion` is already honored two ways (a CSS kill-switch in `index.css` and
      per-component `useReducedMotion()` hooks) — don't re-flag this. It does **not** cover framer-motion's
      own spring/`layout`/`Reorder`/`AnimatePresence` animations, which are JS/rAF-driven; if vestibular
      accessibility becomes a priority, that's the actual remaining gap, not the CSS-level toggle.

### 8. Test coverage
Files: `src/lib/__tests__/*`, `package.json` scripts, `vitest` config.

- [ ] Run `npx vitest run` and `npx tsc --noEmit`. Both must be clean; note the current test count (29 tests
      / 4 files at last audit) so a silent test deletion is visible on the next run.
- [ ] Check for `src/lib/__tests__/storage.test.ts`. If absent, this is still the single highest-value gap
      (see Data layer section) — write it before any other storage/schema change, not after.
- [ ] Check for `undoStack.test.ts` and `meetingSync.test.ts`. Both protect small, self-contained,
      high-consequence invariants (idempotent undo; "meetings are one record, never duplicated" via
      delete-after-import) currently unverified by any test.
- [ ] Check `advanceDate`'s recurrence branches (weekly/weekdays/monthly/monthly-first-monday) for coverage
      beyond the one `daily` case in `flows.test.tsx`. The `monthly` branch does a bare
      `setMonth(getMonth()+1)` with no day-clamp — a task recurring monthly from the 31st silently skips
      short months.
- [ ] Check for `gamification.test.ts`/`gameStats.test.ts` covering `levelFromXp`/`levelProgress`/
      `computeStreak`/`computeComeback` — pure, cheaply testable functions with date-arithmetic and
      hour-boundary logic that's easy to get off-by-one, currently uncovered.
- [ ] If/when the UTC-day-key fix lands (see Core UX flows), write its regression tests (`vi.setSystemTime`
      at 00:30 and 23:59 local) at the same time — not against the current UTC behavior first, or you'll
      write tests you immediately have to rewrite.
- [ ] Do **not** add a CI workflow, pre-commit hook, or lint-staged config as a "fix" for the manual-gate
      observation. That conflicts with the no-git-commands guardrail. If tooling is wanted, the acceptable
      form is a convenience script (e.g. `"check": "tsc --noEmit && vitest run"`) the user runs by hand.

### 9. Product strategy / growth
Files: `src/App.tsx`, `src/lib/navConfig.ts`, `src/components/layout/MobileNav.tsx`, `src/pages/Dashboard.tsx`,
`src/lib/roadmap.ts`.

- [ ] Re-run `Glob "src/pages/Client*.tsx"` and check `src/App.tsx` for `/clients` before reusing any old
      finding that cites `Clients.tsx`/`ClientDetail.tsx` (see the drift callout above).
- [ ] Compare `MobileNav.tsx`'s hard-coded item list against `navConfig.ts`'s `NAV_ITEMS` +
      `loadNavOrder`/`loadNavHidden`. If MobileNav still hand-codes its own subset instead of deriving from
      the shared config, the two navs will silently drift whenever a page is added/removed/reordered on
      desktop.
- [ ] Check `src/App.tsx`'s `<Routes>` for a catch-all `path="*"`. If still absent, a stale/typo'd deep link
      renders a blank content region instead of a not-found state.
- [ ] Re-read `Dashboard.tsx`'s own mobile-grid comment and widget count. A drag-customizable 12-col grid is
      high-complexity chrome for a single owner who is unlikely to spend time rearranging widgets — weigh a
      fixed, opinionated default layout against the configurable one, but treat this as a product-taste
      discussion with the user, not something to auto-restructure.
- [ ] Check whatever module builds the AI/insights data snapshot (if that feature is live) — confirm it
      reasons over the full data model actually in use (not silently omitting an entity type that has since
      been added or resurfaced, e.g. clients/risk if that UI returns).
- [ ] Confirm shipped roadmap items are removed from `SHIPPED_TITLES` in `roadmap.ts` per the close-roadmap-
      items guardrail, and that any new spec's backlog items were synced into `DEFAULT_PLANNED`, not just
      written as a standalone markdown doc.
- [ ] Do not propose new pages or feature categories here. Findings in this section should be about
      deepening/simplifying what exists (fewer competing "today" surfaces, tighter nav parity, resolving the
      dead Client-subsystem question) per the depth-over-breadth guardrail — not roadmap expansion.

## Verification / build-and-test gate

Run these, in this order, every audit pass — and after any fix applied during the pass:

1. `npx tsc --noEmit` — must exit 0.
2. `npx vitest run` — must pass; note the test/file count so silent deletions are visible.
3. `npm run build` — must complete cleanly; read the chunk-size table and note any ">500 kB" warning and the
   initial/vendor chunk's raw+gzip size.
4. `npm run preview` if a manual visual sanity check is useful — but per the no-Playwright guardrail, do
   **not** drive it with any browser-automation tool. Either read served output/console manually or ask the
   user to look and report back.
5. Do not run `npm audit fix` or bump dependency versions as an unannounced side effect of an audit — call
   it out as its own recommendation instead.
6. Do not run any `git` command beyond narrating status conceptually — no `add`/`commit`/`push`/`reset`.

## Deliverable / report format

Write `.audit-report.md` at the CRM project root (`c:\Users\singa\Desktop\Claude\CRM\.audit-report.md`) —
not `.grooming-report.md`, that name belongs to the separate AXEVIL site. Shape:

```
# Audit report — <date>

## Summary
- Total findings: N
- Fixed in this pass: M
- Deferred: K
- Areas with nothing new to report: [list them explicitly — clean is a valid outcome]

## Data layer & persistence
### Fixed
- <file:line>: <what was wrong> → <what changed>
### Deferred
- <file:line>: <what is wrong> → <recommended fix, rough effort>

## Security & Supabase/backend
...

## Frontend performance & bundle
...

## Core UX flows (daily loop)
...

## UI craft & design-system fidelity
...

## Component architecture & duplication
...

## Accessibility & mobile
...

## Test coverage
...

## Product strategy & growth
...

## Cross-cutting
(token discipline, duplicated date-arithmetic, DataProvider god-context, or any other finding that spans
more than one area — note the shared root cause once, per the "Cross-cutting root causes" section above,
rather than filing it under every area it touches.)

## Responsiveness
(desktop/tablet/mobile findings, if a visual pass was possible without Playwright — screenshots supplied by
the user, or code-level reasoning about breakpoints/`env(safe-area-inset-*)`/overflow.)

## a11y / Performance
(manual a11y sweep findings, bundle-size deltas from the build gate above, anything Lighthouse-shaped if run
by the user manually.)
```

Do not add a commit-message convention here — this repo is not committed to by an agent. Leave
`.audit-report.md` as an uncommitted file in the working tree and tell the user it's ready to review.

## Out of scope for every audit run

Mirroring the project's own guardrails: do not add new pages, routes, or feature categories. Do not
introduce a UI library. Do not redesign the token layer from scratch — fix individual tokens in place. Do
not add CI, pre-commit hooks, or lint tooling. Do not run Playwright. Do not run git commands. Do not
unilaterally resolve the dead-but-tested Client-subsystem question (rebuild the UI, or delete the data model)
— surface it and ask. Do not treat a documented, deliberate trade-off (the SQL comments' single-user
rationale, the Dashboard Focus-mode toggle's own in-code justification, an intentionally empty
`DEFAULT_PLANNED` after a roadmap closeout) as an unexamined defect.
