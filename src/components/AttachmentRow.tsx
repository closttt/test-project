import { useEffect, useState } from "react";
import { Paperclip, X, Download } from "lucide-react";

import { IconAction } from "@/components/ui/icon-action";
import { loadAttachmentBlob } from "@/lib/attachments";
import type { Attachment } from "@/types";

/** A single attachment row — lazy image thumbnail, click to OPEN the file, plus download/remove. */
export function AttachmentRow({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    if (att.type.startsWith("image/")) {
      loadAttachmentBlob(att.id).then((blob) => {
        if (blob) {
          const u = URL.createObjectURL(blob);
          revoke = u;
          setUrl(u);
        }
      });
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [att.id, att.type]);

  /** Opens the stored blob in a new tab. The object URL is revoked on a delay — revoking it
   * immediately would kill the tab that's still loading it. */
  async function open() {
    const blob = await loadAttachmentBlob(att.id);
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    window.open(u, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  }

  async function download() {
    const blob = await loadAttachmentBlob(att.id);
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = att.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  }

  return (
    <div className="group flex items-center gap-2 rounded-md border border-border p-1.5">
      <button
        onClick={open}
        title={`Открыть: ${att.name}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {url ? (
          <img src={url} alt={att.name} className="h-8 w-8 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
            <Paperclip className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm hover:underline">{att.name}</span>
      </button>
      <span className="shrink-0 text-xs text-muted-foreground">{Math.max(1, Math.round(att.size / 1024))} КБ</span>
      <IconAction icon={Download} label={`Скачать: ${att.name}`} onClick={download} reveal className="p-0.5" />
      <IconAction icon={X} label={`Удалить вложение: ${att.name}`} tone="danger" onClick={onRemove} reveal className="p-0.5" />
    </div>
  );
}
