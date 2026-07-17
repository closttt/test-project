# CRM — version 2.1 (компактный хендофф)

Личный таск-менеджер. React + Vite + TS + Tailwind + shadcn/ui. Локал-фёрст (`localStorage`), **только десктоп** (адаптив не делаем). `npx tsc --noEmit` чисто, `npx vite build` проходит (main ~159 КБ gzip).

Запуск: `cd "c:/Users/singa/Desktop/Claude/CRM" && npm install && npm run dev` → http://127.0.0.1:5173/ (сейчас поднят на :5174). Сборка: `npm run build`.

## Разделы
`/` дашборд · `/focus` · `/projects` `/projects/:id` · `/tasks` · `/notes` · `/calendar` · `/analytics` · `/archive` · `/settings` · `/achievements` · `/changelog` (Story).

## Что реализовано (2.0 + 2.1)
- **Помодоро** — глобальный таймер (`store/PomodoroProvider` + `PomodoroBar`), копит время в задачу и XP.
- **Аналитика** `/analytics` — кастомный SVG, 7/30/90 дней (`lib/analytics.ts`).
- **Инсайты** (локально, без LLM) — правый drawer `InsightsPanel`, клавиша `I`, отчёты в `lib/insights.ts` (сегодня/план/неделя/месяц/просрочка/фокус/проекты/теги). Платный AI отклонён.
- **Архив** `/archive` + мягкое скрытие (`archivedAt`), авто-очистка через N дней (`storage.migrate`).
- **Задачи**: приоритеты **Высокий/Средний/Низкий** (`PRIORITY_META`), список/канбан, канбан-режимы **приоритет/проект/статус** (drag-and-drop), секции проекта (`Project.sections`/`Task.section`).
- **Заметки**: бэклинки `[[имя]]` → `WikiLink` в `lib/markdown.tsx`; на карточке проекта «Упоминания».
- **Календарь**: месяц/неделя, задачи по дедлайнам, **тайм-блокинг** (drag задач без срока в дни).
- **Дашборд**: детальные виджеты, разбивка по приоритету, ритуал-баннер («Спланировать день»/«Итоги недели» → `UIProvider.openInsight`).
- **⌘K**: полнотекстовый поиск + «Выполнить» задачу из палитры.
- **Прочее**: звук закрытия (`lib/sound.ts`), тихие часы (`ReminderEngine`+`isQuietHour`), геймификация с титулами уровней, тумблер `components/ui/switch.tsx` (фикс `shrink-0`), лёгкая айдентика (`index.css`).

## Story-роадмап (важное правило)
Раздел Story содержит редактируемый список **«Планируется»** (`lib/roadmap.ts` + `pages/Changelog.tsx`, хранение `crm-roadmap-v1`). **Правило: закрытый пункт СРАЗУ УДАЛЯЕТСЯ, а не отмечается сделанным.** Механизм: добавить точный `title` в `SHIPPED_TITLES` в `lib/roadmap.ts` → `loadPlanned()` авто-удалит его из сохранённого списка (не трогая правки пользователя). Чекбоксов в UI нет — только удаление ×. См. память `feedback_close_roadmap_items`.

## Инструменты dev
**Agentation** (npm `agentation`, agentation.dev) — визуальный фидбэк-тул, подключён **dev-only** (lazy-import под `import.meta.env.DEV` в `main.tsx`), исключён из прод-сборки. Тулбар снизу справа.

## Осталось в плане (Story «Планируется · 5»)
- **Можно сейчас (2.2):** повторы задач с правилами, экспорт CSV, шаблоны проектов, виджет «неделя впереди», зависимости задач. *(в seed `DEFAULT_PLANNED`; у пользователя в localStorage могли отличаться)*
- **Позже:** Zoom+Gmail, Web Push, тесты (E2E/unit).
- **Нужно решение:** облако-синк (Supabase), полноценный платный AI-ассистент.

## Снапшоты
Детальные: `mvp-2.0/SUMMARY.md`, `mvp-2.1/SUMMARY.md`. Спека 2.0: `docs/superpowers/specs/2026-07-13-v2-bundle-design.md`.
