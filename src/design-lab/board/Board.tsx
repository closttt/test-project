import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DECISIONS, REFS, type Decision, type Variant } from "@/design-lab/decisions";
import type { BlockMeta } from "@/design-lab/screens/types";

type Verdict = "" | "take" | "take-edits" | "maybe" | "no";
const VERDICTS: { value: Verdict; label: string }[] = [
  { value: "", label: "Пока без оценки" },
  { value: "take", label: "Беру" },
  { value: "take-edits", label: "Беру с правками" },
  { value: "maybe", label: "Возможно" },
  { value: "no", label: "Нет" },
];

interface FeedbackImage {
  /** Served URL (/design-lab/feedback/…) */
  url: string;
  /** Absolute file path on disk — what the redesign agent opens. */
  path: string;
}

/** One improvement request: reference screenshots + what to change, optionally pinned to a block. */
interface FeedbackItem {
  id: string;
  text: string;
  /** Legacy free-text block label. */
  area: string;
  /** Screen element id (data-lab-block) this request is about; empty = whole screen. */
  block?: string;
  images: FeedbackImage[];
  status: "open" | "done";
  createdAt: string;
}

interface Notes {
  /** decisionId → variantId → { verdict, why } */
  variants: Record<string, Record<string, { verdict: Verdict; why: string }>>;
  /** decisionId → overall note */
  summary: Record<string, string>;
  /** decisionId → variantId → improvement requests with reference screenshots */
  feedback: Record<string, Record<string, FeedbackItem[]>>;
  updatedAt?: string;
}
const EMPTY: Notes = { variants: {}, summary: {}, feedback: {} };
const LOCAL_KEY = "design-lab-notes-v1";

/** Preview size as a share of the column width (owner asked for 70% by default). */
const ZOOMS = [0.25, 0.35, 0.5, 0.7, 0.85, 1];

/** Preview size chips + a free percent field (10–100). */
function ZoomControl({ value, onChange }: { value: number; onChange: (z: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100)));
  useEffect(() => setDraft(String(Math.round(value * 100))), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 10 && n <= 100) onChange(n / 100);
    else setDraft(String(Math.round(value * 100)));
  };
  return (
    <div className="lab-zoom">
      <span>Масштаб превью:</span>
      {ZOOMS.map((z) => (
        <button key={z} className={`lab-chip ${Math.abs(value - z) < 0.001 ? "is-active" : ""}`} onClick={() => onChange(z)}>
          {Math.round(z * 100)}%
        </button>
      ))}
      <label className="lab-zoom-input">
        <input
          type="number"
          min={10}
          max={100}
          step={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        %
      </label>
    </div>
  );
}

function useStoredZoom(key: string, fallback: number): [number, (z: number) => void] {
  const [z, setZ] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      return saved >= 0.1 && saved <= 1 ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (v: number) => {
    setZ(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* best-effort */
    }
  };
  return [z, set];
}

function frameUrl(v: Variant, route: string) {
  if (v.screen) return `/design-lab-frame.html?${new URLSearchParams({ screen: v.screen, route })}`;
  const q = new URLSearchParams({ route });
  if (v.skins.length) q.set("skins", v.skins.join(","));
  return `/design-lab-frame.html?${q}`;
}

/** 1440×900 app frame scaled down to the column width — the app sees a real 1440 viewport. */
function Preview({
  src,
  width = 1440,
  height = 900,
  title,
  fullHeight,
}: {
  src: string;
  width?: number;
  height?: number;
  title: string;
  /** Grow the frame to the whole page (measured from the screen's <main>) — the full screen at once. */
  fullHeight?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.6);
  const [h, setH] = useState(height);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  useEffect(() => {
    if (!fullHeight) return;
    let ro: ResizeObserver | null = null;
    let stop = false;
    const started = Date.now();
    const attach = () => {
      if (stop) return;
      const win = frame.current?.contentWindow;
      const main = win?.document.querySelector("main") ?? null;
      if (!win || !main) {
        if (Date.now() - started < 10000) setTimeout(attach, 250);
        return;
      }
      // The page's own bottom padding (p-5 = 20px) below <main>.
      const measure = () => setH(Math.max(height, Math.ceil(main.getBoundingClientRect().bottom + win.scrollY + 20)));
      measure();
      ro = new ResizeObserver(measure);
      ro.observe(main);
    };
    const f = frame.current;
    const onLoad = () => setTimeout(attach, 300);
    f?.addEventListener("load", onLoad);
    return () => {
      stop = true;
      ro?.disconnect();
      f?.removeEventListener("load", onLoad);
    };
  }, [fullHeight, height, src]);
  return (
    <div ref={box} className="lab-preview" style={{ height: h * scale }}>
      <iframe ref={frame} title={title} src={src} style={{ width, height: h, transform: `scale(${scale})` }} />
    </div>
  );
}

