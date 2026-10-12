/**
 * «Индекс» · confirm / prompt — the Index stand-ins for src/components/ConfirmDialog.tsx and
 * PromptDialog.tsx (themselves stand-ins for window.confirm / window.prompt), built on the kit Modal.
 *
 * Promise API, usable from any screen without wiring state:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Удалить проект?", description: "Задачи останутся без проекта." })) …
 *   const prompt = usePrompt();
 *   const name = await prompt({ title: "Новый раздел", placeholder: "Название" });  // string | null
 *
 * The host (<DialogsHost/>) is mounted once in Overlays; requests queue if one is already open.
 * Without a host (outside the Index app) it falls back to the browser's confirm / prompt.
 * Same defaults as production: confirm label «Удалить», destructive by default (danger outline,
 * focus starts on «Отмена» — the extra beat of friction); prompt «Сохранить», blank is not accepted.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { B, T } from "@/design-lab/screens/_kit/index";
import { Modal } from "@/design-lab/screens/_kit/index-ui";
import { ActionButton, DialogFoot, Kbd, LineInput } from "./ui";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red outline action + focus on «Отмена». Default true (the production default). */
  destructive?: boolean;
}

export interface PromptOptions {
  title: string;
  description?: ReactNode;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** Allow submitting an empty string (default: no — same as production). */
  allowEmpty?: boolean;
}

type Req =
  | { id: number; kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

// The host's queue lives on window, not in module scope: survives HMR and duplicate module copies,
// so every caller reaches the one mounted host.
type Bridge = { enqueue: ((r: Req) => void) | null; seq: number };
const bridge = (): Bridge => {
  const w = window as unknown as { __ixDialogs?: Bridge };
  return (w.__ixDialogs ??= { enqueue: null, seq: 0 });
};

/** Ask a yes/no question in the Index language. Resolves true on confirm, false on cancel / Esc. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const b = bridge();
  if (!b.enqueue) return Promise.resolve(window.confirm(opts.title));
  return new Promise((resolve) => b.enqueue!({ id: ++b.seq, kind: "confirm", opts, resolve }));
}

/** Ask for one line of text. Resolves the trimmed value, or null on cancel / Esc. */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  const b = bridge();
  if (!b.enqueue) return Promise.resolve(window.prompt(opts.title, opts.defaultValue ?? ""));
  return new Promise((resolve) => b.enqueue!({ id: ++b.seq, kind: "prompt", opts, resolve }));
}

export function useConfirm() {
  return useCallback((opts: ConfirmOptions) => confirmDialog(opts), []);
}

export function usePrompt() {
  return useCallback((opts: PromptOptions) => promptDialog(opts), []);
}

function ConfirmBody({ req, done }: { req: Extract<Req, { kind: "confirm" }>; done: (v: boolean) => void }) {
  const { title, description, confirmLabel = "Удалить", cancelLabel = "Отмена", destructive = true } = req.opts;
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (destructive) cancelRef.current?.focus();
  }, [destructive]);
  return (
    <Modal
      open
      onClose={() => done(false)}
      n={destructive ? "!" : "?"}
      title={title}
      width={480}
      top="24vh"
      footer={
        <div className="flex h-14 items-center justify-end gap-5 pl-5 pr-2">
          <span className="mr-auto flex items-center gap-1.5" style={{ ...T.meta, color: B.text3 }}>
            <Kbd>Esc</Kbd> отмена
          </span>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => done(false)}
            className="h-9 px-2 outline-none transition-colors duration-200 hover:text-white focus-visible:ring-1 focus-visible:ring-[#ADFB0C]"
            style={{ ...T.body, color: B.text3 }}
          >
            {cancelLabel}
          </button>
          <ActionButton tone={destructive ? "danger" : "lime"} onClick={() => done(true)} autoFocus={!destructive}>
            {confirmLabel}
          </ActionButton>
        </div>
      }
    >
      <div className="px-5 pb-6 pt-5" style={{ ...T.body, color: description ? B.text2 : B.text3 }}>
        {description ?? (destructive ? "Это действие нельзя отменить." : "Подтвердите действие.")}
      </div>
    </Modal>
  );
}

function PromptBody({ req, done }: { req: Extract<Req, { kind: "prompt" }>; done: (v: string | null) => void }) {
  const { title, description, placeholder, defaultValue, confirmLabel = "Сохранить", allowEmpty } = req.opts;
  const [value, setValue] = useState(defaultValue ?? "");
  const ok = allowEmpty || !!value.trim();
  const submit = () => ok && done(value.trim());
  return (
    <Modal
      open
      onClose={() => done(null)}
      n="↳"
      title={title}
      width={520}
      top="22vh"
      footer={
        <DialogFoot
          hint={
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> {confirmLabel.toLowerCase()}
            </span>
          }
          onCancel={() => done(null)}
          primary={
            <ActionButton onClick={submit} disabled={!ok}>
              {confirmLabel}
            </ActionButton>
          }
        />
      }
    >
      <div className="px-5 pb-5 pt-6">
        {description && (
          <p className="mb-5" style={{ ...T.body, color: B.text2 }}>
            {description}
          </p>
        )}
        <LineInput
          autoFocus
          size="m"
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          aria-label={title}
        />
      </div>
    </Modal>
  );
}

/** Mount once (Overlays). Renders the oldest pending confirm / prompt. */
export function DialogsHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  useEffect(() => {
    const b = bridge();
    const mine = (r: Req) => setQueue((q) => [...q, r]);
    b.enqueue = mine;
    return () => {
      if (b.enqueue === mine) b.enqueue = null;
    };
  }, []);
  const head = queue[0];
  if (!head) return null;
  const finish = (v: never) => {
    (head.resolve as (x: unknown) => void)(v);
    setQueue((q) => q.slice(1));
  };
  return head.kind === "confirm" ? (
    <ConfirmBody key={head.id} req={head} done={(v) => finish(v as never)} />
  ) : (
    <PromptBody key={head.id} req={head} done={(v) => finish(v as never)} />
  );
}
