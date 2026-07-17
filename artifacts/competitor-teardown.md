# Разбор конкурентов → что взяли в продукт

Синтез из `research.md` (7 конкурентов с источниками) + reference-скринов брифа.
Live-playwright-разбор был запущен, но подвис на флейки-сессии; playwright по просьбе отключён,
поэтому таблица собрана из уже проверенного research.md, а не из нового прогона. Ниже — не «что есть
у конкурента вообще», а **какой конкретный паттерн мы забрали и где он в коде**.

## Карта «фича ← конкурент»

| Наша фича | Откуда паттерн | Файл |
|---|---|---|
| Дашборд = 3 блока + money-tiles цифрами, без графиков (progressive disclosure) | Things/TickTick «Today», Notion freelancer CRM, NN/G | `pages/Dashboard.tsx` |
| Money-tiles с count-up анимацией | Notion CRM dashboards (плитки суммы), Linear (craft) | `pages/Dashboard.tsx`, `components/CountUp.tsx` |
| Клиент как хаб (проекты+задачи+деньги+активность на одном экране) | Plutio («все проекты клиента в одном месте»), HoneyBook | `pages/ClientDetail.tsx` |
| Проект как хаб с инлайн-добавлением задач | Plutio, Bonsai (проект→задачи) | `pages/ProjectDetail.tsx` |
| Умные списки задач: Сегодня/Просрочено/Предстоящие/Без срока/Важные/Завершённые | Todoist (Today/Upcoming), Things (Today/Inbox) | `pages/Tasks.tsx` |
| Флаг «важно» (звезда) + список «Важные» | Reference-скрин 2 брифа («Важно»/«Важные») | `pages/Tasks.tsx`, `TaskEditDialog.tsx` |
| Чек-лист подзадач: модель Things (внутри задачи) + прогресс-бар Plutio + сворачивание Todoist | Things + Plutio + Todoist | `pages/Tasks.tsx`, `ui/progress.tsx` |
| Счётчик «N/M» при сворачивании | Todoist | `pages/Tasks.tsx` |
| Быстрый ввод с распознаванием дат словами | Todoist/Superlist/Amie (natural language) | `components/QuickAddDialog.tsx`, `lib/nlp.ts` |
| Глобальный quick-add с любого экрана | Todoist/TickTick (capture не привязан к экрану) | `QuickAddDialog` + `⌘K`/`N` |
| Command palette (⌘K): навигация+действие+поиск | Linear (Cmd+K как ядро UX) | `components/CommandPalette.tsx` |
| Счётчики-бейджи в навигации (Задачи=сегодня, Клиенты=риск) | Reference-скрин 2 («Входящие 3», «Важные 1») | `layout/Sidebar.tsx` |
| «Зона риска» клиента 14/30 дней, настраиваемая | NeetoCRM (threshold), общая практика 30–90 дн | `store/DataProvider.tsx`, `pages/SettingsPage.tsx` |
| Attention-pulse на бейдже риска | Linear/CRM «нужен follow-up» акценты | `pages/Clients.tsx` (`animate-risk-pulse`) |
| Empty state = онбординг с одним CTA | NN/G empty-state, общая best practice | `components/EmptyState.tsx` |
| Undo при удалении (toast «Вернуть») | Linear/Gmail undo-паттерн | `store/ToastProvider.tsx` |
| Календарь-сетка месяца с точками встреч | Amie/Sunsama (календарь как полноценный вид), Tweek (сетка) | `pages/CalendarPage.tsx` |
| Тёмная/светлая тема | Linear (тёмная палитра как база) | `index.css`, `pages/SettingsPage.tsx` |
| Drag-to-reorder задач (spring) | Todoist/TickTick ручной порядок | `pages/Tasks.tsx` (Framer `Reorder`) |
| Микро-праздник при закрытии всех задач дня | геймификация Todoist/Streaks | `components/Celebration.tsx` |
| Горячие клавиши (N, /, ⌘K, ?) | Linear (keyboard-first) | `layout/AppLayout.tsx`, `ShortcutsDialog.tsx` |
| JSON экспорт/импорт (локальный бэкап) | здравый смысл для local-first до Supabase | `pages/SettingsPage.tsx` |

## Что осознанно НЕ взяли (anti-scope)

- Графики динамики (Notion/скрин-1 «Динамика выручки») — иерархия дашборда без BI.
- Канбан-доска сделок (Dubsado/17hats pipeline) — слишком «кабина пилота».
- Тайм-трекинг/ставки (Bonsai/скрин-1 «Часы и ставка»).
- Интеграции/уведомления (Akiflow) — вся их ценность в интеграциях, это отдельный продукт.
- Произвольная глубина подзадач (Superlist/TickTick 5 уровней) — держим 2 уровня.

## Незакрытое из research (кандидаты на следующие волны)

- Natural-language парсер сейчас покрывает даты; теги/приоритет словами (`#клиент`, `!важно`) — кандидат.
- «Client as hub» можно углубить: платежи как список транзакций (пока одно поле «ожидается»).
- Recurring-задачи (TickTick) — намеренно отложены, могут понадобиться под рутину.