/**
 * Live preview cropped to one element: the same 1440-wide frame, scrolled to the element marked
 * `data-lab-block="<block>"` and clipped to its box (+ padding). Still fully clickable.
 */
function FocusPreview({ src, block, title }: { src: string; block: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [frameH, setFrameH] = useState(900);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [missing, setMissing] = useState(false);
  const PAD = 16;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setRect(null);
    setMissing(false);
    setFrameH(900);
    let stop = false;
    let ro: ResizeObserver | null = null;
    let sized = false;
    const started = Date.now();
    const tick = () => {
      if (stop) return;
      const win = frame.current?.contentWindow;
      const el = win?.document.querySelector<HTMLElement>(`[data-lab-block="${block}"]`);
      if (!win || !el) {
        if (Date.now() - started > 8000) setMissing(true);
        else setTimeout(tick, 200);
        return;
      }
      const place = () => {
        const r = el.getBoundingClientRect();
        if (!sized) {
          // Make the frame tall enough to hold the element once (from the 900px layout), then keep it.
          sized = true;
          const need = Math.max(900, Math.ceil(r.height) + 2 * PAD + 40);
          if (need !== 900) {
            setFrameH(need);
            setTimeout(place, 120);
            return;
          }
        }
        const top = r.top + win.scrollY;
        win.scrollTo(0, Math.max(0, top - PAD - 20));
        const r2 = el.getBoundingClientRect();
        setRect({ x: r2.left, y: r2.top, w: r2.width, h: r2.height });
      };
      place();
      ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      });
      ro.observe(el);
    };
    const onLoad = () => setTimeout(tick, 300);
    const f = frame.current;
    f?.addEventListener("load", onLoad);
    if (f?.contentDocument?.readyState === "complete" && f.contentDocument.querySelector("#root")?.childElementCount) onLoad();
    return () => {
      stop = true;
      ro?.disconnect();
      f?.removeEventListener("load", onLoad);
    };
  }, [block, src]);

  const w = rect ? rect.w + 2 * PAD : 1440;
  const h = rect ? rect.h + 2 * PAD : 400;
  const scale = boxW ? Math.min(1.25, boxW / w) : 0.5;
  return (
    <div ref={box} className="lab-focus">
      <div className="lab-preview lab-preview--focus" style={{ width: w * scale, height: h * scale, opacity: rect ? 1 : 0.3 }}>
        <iframe
          ref={frame}
          title={title}
          src={src}
          style={{
            width: 1440,
            height: frameH,
            transform: rect ? `scale(${scale}) translate(${-(rect.x - PAD)}px, ${-(rect.y - PAD)}px)` : `scale(${scale})`,
          }}
        />
      </div>
      {missing && <p className="lab-sub">Не нашёл этот элемент на экране — возможно, он сейчас скрыт.</p>}
    </div>
  );
}

