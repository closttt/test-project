/**
 * База знаний · Craft · v5 «Обзор» — the live /knowledge page: a bento of reading progress, the
 * queue, the «Конспекты» vault and the link shelf (refs 8, 15).
 *
 *   ┌ ring n/всего изучено │ split Хочу · В процессе · Готово │ paste link [Добавить] ┐
 *   ┌ Очередь чтения (cover strip, round «закрыть» checkbox) ┐ ┌ Пополнение · 8 недель ┐
 *   ┌ Конспекты: folder tree + search │ folder contents ┐ ┌ Закрытые ┐ ┌ Полка ссылок ┐
 * Materials and notes open on a minimal sheet; links open in a new tab.
 *
 * Deep links kept from the old page: location.state { tab, openLibraryId } (palette, dashboard)
 * and ?url=&text=&title= (the phone's Share Target) — consumed once, then cleared.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, Library, Link2, Pencil, Plus, Send, Trash2 } from "lucide-react";

import { Btn, C, CapsuleBars, R, Ring, SplitBar, T, dashed } from "@/design-lab/screens/_kit/craft";
import { CraftShell } from "@/design-lab/screens/_kit/craftShell";
import {
  AddBar,
  ConfirmDialog,
  Cover,
  Favicon,
  KnStyles,
  LIBRARY_TYPES,
  LibraryEditor,
  LibraryView,
  LinkEditor,
  NameDialog,
  NoteDialog,
  Pill,
  RowAct,
  Seg,
  SeenCheck,
  TINT,
  Thumb,
  clean,
  dateLabel,
  libStats,
  matchLib,
  matchLink,
  plural,
  toggleSeen,
  useKnowledge,
  useWide,
  type Knowledge,
  type LibraryItem,
  type LinkSection,
  type SavedLink,
} from "./_parts";
import { VaultPanel } from "./_vault";
import { useTelegramInbox } from "./_telegram";
import { linksOfSection } from "@/lib/knowledgeLinks";
import { newDraft, type LibraryDraft } from "@/lib/library";

function Tile({ area, children, className = "" }: { area: string; children: React.ReactNode; className?: string }) {
  return (
    <section data-lab-block={area} className={`flex min-w-0 flex-col p-6 ${className}`} style={{ gridArea: area, background: C.card, borderRadius: R.card }}>
      {children}
    </section>
  );
}

function Head({ title, sub, right, icon }: { title: string; sub?: React.ReactNode; right?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0" style={{ color: C.text2 }}>{icon}</span>}
        <div className="min-w-0">
          <h2 style={T.title}>{title}</h2>
          {sub && <div style={{ ...T.body, color: C.text2, marginTop: 4 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

function QueueCard({ k, i, onOpen }: { k: Knowledge; i: LibraryItem; onOpen: () => void }) {
  return (
    <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()} className="group flex w-[220px] shrink-0 cursor-pointer flex-col gap-3 outline-none">
      <div className="relative">
        <Cover item={i} radius={16} loading={k.lib.pending.has(i.id)} />
        <span className="absolute left-2.5 top-2.5">
          <SeenCheck item={i} onToggle={() => toggleSeen(k.lib, i)} size={26} onImage />
        </span>
        {i.status === "doing" && (
          <span className="absolute bottom-2.5 left-2.5 px-2.5" style={{ height: 24, lineHeight: "24px", borderRadius: 999, fontSize: 12, background: "rgba(10,132,255,0.85)", color: "#fff" }}>
            В процессе
          </span>
        )}
      </div>
      <div className="px-1">
        <div className="kn-clamp2 transition-colors group-hover:text-[#FFFFFF]" style={{ ...T.body, lineHeight: 1.35, fontWeight: 500, color: C.text }}>
          {clean(i.title) || i.domain}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 truncate" style={{ ...T.foot, color: C.text3 }}>
          {i.domain && <Favicon domain={i.domain} size={14} radius={3} />}
          <span className="truncate">{i.author ?? i.domain ?? LIBRARY_TYPES[i.type].label}</span>
        </div>
      </div>
    </article>
  );
}

function weekly(dates: string[], weeks = 8) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const out = Array.from({ length: weeks }, (_, i) => {
    const from = start - (weeks - 1 - i) * 7 * 86400000;
    const d = new Date(from);
    return { from, label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`, value: 0 };
  });
  for (const iso of dates) {
    const t = new Date(iso).getTime();
    const b = out.find((x) => t >= x.from && t < x.from + 7 * 86400000);
    if (b) b.value += 1;
  }
  return out;
}

type NavState = { tab?: "notes" | "library" | "links"; openLibraryId?: string };

export default function KnowledgeOverview() {
  const k = useKnowledge();
  const tg = useTelegramInbox(k);
  const wide = useWide(1360);
  const mid = useWide(1280);
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [queueTab, setQueueTab] = useState<"want" | "doing">("want");
  const [folder, setFolder] = useState<string | null>(null);
  const [openLib, setOpenLib] = useState<string | null>(null);
  const [draft, setDraft] = useState<LibraryDraft | null>(null);
  const [openNote, setOpenNote] = useState<{ id: string; fresh?: boolean } | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<SavedLink | null>(null);
  const [sectionDlg, setSectionDlg] = useState<{ edit?: LinkSection } | null>(null);
  const [sectionDel, setSectionDel] = useState<LinkSection | null>(null);
  const q = query.trim().toLowerCase();

  // One-shot deep links (palette / dashboard / Share Target), then cleared so back/forward doesn't replay them.
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const st = (location.state ?? {}) as NavState;
    const sp = new URLSearchParams(location.search);
    const isShare = ["url", "text", "title"].some((x) => sp.has(x));
    if (isShare) {
      // Android puts the link into `text`, iOS into `url` — look in both.
      const d = newDraft([sp.get("url"), sp.get("text")].filter(Boolean).join(" "));
      const title = sp.get("title")?.trim();
      if (title && !d.url) d.title = title;
      setDraft(d);
    }
    if (st.openLibraryId) setOpenLib(st.openLibraryId);
    if (st.tab) {
      const block = st.tab === "library" ? "queue" : st.tab;
      requestAnimationFrame(() => document.querySelector(`[data-lab-block="${block}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    if (isShare || st.tab || st.openLibraryId) navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = k.lib.items;
  const stats = libStats(items);
  const pct = items.length ? (stats.done / items.length) * 100 : 0;
  const lib = items.filter((i) => matchLib(i, q));
  const queue = lib.filter((i) => i.status === queueTab);
  const closed = lib.filter((i) => i.status === "done").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const pace = useMemo(() => weekly([...items.map((i) => i.createdAt), ...k.vault.notes.map((n) => n.createdAt), ...k.links.shelf.links.map((l) => l.createdAt)]), [items, k.vault.notes, k.links.shelf.links]);
  const month = pace.slice(-4).reduce((s, d) => s + d.value, 0);

  const opened = openLib ? items.find((i) => i.id === openLib) : undefined;
  const newNote = () => setOpenNote({ id: k.vault.create("note", folder, "", { draft: true }).id, fresh: true });

  const grid = wide
    ? { gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr)", gridTemplateAreas: `"queue queue pace" "notes notes done" "notes notes links"` }
    : { gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gridTemplateAreas: `"queue queue" "notes notes" "done links" "pace pace"` };

  return (
    <CraftShell
      active="knowledge"
      crumb="База знаний"
      icon={BookOpen}
      subtitle={`${items.length} ${plural(items.length, "материал", "материала", "материалов")} · ${k.vault.notes.length} ${plural(k.vault.notes.length, "заметка", "заметки", "заметок")} · ${k.links.shelf.links.length} ${plural(k.links.shelf.links.length, "ссылка", "ссылки", "ссылок")}`}
      search={{ value: query, onChange: setQuery, placeholder: "Поиск в базе знаний" }}
      actions={
        <Btn icon={<Plus size={16} strokeWidth={2} />} onClick={newNote}>
          Новая заметка
        </Btn>
      }
    >
      <KnStyles />
      {/* Progress strip */}
      <div data-lab-block="progress" className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 py-3 pl-4 pr-3" style={{ background: C.card, borderRadius: R.card }}>
        <div className="flex shrink-0 items-center gap-3">
          <Ring pct={pct} size={44} stroke={4}>
            <span style={{ ...T.foot, ...T.num, color: C.text2 }}>{Math.round(pct)}%</span>
          </Ring>
          <div>
            <div style={{ ...T.cell, ...T.num }}>
              {stats.done} <span style={{ color: C.text3, fontWeight: 400 }}>из {items.length}</span>
            </div>
            <div style={{ ...T.foot, color: C.text3, marginTop: 2 }}>изучено</div>
          </div>
        </div>
        <div className="hidden shrink-0 self-stretch sm:block" style={{ width: 1, background: C.line }} />
        <div className="min-w-0 shrink" style={{ width: wide ? 340 : mid ? 280 : 200, maxWidth: "100%" }}>
          <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ ...T.foot, color: C.text2 }}>
            <span className="flex items-center gap-1.5 whitespace-nowrap"><span style={{ width: 6, height: 6, borderRadius: 9, background: "#3A3A42" }} />Хочу {stats.want}</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap"><span style={{ width: 6, height: 6, borderRadius: 9, background: C.accent }} />В процессе {stats.doing}</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap"><span style={{ width: 6, height: 6, borderRadius: 9, background: C.green }} />Готово {stats.done}</span>
          </div>
          <SplitBar
            height={8}
            parts={[
              { value: stats.done, tone: "green", label: "Готово" },
              { value: stats.doing, tone: "blue", label: "В процессе" },
              { value: stats.want, tone: "neutral", label: "Хочу" },
            ]}
          />
        </div>
        <div className="hidden shrink-0 self-stretch sm:block" style={{ width: 1, background: C.line }} />
        <div data-lab-block="quick-add" className="flex min-w-[180px] flex-1">
          <AddBar iconOnly={!mid} placeholder={wide ? "Вставьте ссылку — ляжет в очередь чтения" : "Ссылка в очередь"} onSubmit={(v) => k.lib.quickAdd(v) > 0} />
        </div>
      </div>

      <div className="mt-3 grid gap-3" style={grid}>
        <Tile area="queue">
          <Head
            icon={<Library size={18} strokeWidth={1.75} />}
            title="Очередь чтения"
            sub={`${queue.length} ${plural(queue.length, "материал", "материала", "материалов")}`}
            right={
              <div className="flex shrink-0 items-center gap-2">
                {tg.count > 0 && (
                  <Pill size={36} onClick={tg.takeAll} icon={<Send size={14} strokeWidth={1.75} />} count={tg.count}>
                    Из Telegram
                  </Pill>
                )}
                <Seg
                  value={queueTab}
                  onChange={setQueueTab}
                  items={[
                    { id: "want", label: "Хочу", count: stats.want },
                    { id: "doing", label: "В процессе", count: stats.doing },
                  ]}
                />
              </div>
            }
          />
          {k.lib.loading ? (
            <div className="-mx-6 mt-5 flex gap-4 overflow-hidden px-6 pb-2">
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="w-[220px] shrink-0 animate-pulse" style={{ aspectRatio: "16 / 10", borderRadius: 16, background: C.raise }} />
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="mt-5 grid flex-1 place-items-center py-10" style={{ borderRadius: R.inner, border: `1px dashed ${C.line2}`, ...T.body, color: C.text3 }}>
              {q ? "Ничего не нашлось" : "Пусто"}
            </div>
          ) : (
            <div className="kn-scroll -mx-6 mt-5 flex gap-4 overflow-x-auto px-6 pb-2">
              {queue.map((i, n) => (
                <div key={i.id} data-lab-block={n === 0 ? "queue-card" : undefined} className="flex shrink-0">
                  <QueueCard k={k} i={i} onOpen={() => setOpenLib(i.id)} />
                </div>
              ))}
            </div>
          )}
        </Tile>

        <Tile area="pace">
          <Head
            title="Пополнение"
            right={
              <span className="whitespace-nowrap" style={{ ...T.foot, color: C.text2, padding: "6px 12px", borderRadius: 999, background: C.raise }}>
                8 недель
              </span>
            }
          />
          <div className="mt-3 flex items-baseline gap-2">
            <span style={{ ...T.num, fontSize: 40, lineHeight: 1 }}>{month}</span>
            <span style={{ ...T.body, color: C.text2 }}>{plural(month, "запись", "записи", "записей")} за 4 недели</span>
          </div>
          <div className="mt-auto pt-6">
            <CapsuleBars data={pace.map((d) => ({ label: d.label, value: d.value }))} height={150} />
          </div>
        </Tile>

        <Tile area="notes">
          <VaultPanel k={k} folder={folder} setFolder={setFolder} globalQuery={q} compact={!mid} onOpenNote={(id, fresh) => setOpenNote({ id, fresh })} />
        </Tile>

        <Tile area="done" className="!pb-3">
          <Head title="Закрытые" sub={`${closed.length} ${plural(closed.length, "материал", "материала", "материалов")}`} />
          <div className="kn-scroll -mx-3 mt-3 flex max-h-[420px] flex-col overflow-y-auto px-3">
            {closed.length === 0 ? (
              <div className="py-8 text-center" style={{ ...T.body, color: C.text3 }}>
                {q ? "Ничего не нашлось" : "Пока пусто"}
              </div>
            ) : (
              closed.map((i) => (
                <div
                  key={i.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenLib(i.id)}
                  onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && setOpenLib(i.id)}
                  className="group -mx-3 flex cursor-pointer items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-[#1C1C20]"
                  style={dashed}
                >
                  <SeenCheck item={i} onToggle={() => toggleSeen(k.lib, i)} />
                  <Thumb item={i} size={36} radius={10} />
                  <span className="kn-clamp2 min-w-0 flex-1" style={{ ...T.body, lineHeight: 1.35, color: C.text2 }}>
                    {clean(i.title) || i.domain}
                  </span>
                  <span className="shrink-0 group-hover:hidden" style={{ ...T.foot, color: C.text3 }}>
                    {dateLabel(i.updatedAt)}
                  </span>
                  <span className="-my-1 hidden shrink-0 group-hover:inline-flex">
                    <RowAct title="Удалить" danger onClick={() => k.lib.remove(i)}>
                      <Trash2 size={14} strokeWidth={1.75} />
                    </RowAct>
                  </span>
                </div>
              ))
            )}
          </div>
        </Tile>

        <Tile area="links" className="!pb-3">
          <Head icon={<Link2 size={18} strokeWidth={1.75} />} title="Полка ссылок" sub={`${k.links.shelf.links.length} в ${k.links.sections.length} ${plural(k.links.sections.length, "секции", "секциях", "секциях")}`} />
          <div className="mt-4">
            <AddBar
              height={44}
              iconOnly
              label="Добавить на полку"
              placeholder={section ? `Ссылка в «${k.links.sections.find((x) => x.id === section)?.name ?? "секцию"}»` : "Ссылка на полку"}
              onSubmit={(v) => {
                const n = k.links.add(v, { sectionId: section });
                if (!n) k.toast("Ссылок не найдено — нужен адрес с http(s)://");
                else k.toast(n === 1 ? "Ссылка добавлена" : `Добавлено ссылок: ${n}`);
                return n > 0;
              }}
            />
          </div>
          <div className="mt-3 flex flex-col">
            {[{ id: null as string | null, name: "Без секции" }, ...k.links.sections].map((s) => {
              const ls = linksOfSection(k.links.shelf.links, s.id).filter((l) => matchLink(l, q));
              if (s.id === null && ls.length === 0) return null;
              const on = section === s.id && s.id !== null;
              const real = s.id ? k.links.sections.find((x) => x.id === s.id) : undefined;
              return (
                <div key={s.id ?? "none"} style={dashed}>
                  <div className="group -mx-3 flex items-center transition-colors hover:bg-[#1C1C20]" style={{ background: on ? TINT : undefined }}>
                    <button type="button" onClick={() => setSection(on ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 text-left">
                      {ls[0] ? (
                        <Favicon domain={ls[0].domain} size={28} radius={8} />
                      ) : (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px]" style={{ background: C.raise, color: C.text3 }}>
                          <Link2 size={13} strokeWidth={1.75} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text }}>
                        {s.name}
                      </span>
                      <span className={real ? "group-hover:hidden" : ""} style={{ ...T.foot, ...T.num, fontWeight: 400, color: C.text3 }}>
                        {ls.length}
                      </span>
                    </button>
                    {real && (
                      <span className="hidden shrink-0 items-center group-hover:flex">
                        <RowAct title="Переименовать секцию" onClick={() => setSectionDlg({ edit: real })}>
                          <Pencil size={14} strokeWidth={1.75} />
                        </RowAct>
                        <RowAct title="Удалить секцию" danger onClick={() => setSectionDel(real)}>
                          <Trash2 size={14} strokeWidth={1.75} />
                        </RowAct>
                      </span>
                    )}
                    <button type="button" aria-label={on ? "Свернуть" : "Развернуть"} onClick={() => setSection(on ? null : s.id)} className="grid h-11 w-9 shrink-0 place-items-center">
                      <ChevronDown size={15} strokeWidth={1.75} color={C.text3} style={{ transform: on ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
                    </button>
                  </div>
                  {on && (
                    <div className="flex flex-col gap-1 pb-3">
                      {ls.length === 0 ? (
                        <span className="py-2" style={{ ...T.foot, color: C.text3 }}>
                          Пусто
                        </span>
                      ) : (
                        ls.map((l) => (
                          <div key={l.id} className="group flex items-center gap-1 pr-1 transition-colors hover:bg-[#1E1E22]" style={{ borderRadius: 10 }}>
                            <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5">
                              <Favicon domain={l.domain} size={20} radius={5} />
                              <span className="min-w-0 flex-1 truncate" style={{ ...T.body, color: C.text2 }}>
                                {l.title || l.domain}
                              </span>
                              <span className="shrink-0 truncate group-hover:hidden" style={{ ...T.foot, color: C.text3, maxWidth: 120 }}>
                                {l.domain}
                              </span>
                            </a>
                            <span className="hidden shrink-0 items-center group-hover:flex">
                              <RowAct title="Изменить ссылку" onClick={() => setEditLink(l)}>
                                <Pencil size={14} strokeWidth={1.75} />
                              </RowAct>
                              <RowAct title="Удалить ссылку" danger onClick={() => k.links.remove(l.id)}>
                                <Trash2 size={14} strokeWidth={1.75} />
                              </RowAct>
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={() => setSectionDlg({})} className="mt-2 inline-flex items-center gap-1.5 self-start py-2 transition-colors hover:text-[#F4F5F7]" style={{ ...T.body, color: C.text3 }}>
              <Plus size={14} strokeWidth={1.75} />
              Секция
            </button>
          </div>
        </Tile>
      </div>

      {editLink && <LinkEditor k={k} link={editLink} onClose={() => setEditLink(null)} />}
      {sectionDlg && (
        <NameDialog
          title={sectionDlg.edit ? "Секция" : "Новая секция"}
          initial={sectionDlg.edit?.name}
          placeholder="Название секции"
          onClose={() => setSectionDlg(null)}
          onSave={(name) => (sectionDlg.edit ? k.links.renameSection(sectionDlg.edit.id, name) : k.links.addSection(name))}
        />
      )}
      {sectionDel && (
        <ConfirmDialog
          title={`Удалить секцию «${sectionDel.name}»?`}
          text="Ссылки из неё останутся на полке — в «Без секции»."
          onConfirm={() => {
            if (section === sectionDel.id) setSection(null);
            k.links.removeSection(sectionDel.id);
          }}
          onClose={() => setSectionDel(null)}
        />
      )}
      {opened && <LibraryView key={opened.id} k={k} item={opened} onClose={() => setOpenLib(null)} />}
      {draft && <LibraryEditor k={k} draft={draft} onClose={() => setDraft(null)} />}
      {openNote && (
        <NoteDialog
          key={openNote.id}
          k={k}
          noteId={openNote.id}
          fresh={openNote.fresh}
          onClose={() => setOpenNote(null)}
          onOpen={(id) => setOpenNote({ id })}
          onFolder={(id) => {
            setFolder(id);
            document.querySelector('[data-lab-block="notes"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}
    </CraftShell>
  );
}
