import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useData } from "@/store/DataProvider";
import { useUI } from "@/store/UIProvider";
import { useToast } from "@/store/ToastProvider";

/** Global quick-capture for notes — opened by "Q" from anywhere. */
export function QuickNoteDialog() {
  const { addNote } = useData();
  const { quickNoteOpen, setQuickNoteOpen } = useUI();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function submit() {
    const t = title.trim() || body.trim().split("\n")[0].slice(0, 60);
    if (!t) return;
    addNote({ title: t, body: body.trim(), pinned: false });
    setTitle("");
    setBody("");
    setQuickNoteOpen(false);
    toast("Заметка сохранена");
  }

  return (
    <Dialog
      open={quickNoteOpen}
      onOpenChange={(v) => {
        setQuickNoteOpen(v);
        if (!v) { setTitle(""); setBody(""); }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Быстрая заметка</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="qn-title">Заголовок</Label>
            <Input id="qn-title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Необязательно" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qn-body">Текст (Markdown) · ⌘/Ctrl+Enter — сохранить</Label>
            <Textarea
              id="qn-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
              placeholder="Записать мысль…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setQuickNoteOpen(false)}>Отмена</Button>
          <Button onClick={submit}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