function toMarkdown(notes: Notes): string {
  const out: string[] = [`# Пометки дизайн-лаборатории`, ``, `_Обновлено: ${notes.updatedAt ?? "—"}_`, ``];
  for (const d of DECISIONS) {
    const vs = notes.variants[d.id] ?? {};
    const fb = notes.feedback?.[d.id] ?? {};
    const summary = notes.summary[d.id];
    const marked = d.variants.filter((v) => vs[v.id]?.verdict || vs[v.id]?.why);
    const withFb = d.variants.filter((v) => fb[v.id]?.length);
    if (!marked.length && !summary && !withFb.length) continue;
    out.push(`## ${d.code} · ${d.title}`, ``);
    for (const v of marked) {
      const n = vs[v.id];
      const verdict = VERDICTS.find((x) => x.value === n.verdict)?.label ?? "—";
      out.push(`- **${v.letter} · ${v.name}** — ${verdict}${n.why ? `\n  ${n.why.replace(/\n/g, "\n  ")}` : ""}`);
    }
    for (const v of withFb) {
      const items = fb[v.id];
      const open = items.filter((i) => i.status === "open");
      const done = items.filter((i) => i.status === "done");
      out.push(``, `### Правки к ${v.letter} · ${v.name} — открыто ${open.length}, сделано ${done.length}`, ``);
      const blockName = (id?: string) => (id ? v.blocks?.find((b) => b.id === id)?.name ?? id : "");
      [...open, ...done].forEach((it, i) => {
        const where = [blockName(it.block), it.area].filter(Boolean).join(" · ") || "Весь экран";
        const tag = it.block ? ` (block \`${it.block}\`)` : "";
        out.push(`${i + 1}. [${it.status === "done" ? "x" : " "}] **${where}**${tag} — ${it.text.replace(/\n/g, "\n   ") || "(без текста)"}`);
        for (const img of it.images) out.push(`   - реф: \`${img.path}\``);
        out.push(`   - _${it.createdAt.slice(0, 16).replace("T", " ")} · id ${it.id}_`);
      });
    }
    if (summary) out.push(``, `**Итог:** ${summary}`);
    out.push(``);
  }
  return out.join("\n");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function uploadImage(file: File): Promise<FeedbackImage> {
  const data = await readAsDataUrl(file);
  const res = await fetch("/__lab/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name || "screenshot.png", data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Не удалось загрузить");
  return json as FeedbackImage;
}

function imagesFrom(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const it of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const f = it instanceof File ? it : it.kind === "file" ? it.getAsFile() : null;
    if (f && f.type.startsWith("image/")) out.push(f);
  }
  return out;
}

