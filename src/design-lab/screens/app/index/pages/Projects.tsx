/**
 * «Индекс» · Проекты — an editorial index of projects, table-first: number, name (+ status),
 * client, health, progress line, tasks done/total, overdue, time left, priority signal.
 * Filter = numbered tabs, sort = quiet text segment. One lime element: «Новый проект».
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useData } from "@/store/DataProvider";
import { useToast } from "@/store/ToastProvider";
import { formatDuration } from "@/lib/format";
import type { Priority, ProjectStatus } from "@/types";
import {
  B,
  T,
  tab,
  pad2,
  display,
  Page,
  PageHeader,
  SectionHead,
  Stats,
  Line,
  Empty,
  Button,
  CtaBar,
  NumTabs,
  plural,
} from "@/design-lab/screens/_kit/index";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  PRIORITY_RANK,
  HEALTH_RANK,
  projectNumbers,
  healthLabel,
  healthTone,
  Menu,
  DotsButton,
  PriorityPick,
  TextSeg,
  Panel,
  FieldRow,
  ValueButton,
  PH,
} from "./Projects.parts";

type Filter = "all" | ProjectStatus;
type SortMode = "manual" | "priority" | "health" | "name" | "progress" | "tasks";
const NONE = "none";

const COLS = "28px minmax(0,2.1fr) minmax(0,1fr) 84px minmax(0,1.3fr) 56px 64px 64px 40px 32px";

export default function Projects() {
  const { projects, tasks, clients, settings, addProject, updateProject, createProjectFromTemplate, archiveProject, unarchiveProject } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortMode>("manual");
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () =>
      projects.map((p) => ({
        p,
        n: projectNumbers(tasks.filter((t) => t.projectId === p.id)),
        client: p.clientId ? clients.find((c) => c.id === p.clientId) : undefined,
      })),
    [projects, tasks, clients]
  );

  const visible = useMemo(() => {
    const list = filter === "all" ? rows : rows.filter((r) => r.p.status === filter);
    if (sortBy === "manual") return list;
    return [...list].sort((a, b) => {
      if (sortBy === "name") return a.p.name.localeCompare(b.p.name);
      if (sortBy === "priority") return PRIORITY_RANK[a.p.priority ?? 0] - PRIORITY_RANK[b.p.priority ?? 0];
      if (sortBy === "tasks") return b.n.total - a.n.total;
      if (sortBy === "health") return HEALTH_RANK[a.n.health] - HEALTH_RANK[b.n.health];
      return b.n.pct - a.n.pct;
    });
  }, [rows, filter, sortBy]);

  const active = rows.filter((r) => r.p.status === "active").length;
  const risky = rows.filter((r) => r.n.health === "off-track" || r.n.health === "at-risk").length;
  const openTasks = rows.reduce((s, r) => s + r.n.open, 0);
  const overdue = rows.reduce((s, r) => s + r.n.overdue, 0);
  const allDone = rows.reduce((s, r) => s + r.n.done, 0);
  const allTotal = rows.reduce((s, r) => s + r.n.total, 0);
  const done = rows.filter((r) => r.p.status === "done").length;
  const offTrack = rows.filter((r) => r.n.health === "off-track").length;

  function archive(id: string) {
    archiveProject(id);
    toast("Проект в архиве", { actionLabel: "Вернуть", onAction: () => unarchiveProject(id) });
  }

  return (
    <Page>
      <PageHeader
        title="Проекты"
        deck={
          projects.length ? (
            <>
              {active} в работе{done ? <>, {done} {plural(done, "завершён", "завершено", "завершено")}</> : null}. Задачи, сгруппированные по направлению работы.
            </>
          ) : (
            "Задачи, сгруппированные по направлению работы."
          )
        }
        graphic="topo"
        seed={7}
        size={80}
        actions={
          <Button size="lg" onClick={() => setOpen(true)}>
            Новый проект
          </Button>
        }
      />

      {projects.length === 0 ? (
        <div className="mt-6 grid grid-cols-4 gap-x-5" style={{ borderTop: `1px solid ${B.l10}` }}>
          <div className="col-span-1 pt-8">
            <Empty title="Пока нет проектов" text="Проект группирует задачи по направлению работы. Создайте первый и наполните его задачами." seed={7} height={120} />
          </div>
        </div>
      ) : (
        <>
          <Stats
            items={[
              { k: "В работе", v: active, sub: `из ${projects.length} ${plural(projects.length, "проекта", "проектов", "проектов")}` },
              { k: "Открытых задач", v: openTasks, sub: overdue ? `${overdue} просрочено` : "без просрочек", hot: overdue > 0 },
              { k: "Закрыто", v: `${allTotal ? Math.round((allDone / allTotal) * 100) : 0}%`, sub: `${allDone} из ${allTotal} задач` },
              { k: "Под риском", v: risky, sub: risky ? `${offTrack} сорвано · ${risky - offTrack} риск` : "все на треке", hot: offTrack > 0 },
            ]}
          />

          <section className="mt-16">
            <SectionHead n="01" title="Индекс" meta={`${visible.length} из ${projects.length}`} />
            <div className="mt-8">
              <NumTabs<Filter>
                value={filter}
                onChange={setFilter}
                items={[
                  { id: "all", label: "Все", count: rows.length },
                  ...STATUS_ORDER.map((s) => ({ id: s as Filter, label: STATUS_LABEL[s], count: rows.filter((r) => r.p.status === s).length })),
                ]}
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-4">
              <span style={{ ...T.meta, color: B.off }}>Сортировка</span>
              <TextSeg<SortMode>
                label="Сортировка проектов"
                value={sortBy}
                onChange={setSortBy}
                items={[
                  { value: "manual", label: "Как есть" },
                  { value: "priority", label: "Приоритет" },
                  { value: "health", label: "Состояние" },
                  { value: "name", label: "Имя" },
                  { value: "progress", label: "Прогресс" },
                  { value: "tasks", label: "Кол-во" },
                ]}
              />
            </div>

            {visible.length === 0 ? (
              <div className="mt-6 flex items-center justify-between py-8" style={{ borderTop: `1px solid ${B.l10}`, borderBottom: `1px solid ${B.l7}` }}>
                <span style={{ ...T.body, color: B.text3 }}>Нет проектов с таким статусом.</span>
                <Button variant="outline" size="sm" hook={false} onClick={() => setFilter("all")}>
                  Показать все
                </Button>
              </div>
            ) : (
              <div className="mt-6" role="table" aria-label="Проекты">
                <div
                  role="row"
                  className="grid h-9 items-center gap-x-4"
                  style={{ gridTemplateColumns: COLS, borderBottom: `1px solid ${B.l10}`, ...T.caps, color: B.off }}
                >
                  <span>№</span>
                  <span>Проект</span>
                  <span>Клиент</span>
                  <span>Здоровье</span>
                  <span>Прогресс</span>
                  <span className="text-right">Задачи</span>
                  <span className="text-right">Просроч.</span>
                  <span className="text-right">Время</span>
                  <span className="text-center">Пр.</span>
                  <span />
                </div>
                {visible.map(({ p, n, client }, i) => (
                  <div
                    key={p.id}
                    role="row"
                    tabIndex={0}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target === e.currentTarget) navigate(`/projects/${p.id}`);
                    }}
                    className="group grid min-h-[72px] cursor-pointer items-center gap-x-4 outline-none transition-colors duration-200 hover:bg-white/[0.02] focus-visible:bg-white/[0.03]"
                    style={{ gridTemplateColumns: COLS, borderBottom: `1px solid ${B.l7}` }}
                  >
                    <span style={{ ...T.num, color: B.off }}>{pad2(i + 1)}</span>
                    <span className="min-w-0">
                      <span className="block truncate transition-colors duration-200 group-hover:text-white" style={{ ...T.title, color: p.status === "done" || p.status === "archived" ? B.text2 : B.text }}>
                        {p.name}
                      </span>
                      <span className="mt-1 block truncate" style={{ ...T.meta, color: B.text3 }}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </span>
                    <span className="truncate" style={{ ...T.body, color: client ? B.text2 : B.off }}>
                      {client?.name ?? "—"}
                    </span>
                    <span className="truncate" style={{ ...T.meta, color: healthTone(n.health) }}>
                      {healthLabel(n.health)}
                    </span>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <Line pct={n.pct} color={n.health === "off-track" ? B.danger : B.text2} />
                      </span>
                      <span className="w-9 shrink-0 text-right" style={{ ...T.num, color: B.text3 }}>
                        {Math.round(n.pct)}%
                      </span>
                    </span>
                    <span className="text-right" style={{ ...T.body, ...tab, color: B.text2 }}>
                      {n.done}/{n.total}
                    </span>
                    <span className="text-right" style={{ ...T.body, ...tab, color: n.overdue ? B.danger : B.off }}>
                      {n.overdue || "—"}
                    </span>
                    <span
                      className="text-right"
                      title={n.estimateMin ? "Оценка открытых задач" : n.spentMin ? "Затрачено по таймеру" : undefined}
                      style={{ ...T.body, ...tab, color: n.estimateMin ? B.text2 : n.spentMin ? B.text3 : B.off }}
                    >
                      {n.estimateMin ? `≈ ${formatDuration(n.estimateMin)}` : n.spentMin ? formatDuration(n.spentMin) : "—"}
                    </span>
                    <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                      <PriorityPick value={p.priority ?? 0} onChange={(v) => updateProject(p.id, { priority: v })} />
                    </span>
                    <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <Menu
                        label={`Действия: ${p.name}`}
                        width={220}
                        items={[
                          { label: "Открыть", onSelect: () => navigate(`/projects/${p.id}`) },
                          { kind: "head", label: "Статус" },
                          ...STATUS_ORDER.map((s) => ({
                            label: STATUS_LABEL[s],
                            active: p.status === s,
                            hint: p.status === s ? "✓" : undefined,
                            onSelect: () => updateProject(p.id, { status: s }),
                          })),
                          { kind: "sep" },
                          { label: "В архив", danger: true, onSelect: () => archive(p.id) },
                        ]}
                        trigger={({ toggle, open: o }) => (
                          <span className="opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100" style={o ? { opacity: 1 } : undefined}>
                            <DotsButton label={`Действия: ${p.name}`} onClick={toggle} open={o} />
                          </span>
                        )}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <NewProjectPanel
        open={open}
        onClose={() => setOpen(false)}
        clients={clients}
        templates={settings.projectTemplates}
        onCreate={(v) => {
          if (v.templateId !== NONE) createProjectFromTemplate(v.name, v.templateId);
          else addProject({ name: v.name, status: v.status, priority: v.priority, clientId: v.clientId === NONE ? undefined : v.clientId });
          setOpen(false);
          toast(`Проект создан: ${v.name}`);
        }}
      />
    </Page>
  );
}

/* ── «Новый проект» — right panel, same fields as the real dialog ─────────────────────────── */

