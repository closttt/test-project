import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Styled stand-in for window.prompt() — same dark-theme dialog language as the rest of the app. */
export function PromptDialog({
  open,
  title,
  placeholder,
  defaultValue,
  confirmLabel = "Сохранить",
  onSubmit,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onOpenChange: (v: boolean) => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue(defaultValue ?? "");
  }, [open, defaultValue]);

  function submit() {
    if (!value.trim()) return;
    onSubmit(value.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={!value.trim()}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
