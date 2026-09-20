import { useEffect, useRef, useState } from "react";
import { ExternalLink, Heart, ImagePlus, Link2, Loader2, Star, Trash2, Wand2, X, Eye, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { FilterChip } from "@/components/ui/filter-chip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TaskTag } from "@/components/TaskTag";
import { Markdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { extractLinks } from "@/lib/links";
import {
  LIBRARY_TYPES,
  LIBRARY_TYPE_ORDER,
  LIBRARY_STATUSES,
  LIBRARY_STATUS_ORDER,
  detectType,
  unfurl,
  uploadCover,
  type LibraryDraft,
  type LibraryItem,
  type LibraryType,
  type LibraryStatus,
} from "@/lib/library";
import { TYPE_ICON, TYPE_STYLE } from "@/components/library/libraryMeta";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Edit mode: every field autosaves through `onUpdate`. */
  item?: LibraryItem | null;
  /** Create mode: the form starts from this draft and `onCreate` fires on «Сохранить». */
  draft?: LibraryDraft | null;
  onCreate?: (draft: LibraryDraft) => void | Promise<void>;
  onUpdate?: (id: string, patch: Partial<LibraryDraft>) => void;
  onDelete?: (item: LibraryItem) => void;
  /** Tags already used in the library — offered as one-tap chips. */
  knownTags: string[];
}

/**
 * One dialog for both «добавить» and the item's own card. Create mode collects a draft and saves
 * once; edit mode writes each field as you leave it, so there is no Save button to forget.
 */
export function LibraryItemDialog({ open, onOpenChange, item, draft, onCreate, onUpdate, onDelete, knownTags }: Props) {
  const editing = !!item;
  const [f, setF] = useState<LibraryDraft>(() => blank());
  const [tagDraft, setTagDraft] = useState("");
  const [coverLinkOpen, setCoverLinkOpen] = useState(false);
  const [coverLink, setCoverLink] = useState("");
  const [unfurling, setUnfurling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewNotes, setPreviewNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoUnfurled = useRef<string | null>(null);

  // Reset the form when a different item / draft opens.
  useEffect(() => {
    if (!open) return;
    const base: LibraryDraft = item ? { ...toDraft(item) } : draft ? { ...draft } : blank();
    setF(base);
    setTagDraft("");
    setCoverLinkOpen(false);
    setPreviewNotes(!!item && !!item.notes);
    setSaving(false);
    // Create mode with a link but no title → fetch OG data straight away, once per url.
    if (!item && base.url && !base.title && autoUnfurled.current !== base.url) {
      autoUnfurled.current = base.url;
      void fill(base.url, base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, draft]);

  /** Local change; in edit mode also persists it. */
  function commit(patch: Partial<LibraryDraft>) {
    setF((cur) => ({ ...cur, ...patch }));
    if (editing && item) onUpdate?.(item.id, patch);
  }

  async function fill(url: string, base?: LibraryDraft) {
    setUnfurling(true);
    try {
      const meta = await unfurl(url);
      const cur = base ?? f;
      const patch: Partial<LibraryDraft> = {};
      if (meta.title && !cur.title) patch.title = meta.title;
      if (meta.description && !cur.description) patch.description = meta.description;
      if (meta.image && !cur.coverUrl) patch.coverUrl = meta.image;
      if (meta.author && !cur.author) patch.author = meta.author;
      if (Object.keys(patch).length) commit(patch);
    } finally {
      setUnfurling(false);
    }
  }

  function setUrl(raw: string) {
    const found = extractLinks(raw)[0];
    const url = found?.url ?? (raw.trim() || undefined);
    const patch: Partial<LibraryDraft> = { url, domain: found?.domain };
    // Only re-guess the type while the user hasn't picked one by hand for this item.
    if (!editing && url) patch.type = detectType(url);
    commit(patch);
  }

  function addTags(raw: string) {
    const parts = raw.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    commit({ tags: [...new Set([...f.tags, ...parts])] });
    setTagDraft("");
  }

  async function onCover(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      commit({ coverUrl: await uploadCover(file) });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!f.title.trim() || !onCreate) return;
    setSaving(true);
    try {
      await onCreate({ ...f, title: f.title.trim() });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const Icon = TYPE_ICON[f.type];
  const style = TYPE_STYLE[f.type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,56rem)] max-w-none gap-0 overflow-y-auto p-0">
        <DialogTitle className="sr-only">{editing ? "Элемент библиотеки" : "Добавить в библиотеку"}</DialogTitle>
        <div className="grid gap-0 md:grid-cols-[16rem_1fr]">
          {/* Cover column */}
          <div className="flex flex-col gap-3 border-b border-border p-4 md:border-b-0 md:border-r">
            <div className={cn("relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br", style.plate)}>
              {f.coverUrl ? (
                <img src={f.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon className="h-12 w-12 opacity-80" />
              )}
              {f.coverUrl && (
                <button
                  type="button"
                  aria-label="Убрать обложку"
                  title="Убрать обложку"
                  onClick={() => commit({ coverUrl: undefined })}
                  className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-muted-foreground backdrop-blur hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60"><Loader2 className="h-5 w-5 animate-spin" /></div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <ImagePlus className="h-3.5 w-3.5" /> Загрузить
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setCoverLinkOpen((v) => !v)}>
                <Link2 className="h-3.5 w-3.5" /> По ссылке
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onCover(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </div>
            {coverLinkOpen && (
              <Input
                autoFocus
                value={coverLink}
                onChange={(e) => setCoverLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && coverLink.trim()) { commit({ coverUrl: coverLink.trim() }); setCoverLink(""); setCoverLinkOpen(false); }
                  if (e.key === "Escape") setCoverLinkOpen(false);
                }}
                placeholder="https://… картинка, Enter"
                className="h-8 text-xs"
              />
            )}

            <div className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Статус</span>
              <Segmented<LibraryStatus>
                ariaLabel="Статус"
                value={f.status}
                onChange={(v) => commit({ status: v })}
                options={LIBRARY_STATUS_ORDER.map((s) => ({ value: s, label: LIBRARY_STATUSES[s].label, title: s === "done" ? LIBRARY_TYPES[f.type].done : undefined }))}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Оценка</span>
              <span className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`Оценка ${n}`}
                    onClick={() => commit({ rating: f.rating === n ? undefined : n })}
                    className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-amber-400"
                  >
                    <Star className={cn("h-4 w-4", (f.rating ?? 0) >= n && "fill-amber-400 text-amber-400")} />
                  </button>
                ))}
              </span>
            </div>
            <Button
              variant={f.favorite ? "secondary" : "outline"}
              size="sm"
              className={cn("gap-1.5", f.favorite && "text-rose-400")}
              onClick={() => commit({ favorite: !f.favorite })}
            >
              <Heart className={cn("h-3.5 w-3.5", f.favorite && "fill-current")} /> {f.favorite ? "В избранном" : "В избранное"}
            </Button>
          </div>

          {/* Fields column */}
          <div className="flex flex-col gap-4 p-4 md:p-5">
            <div className="flex flex-wrap gap-1.5">
              {LIBRARY_TYPE_ORDER.map((t) => {
                const I = TYPE_ICON[t];
                return (
                  <FilterChip key={t} active={f.type === t} activeClassName={TYPE_STYLE[t].chip} onClick={() => commit({ type: t as LibraryType })}>
                    <I className="mr-1 h-3 w-3" />{LIBRARY_TYPES[t].label}
                  </FilterChip>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Input
                value={f.url ?? ""}
                onChange={(e) => setF((cur) => ({ ...cur, url: e.target.value }))}
                onBlur={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setUrl((e.target as HTMLInputElement).value); if (f.url) fill(f.url); } }}
                placeholder="Ссылка (необязательно)"
              />
              <Button variant="outline" className="shrink-0 gap-1.5" onClick={() => f.url && fill(f.url)} disabled={!f.url || unfurling} title="Подтянуть название, описание и обложку по ссылке">
                {unfurling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Заполнить
              </Button>
            </div>

            <Input
              value={f.title}
              onChange={(e) => setF((cur) => ({ ...cur, title: e.target.value }))}
              onBlur={(e) => editing && commit({ title: e.target.value.trim() || f.title })}
              placeholder="Название"
              className="text-base font-medium"
              autoFocus={!editing}
            />
            <Input
              value={f.author ?? ""}
              onChange={(e) => setF((cur) => ({ ...cur, author: e.target.value }))}
              onBlur={(e) => editing && commit({ author: e.target.value.trim() || undefined })}
              placeholder="Автор / канал / источник"
            />
            <Textarea
              value={f.description ?? ""}
              onChange={(e) => setF((cur) => ({ ...cur, description: e.target.value }))}
              onBlur={(e) => editing && commit({ description: e.target.value.trim() || undefined })}
              placeholder="О чём это — пара строк"
              className="min-h-[3.5rem] resize-y"
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {f.tags.map((t) => (
                  <TaskTag key={t} tag={t} onRemove={() => commit({ tags: f.tags.filter((x) => x !== t) })} />
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTags(tagDraft); } }}
                  onBlur={() => addTags(tagDraft)}
                  placeholder={f.tags.length ? "+ тег" : "Теги через запятую…"}
                  className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              {knownTags.filter((t) => !f.tags.includes(t)).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {knownTags.filter((t) => !f.tags.includes(t)).slice(0, 12).map((t) => (
                    <button key={t} type="button" onClick={() => commit({ tags: [...f.tags, t] })} className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Мои заметки · markdown</span>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setPreviewNotes((v) => !v)}>
                  {previewNotes ? <><Pencil className="h-3.5 w-3.5" /> Редактировать</> : <><Eye className="h-3.5 w-3.5" /> Предпросмотр</>}
                </Button>
              </div>
              {previewNotes ? (
                <div className="min-h-[8rem] rounded-md border border-border p-3" onClick={() => setPreviewNotes(false)}>
                  {f.notes.trim() ? <Markdown source={f.notes} bodyClassName="text-sm text-foreground/90" /> : <p className="text-sm text-muted-foreground">Пусто — нажмите, чтобы написать.</p>}
                </div>
              ) : (
                <Textarea
                  value={f.notes}
                  onChange={(e) => setF((cur) => ({ ...cur, notes: e.target.value }))}
                  onBlur={(e) => editing && commit({ notes: e.target.value })}
                  placeholder="Мысли, цитаты, что забрать себе… **жирный**, - списки, > цитаты"
                  className="min-h-[8rem] resize-y font-mono text-[0.8rem] leading-relaxed"
                />
              )}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              {item && <span>Добавлено {formatDate(item.createdAt)}{item.domain ? ` · ${item.domain}` : ""}</span>}
              <span className="ml-auto flex items-center gap-2">
                {f.url && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild>
                    <a href={f.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Открыть источник</a>
                  </Button>
                )}
                {editing && item && onDelete && (
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-risk hover:text-risk" onClick={() => { onDelete(item); onOpenChange(false); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Удалить
                  </Button>
                )}
                {!editing && (
                  <Button size="sm" className="h-8" onClick={save} disabled={!f.title.trim() || saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                  </Button>
                )}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function blank(): LibraryDraft {
  return { type: "book", title: "", notes: "", tags: [], status: "want", favorite: false };
}

function toDraft(i: LibraryItem): LibraryDraft {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = i;
  return rest;
}