type Draft = { name: string; status: ProjectStatus; priority: Priority; clientId: string; templateId: string };

function NewProjectPanel({
  open,
  onClose,
  onCreate,
  clients,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (v: Draft) => void;
  clients: { id: string; name: string }[];
  templates: { id: string; name: string; tasks: unknown[] }[];
}) {
  const blank: Draft = { name: "", status: "active", priority: 0, clientId: NONE, templateId: NONE };
  const [d, setD] = useState<Draft>(blank);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const tpl = templates.find((t) => t.id === d.templateId);
  const close = () => {
    setD(blank);
    onClose();
  };
  const submit = () => {
    if (!d.name.trim()) return;
    onCreate({ ...d, name: d.name.trim() });
    setD(blank);
  };

  return (
    <Panel
      open={open}
      onClose={close}
      eyebrow="Проекты / новый"
      footer={
        <CtaBar tone="lime" onClick={submit} disabled={!d.name.trim()}>
          Создать проект
        </CtaBar>
      }
    >
      <textarea
        autoFocus
        rows={Math.min(4, Math.max(1, Math.ceil(d.name.length / 20)))}
        value={d.name}
        onChange={(e) => set({ name: e.target.value.replace(/\n/g, "") })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Название проекта"
        aria-label="Название проекта"
        className={`w-full resize-none bg-transparent outline-none ${PH}`}
        style={{ ...display(40), color: B.text }}
      />
      <p className="mt-3" style={{ ...T.meta, color: B.text3 }}>
        Enter — создать. Задачи и секции добавляются на странице проекта.
      </p>

      <div className="mt-10" style={{ borderTop: `1px solid ${B.l10}` }}>
        <FieldRow k="Статус">
          {tpl ? (
            <span style={{ ...T.body, color: B.text3 }}>В работе — из шаблона</span>
          ) : (
            <Menu
              width={200}
              items={STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], active: d.status === s, hint: d.status === s ? "✓" : undefined, onSelect: () => set({ status: s }) }))}
              trigger={({ toggle, open: o }) => (
                <ValueButton onClick={toggle} open={o}>
                  {STATUS_LABEL[d.status]}
                </ValueButton>
              )}
            />
          )}
        </FieldRow>
        {!tpl && (
          <FieldRow k="Приоритет">
            <PriorityPick value={d.priority} onChange={(p) => set({ priority: p })} />
          </FieldRow>
        )}
        {clients.length > 0 && !tpl && (
          <FieldRow k="Клиент">
            <Menu
              width={240}
              items={[
                { label: "Без клиента", active: d.clientId === NONE, onSelect: () => set({ clientId: NONE }) },
                { kind: "sep" as const },
                ...clients.map((c) => ({ label: c.name, active: d.clientId === c.id, hint: d.clientId === c.id ? "✓" : undefined, onSelect: () => set({ clientId: c.id }) })),
              ]}
              trigger={({ toggle, open: o }) => (
                <ValueButton onClick={toggle} open={o} muted={d.clientId === NONE}>
                  {clients.find((c) => c.id === d.clientId)?.name ?? "Без клиента"}
                </ValueButton>
              )}
            />
          </FieldRow>
        )}
        <FieldRow k="Шаблон" last>
          {templates.length ? (
            <Menu
              width={260}
              items={[
                { label: "Без шаблона", active: !tpl, onSelect: () => set({ templateId: NONE }) },
                { kind: "sep" as const },
                ...templates.map((t) => ({ label: t.name, hint: `${t.tasks.length} задач`, active: d.templateId === t.id, onSelect: () => set({ templateId: t.id }) })),
              ]}
              trigger={({ toggle, open: o }) => (
                <ValueButton onClick={toggle} open={o} muted={!tpl}>
                  {tpl ? tpl.name : "Без шаблона"}
                </ValueButton>
              )}
            />
          ) : (
            <span style={{ ...T.body, color: B.off }}>Шаблонов нет</span>
          )}
        </FieldRow>
      </div>
      {tpl && (
        <p className="mt-4" style={{ ...T.meta, color: B.text3 }}>
          Секции и задачи шаблона будут добавлены сразу, статус — «В работе».
        </p>
      )}
    </Panel>
  );
}