/** Composer: drop / paste (anywhere on the page) / pick screenshots, describe what to improve. */
function FeedbackComposer({
  onAdd,
  onZoom,
  blocks,
  block,
}: {
  onAdd: (it: Omit<FeedbackItem, "id" | "createdAt" | "status">) => void;
  onZoom: (url: string) => void;
  /** Elements the request can be pinned to (whole-screen mode shows a picker). */
  blocks: BlockMeta[];
  /** Fixed element when the composer lives on an element's page. */
  block?: string;
}) {
  const [text, setText] = useState("");
  const [area, setArea] = useState(block ?? "");
  useEffect(() => setArea(block ?? ""), [block]);
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setError("");
    setBusy((b) => b + files.length);
    for (const f of files) {
      try {
        const img = await uploadImage(f);
        setImages((xs) => [...xs, img]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }, []);

  // Ctrl+V with an image anywhere on the board lands here.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFrom(e.clipboardData?.items);
      if (files.length) {
        e.preventDefault();
        add(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const submit = () => {
    if (!text.trim() && !images.length) return;
    onAdd({ text: text.trim(), area: "", block: area || undefined, images });
    setText("");
    setArea(block ?? "");
    setImages([]);
  };

  return (
    <div
      className={`lab-fb-composer ${over ? "is-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        add(imagesFrom(e.dataTransfer.files));
      }}
    >
      <div className="lab-fb-drop">
        {images.map((img) => (
          <div key={img.url} className="lab-fb-thumb">
            <img src={img.url} alt="" onClick={() => onZoom(img.url)} />
            <button className="lab-fb-x" title="Убрать" onClick={() => setImages((xs) => xs.filter((x) => x.url !== img.url))}>
              ×
            </button>
          </div>
        ))}
        {busy > 0 && <div className="lab-fb-thumb lab-fb-thumb--busy">Загружаю…</div>}
        <button className="lab-fb-add" onClick={() => fileRef.current?.click()}>
          <b>+ Скриншот</b>
          <span>перетащи сюда, вставь Ctrl+V или выбери файл</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            add(imagesFrom(e.target.files));
            e.target.value = "";
          }}
        />
      </div>
      {!block && blocks.length > 0 && (
        <select className="lab-fb-area" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Элемент: весь экран</option>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              Элемент: {b.name}
            </option>
          ))}
        </select>
      )}
      <textarea
        className="lab-fb-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        placeholder="Что улучшаем: что взять с рефа, что убрать, как должно стать…"
      />
      <div className="lab-fb-foot">
        <span className="lab-sub">{error ? <span className="lab-fb-err">{error}</span> : "Ctrl+Enter — добавить"}</span>
        <button className="lab-btn lab-btn--dark" disabled={busy > 0 || (!text.trim() && !images.length)} onClick={submit}>
          Добавить правку
        </button>
      </div>
    </div>
  );
}

function FeedbackList({
  items,
  onToggle,
  onRemove,
  onZoom,
  blocks,
  onOpenBlock,
}: {
  items: FeedbackItem[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onZoom: (url: string) => void;
  blocks: BlockMeta[];
  /** Whole-screen list: clicking an element chip opens that element's page. */
  onOpenBlock?: (id: string) => void;
}) {
  if (!items.length) return <p className="lab-sub lab-fb-empty">Правок пока нет — добавь первую выше.</p>;
  const sorted = [...items.filter((i) => i.status === "open").reverse(), ...items.filter((i) => i.status === "done").reverse()];
  return (
    <div className="lab-fb-list">
      {sorted.map((it) => (
        <article key={it.id} className={`lab-fb-item ${it.status === "done" ? "is-done" : ""}`}>
          {it.images.length > 0 && (
            <div className="lab-fb-imgs">
              {it.images.map((img) => (
                <img key={img.url} src={img.url} alt="" onClick={() => onZoom(img.url)} />
              ))}
            </div>
          )}
          <div className="lab-fb-body">
            <div className="lab-fb-meta">
              {it.block ? (
                <button className="lab-fb-chip lab-fb-chip--link" disabled={!onOpenBlock} onClick={() => onOpenBlock?.(it.block!)}>
                  {blocks.find((b) => b.id === it.block)?.name ?? it.block}
                </button>
              ) : (
                <span className="lab-fb-chip">{it.area || "Весь экран"}</span>
              )}
              <span>{new Date(it.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              {it.status === "done" && <span className="lab-fb-chip lab-fb-chip--done">Сделано</span>}
            </div>
            {it.text && <p className="lab-fb-desc">{it.text}</p>}
            <div className="lab-fb-actions">
              <button className="lab-btn lab-btn--small" onClick={() => onToggle(it.id)}>
                {it.status === "done" ? "Вернуть в работу" : "Отметить сделанным"}
              </button>
              <button className="lab-link" onClick={() => onRemove(it.id)}>
                Удалить
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Board() {
  const [decisionId, setDecisionId] = useState(() => new URLSearchParams(location.search).get("d") ?? "main");
  const decision = DECISIONS.find((d) => d.id === decisionId) ?? DECISIONS[0];
  /** Screen element under review (data-lab-block id); empty = the whole screen. */
  const [blockId, setBlockId] = useState(() => new URLSearchParams(location.search).get("b") ?? "");
  const [variantId, setVariantId] = useState(decision.variants.find((v) => v.id !== "now")?.id ?? decision.variants[0].id);
  const variant = decision.variants.find((v) => v.id === variantId) ?? decision.variants[0];
  const [route, setRoute] = useState(decision.route);
  const [liveRoute, setLiveRoute] = useState(decision.route);
  const [compareAll, setCompareAll] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [zoom, setZoom] = useStoredZoom("design-lab-zoom", 0.7);
  /** Element pages have their own size (a fragment usually wants to be bigger than the whole screen). */
  const [blockZoom, setBlockZoom] = useStoredZoom("design-lab-zoom-block", 1);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /** Full-size view of an attached screenshot (URL). */
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [notes, setNotes] = useState<Notes>(EMPTY);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "local">("idle");
  const loaded = useRef(false);

  // Load notes: dev-server file first (so Claude can read them), localStorage as fallback.
  useEffect(() => {
    fetch("/__lab/notes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((n: Notes) => setNotes({ ...EMPTY, ...n, feedback: n.feedback ?? {} }))
      .catch(() => {
        try {
          const local = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
          setNotes({ ...EMPTY, ...local, feedback: local.feedback ?? {} });
        } catch {
          /* keep empty */
        }
      })
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  // Autosave (debounced) to design-lab/notes.json + notes.md via the dev server.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(notes));
    } catch {
      /* best-effort */
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      fetch("/__lab/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: notes, markdown: toMarkdown(notes) }),
      })
        .then((r) => setSaveState(r.ok ? "saved" : "local"))
        .catch(() => setSaveState("local"));
    }, 600);
    return () => clearTimeout(t);
  }, [notes]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "lab:route") setLiveRoute(e.data.route);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const pickDecision = (d: Decision) => {
    setDecisionId(d.id);
    setVariantId(d.variants.find((v) => v.id !== "now")?.id ?? d.variants[0].id);
    setRoute(d.route);
    setLiveRoute(d.route);
    setCompareAll(false);
    setBlockId("");
    history.replaceState(null, "", `?d=${d.id}`);
    window.scrollTo({ top: 0 });
  };

  const setVariantNote = useCallback(
    (vId: string, patch: Partial<{ verdict: Verdict; why: string }>) =>
      setNotes((n) => {
        const forDecision = n.variants[decision.id] ?? {};
        const cur = forDecision[vId] ?? { verdict: "" as Verdict, why: "" };
        return {
          ...n,
          updatedAt: new Date().toISOString(),
          variants: { ...n.variants, [decision.id]: { ...forDecision, [vId]: { ...cur, ...patch } } },
        };
      }),
    [decision.id]
  );

  const fbItems = notes.feedback?.[decision.id]?.[variant.id] ?? [];
  const blocks = variant.blocks ?? [];
  const block = blocks.find((b) => b.id === blockId);
  const shownItems = block ? fbItems.filter((i) => i.block === block.id) : fbItems;
  const openCountFor = (id: string) => fbItems.filter((i) => i.status === "open" && (id ? i.block === id : !i.block)).length;
  const pickBlock = (id: string) => {
    setBlockId(id);
    const q = new URLSearchParams(location.search);
    if (id) q.set("b", id);
    else q.delete("b");
    history.replaceState(null, "", `?${q}`);
    window.scrollTo({ top: 0 });
  };
  const setFeedback = useCallback(
    (fn: (items: FeedbackItem[]) => FeedbackItem[]) =>
      setNotes((n) => {
        const forDecision = n.feedback?.[decision.id] ?? {};
        return {
          ...n,
          updatedAt: new Date().toISOString(),
          feedback: { ...n.feedback, [decision.id]: { ...forDecision, [variant.id]: fn(forDecision[variant.id] ?? []) } },
        };
      }),
    [decision.id, variant.id]
  );

  const decisionStatus = (d: Decision) => {
    const vs = notes.variants[d.id] ?? {};
    if (Object.values(vs).some((v) => v.verdict === "take" || v.verdict === "take-edits")) return "chosen";
    return d.status;
  };

  const download = () => {
    const blob = new Blob([toMarkdown(notes)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "design-lab-notes.md";
    a.click();
  };

  const groups = [
    { id: "_now", name: "Точка отсчёта", variants: decision.variants.filter((v) => !v.style) },
    ...(decision.styles ?? []).map((st) => ({ ...st, variants: decision.variants.filter((v) => v.style === st.id) })),
  ].filter((g) => g.variants.length > 0);
  const currentStyle = decision.styles?.find((st) => st.id === variant.style);
  const compareSet = variant.style ? decision.variants.filter((v) => v.style === variant.style) : decision.variants;

  const openCount = DECISIONS.filter((d) => d.status === "open").length;
  const variantCount = DECISIONS.reduce((s, d) => s + d.variants.length - 1, 0);
  const frameRoute = route;
  const src = useMemo(() => frameUrl(variant, frameRoute), [variant, frameRoute]);

  return (
    <div className="lab">
      <header className="lab-top">
        <div>
          <div className="lab-title">Редизайн · {decision.title}</div>
          <div className="lab-sub">
            {DECISIONS.length === 1 ? "Работаем над одним экраном" : `${DECISIONS.length} решений · ${variantCount} вариантов · ${openCount} ждут выбора`} · данные — снимок прода, только чтение
          </div>
        </div>
        <div className="lab-top-actions">
          <span className={`lab-save lab-save--${saveState}`}>
            {saveState === "saving" ? "Сохраняю…" : saveState === "saved" ? "Пометки сохранены" : saveState === "local" ? "Сохранено в браузере" : ""}
          </span>
          {decision.variants.length > 1 && <button className="lab-btn" onClick={() => setCompareAll((v) => !v)}>
            {compareAll ? "Один вариант" : "Все варианты стиля рядом"}
          </button>}
          <button className="lab-btn" onClick={download}>
            Скачать пометки
          </button>
        </div>
      </header>

      <div className={`lab-body ${DECISIONS.length === 1 && !blocks.length ? "lab-body--single" : ""}`}>
        {DECISIONS.length === 1 && blocks.length > 0 && (
          <aside className="lab-rail">
            <div className="lab-rail-label">Элементы экрана</div>
            <button className={`lab-rail-item ${!block ? "is-active" : ""}`} onClick={() => pickBlock("")}>
              <span className="lab-rail-name">Весь экран</span>
              {openCountFor("") > 0 && <span className="lab-count">{openCountFor("")}</span>}
            </button>
            <div className="lab-rail-sep" />
            {blocks.map((b, i) => (
              <button key={b.id} className={`lab-rail-item ${block?.id === b.id ? "is-active" : ""}`} onClick={() => pickBlock(b.id)}>
                <span className="lab-code">{String(i + 1).padStart(2, "0")}</span>
                <span className="lab-rail-name">{b.name}</span>
                {openCountFor(b.id) > 0 && <span className="lab-count">{openCountFor(b.id)}</span>}
              </button>
            ))}
            <div className="lab-rail-foot">
              <div className="lab-rail-label">Как работать</div>
              <p>Открой элемент, приложи референсы и напиши, что в нём поменять. Превью живое — можно кликать.</p>
              <p>Правки сохраняются сами, я читаю их вместе с картинками.</p>
            </div>
          </aside>
        )}
        {DECISIONS.length > 1 && (<aside className="lab-rail">
          <div className="lab-rail-label">Экраны</div>
          {DECISIONS.map((d) => {
            const st = decisionStatus(d);
            const on = d.id === decision.id;
            return (
              <div key={d.id}>
                <button
                  className={`lab-rail-item ${on && !block ? "is-active" : ""} ${on && block ? "is-parent" : ""} ${d.status === "queued" ? "is-queued" : ""}`}
                  onClick={() => (on ? pickBlock("") : pickDecision(d))}
                >
                  <span className="lab-code">{d.code}</span>
                  <span className="lab-rail-name">{d.title}</span>
                  {on && openCountFor("") > 0 ? (
                    <span className="lab-count">{openCountFor("")}</span>
                  ) : (
                    <span className={`lab-dot lab-dot--${st}`} title={st === "chosen" ? "Есть выбор" : st === "open" ? "Ждёт выбора" : "В очереди"} />
                  )}
                </button>
                {on && blocks.length > 0 && (
                  <div className="lab-rail-sub">
                    {blocks.map((b, i) => (
                      <button key={b.id} className={`lab-rail-item lab-rail-item--sub ${block?.id === b.id ? "is-active" : ""}`} onClick={() => pickBlock(b.id)}>
                        <span className="lab-code">{String(i + 1).padStart(2, "0")}</span>
                        <span className="lab-rail-name">{b.name}</span>
                        {openCountFor(b.id) > 0 && <span className="lab-count">{openCountFor(b.id)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="lab-rail-foot">
            <div className="lab-rail-label">Как работать</div>
            <p>У нового экрана — 5 концепций: выбери одну в оценке ниже. У выбранного экрана появляются элементы — открывай любой и оставляй правки с референсами.</p>
            <p>Превью живое, на снимке прод-данных; изменения в нём никуда не пишутся. Пометки сохраняются сами.</p>
          </div>
        </aside>)}

        <main className="lab-main">
          {block ? (
            <div className="lab-block-head">
              <button className="lab-link" onClick={() => pickBlock("")}>
                ← Весь экран
              </button>
              <h1 className="lab-block-title">{block.name}</h1>
              <p className="lab-summary">{block.about}</p>
            </div>
          ) : (
            <p className="lab-summary">{decision.summary}</p>
          )}

          {block && <ZoomControl value={blockZoom} onChange={setBlockZoom} />}
          {block && (
            <div className="lab-stage lab-stage--focus" style={{ width: `${blockZoom * 100}%` }}>
              <FocusPreview key={`${block.id}#${src}#${nonce}`} src={src} block={block.id} title={block.name} />
              <div className="lab-caption">
                <span>Живой фрагмент экрана «{variant.name}» — кликается, как в приложении.</span>
                <button className="lab-link" onClick={() => setNonce((x) => x + 1)}>
                  Перезагрузить
                </button>
              </div>
            </div>
          )}

          {!compareAll && !block && (
            <>
              {decision.variants.length > 1 && (<div className="lab-styles">
                {groups.map((g) => (
                  <div key={g.id} className={`lab-style-row ${g.id === variant.style || (!variant.style && g.id === "_now") ? "is-current" : ""}`}>
                    <div className="lab-style-name">{g.name}</div>
                    <div className="lab-tabs">
                      {g.variants.map((v) => (
                        <button key={v.id} className={`lab-tab ${v.id === variant.id ? "is-active" : ""}`} onClick={() => setVariantId(v.id)}>
                          <span className="lab-tab-letter">{v.letter}</span> {v.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              )}
              {currentStyle && decision.variants.length > 1 && <p className="lab-style-summary">{currentStyle.summary}</p>}

              {decision.routes && (
                <div className="lab-routes">
                  <span>Раздел:</span>
                  {decision.routes.map((r) => (
                    <button
                      key={r.route}
                      className={`lab-chip ${liveRoute === r.route ? "is-active" : ""}`}
                      onClick={() => {
                        setRoute(r.route);
                        setLiveRoute(r.route);
                        setNonce((x) => x + 1);
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
              <ZoomControl value={zoom} onChange={setZoom} />
              <div className="lab-stage" style={{ width: `${zoom * 100}%` }}>
                <Preview key={`${src}#${nonce}`} src={src} title={`${decision.code} ${variant.name}`} fullHeight />
                <div className="lab-caption">
                  <span>
                    <b>
                      {variant.letter} · {variant.name}
                    </b>
                    {zoom >= 0.5 && <> — {variant.composition}</>}
                  </span>
                  <span className="lab-caption-meta">1440 · весь экран целиком</span>
                </div>
              </div>
            </>
          )}

          {compareAll && (
            <div className="lab-grid">
              {compareSet.map((v) => (
                <div key={v.id} className="lab-grid-cell">
                  <div className="lab-grid-head">
                    <b>
                      {v.letter} · {v.name}
                    </b>
                    <button
                      className="lab-link"
                      onClick={() => {
                        setVariantId(v.id);
                        setCompareAll(false);
                      }}
                    >
                      Открыть
                    </button>
                  </div>
                  <Preview src={frameUrl(v, route)} title={v.name} />
                </div>
              ))}
            </div>
          )}

          <section className="lab-fb">
            <div className="lab-fb-head">
              <div>
                <h2>Рефы и правки · {block ? block.name : "весь экран"}</h2>
                <p className="lab-sub">
                  Приложи скриншоты-референсы и напиши, что улучшаем. Я читаю это из design-lab/notes.md вместе с картинками и отмечаю, что сделано.
                </p>
              </div>
              <span className="lab-fb-count">
                открыто {shownItems.filter((i) => i.status === "open").length} · сделано {shownItems.filter((i) => i.status === "done").length}
              </span>
            </div>
            <FeedbackComposer
              blocks={blocks}
              block={block?.id}
              onZoom={setZoomImg}
              onAdd={(it) =>
                setFeedback((xs) => [...xs, { ...it, id: Math.random().toString(36).slice(2, 9), status: "open", createdAt: new Date().toISOString() }])
              }
            />
            <FeedbackList
              items={shownItems}
              blocks={blocks}
              onOpenBlock={block ? undefined : pickBlock}
              onZoom={setZoomImg}
              onToggle={(id) => setFeedback((xs) => xs.map((x) => (x.id === id ? { ...x, status: x.status === "done" ? "open" : "done" } : x)))}
              onRemove={(id) => setFeedback((xs) => xs.filter((x) => x.id !== id))}
            />
          </section>

          <section className="lab-compare">
            {decision.variants.length > 1 && (<>
            <h2>Сравнить и оставить пометки</h2>
            <p className="lab-sub">Переключатель сверху только меняет превью. Решение — в оценке и комментарии ниже.</p>
            <div className="lab-table">
              <div className="lab-tr lab-th">
                <div>Композиция</div>
                <div>Референсы и польза</div>
                <div>Компромисс</div>
                <div>Твоё решение</div>
              </div>
              {decision.variants
                .filter((v) => v.id !== "now")
                .map((v) => {
                  const n = notes.variants[decision.id]?.[v.id] ?? { verdict: "" as Verdict, why: "" };
                  return (
                    <div key={v.id} className={`lab-tr ${v.id === variant.id ? "is-current" : ""}`}>
                      <div>
                        <div className="lab-cell-title">
                          {v.letter}. {v.name}
                        </div>
                        <p>{v.composition}</p>
                        <button
                          className="lab-btn lab-btn--small"
                          onClick={() => {
                            setVariantId(v.id);
                            setCompareAll(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Показать {v.letter}
                        </button>
                      </div>
                      <div>
                        {v.refs.length > 0 && (
                          <div className="lab-thumbs">
                            {v.refs.map((id) => REFS[id] && (
                              <button key={id} className="lab-thumb" onClick={() => setLightbox(id)} title={REFS[id].title}>
                                <img src={`/design-lab/refs/${REFS[id].file}`} alt={REFS[id].title} loading="lazy" />
                                <span>{REFS[id].title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <p>{v.benefit}</p>
                      </div>
                      <div>
                        <p>{v.tradeoff}</p>
                      </div>
                      <div>
                        <label className="lab-field-label">
                          Оценка {decision.code} {v.letter}
                        </label>
                        <select value={n.verdict} onChange={(e) => setVariantNote(v.id, { verdict: e.target.value as Verdict })}>
                          {VERDICTS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <label className="lab-field-label">Почему</label>
                        <textarea
                          value={n.why}
                          placeholder="Что подходит, что изменить и почему"
                          onChange={(e) => setVariantNote(v.id, { why: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
            </>)}
            <label className="lab-field-label">Итог по экрану · общий комментарий</label>
            <textarea
              className="lab-summary-input"
              value={notes.summary[decision.id] ?? ""}
              placeholder="Например: каркас из C, виджеты из B, но без иконок в чипах…"
              onChange={(e) =>
                setNotes((n) => ({ ...n, updatedAt: new Date().toISOString(), summary: { ...n.summary, [decision.id]: e.target.value } }))
              }
            />
          </section>
        </main>
      </div>

      {zoomImg && (
        <div className="lab-lightbox" onClick={() => setZoomImg(null)}>
          <img src={zoomImg} alt="" />
          <span>Клик, чтобы закрыть</span>
        </div>
      )}

      {lightbox && REFS[lightbox] && (
        <div className="lab-lightbox" onClick={() => setLightbox(null)}>
          <img src={`/design-lab/refs/${REFS[lightbox].file}`} alt={REFS[lightbox].title} />
          <span>{REFS[lightbox].title} · клик, чтобы закрыть</span>
        </div>
      )}
    </div>
  );
}
