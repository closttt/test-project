/**
 * «Индекс» · quick note (Q). Parity with src/components/QuickNoteDialog.tsx: optional title (Enter
 * saves), Markdown body (⌘/Ctrl+Enter saves), an untitled note takes its first line as the title,
 * «Заметка сохранена» toast.
 */
import { useEffect, useState } from "react";

import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";
import { B, T, tab, plural } from "@/design-lab/screens/_kit/index";
import { Modal } from "@/design-lab/screens/_kit/index-ui";
import { ActionButton, DialogFoot, LineInput, MOD, Kbd } from "./ui";

export function QuickNote() {
  const { addNote } = useData();
  const { quickNoteOpen, setQuickNoteOpen } = useUI();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!quickNoteOpen) {
      setTitle("");
      setBody("");
    }
  }, [quickNoteOpen]);

  function submit() {
    const t = title.trim() || body.trim().split("\n")[0].slice(0, 60);
    if (!t) return;
    addNote({ title: t, body: body.trim(), pinned: false });
    setQuickNoteOpen(false);
    toast("Заметка сохранена");
  }

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <Modal
      open={quickNoteOpen}
      onClose={() => setQuickNoteOpen(false)}
      n="Q"
      title="Быстрая заметка"
      width={620}
      top="14vh"
      footer={
        <DialogFoot
          hint={
            <span className="flex items-center gap-1.5">
              <Kbd>{MOD}</Kbd>
              <Kbd>↵</Kbd> сохранить
              <span style={{ color: B.off }}>·</span>
              <span style={tab}>
                {words} {plural(words, "слово", "слова", "слов")}
              </span>
            </span>
          }
          onCancel={() => setQuickNoteOpen(false)}
          primary={
            <ActionButton onClick={submit} disabled={!title.trim() && !body.trim()}>
              Сохранить
            </ActionButton>
          }
        />
      }
    >
      <div className="px-5 pb-5 pt-6">
        <LineInput
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Заголовок — необязательно"
          aria-label="Заголовок заметки"
        />
        <div className="mt-5 flex items-baseline justify-between" style={{ ...T.meta, color: B.text3 }}>
          <span>Текст · Markdown</span>
          <span style={{ color: B.off }}>без заголовка — первая строка станет названием</span>
        </div>
        <textarea
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Записать мысль…"
          aria-label="Текст заметки"
          className="mt-2 block w-full resize-none bg-white/[0.02] p-3 outline-none transition-shadow duration-200 placeholder:text-[#454545] focus:!shadow-[inset_0_0_0_1px_#ADFB0C]"
          style={{ ...T.body, lineHeight: 1.55, color: B.text, fontFamily: B.font, boxShadow: `inset 0 0 0 1px ${B.l15}` }}
        />
      </div>
    </Modal>
  );
}
