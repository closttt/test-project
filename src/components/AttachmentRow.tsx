import { useEffect, useState } from "react";
import { Paperclip, X } from "lucide-react";

import { IconAction } from "@/components/ui/icon-action";
import { loadAttachmentBlob } from "@/lib/attachments";
import type { Attachment } from "@/types";

/** A single attachment row — loads its own thumbnail lazily if it's an image. */
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

  return (
    <div className="group flex items-center gap-2 rounded-md border border-border p-1.5">
      {url ? (
        <img src={url} alt={att.name} className="h-8 w-8 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
          <Paperclip className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{att.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{Math.max(1, Math.round(att.size / 1024))} КБ</span>
      <IconAction icon={X} label={`Удалить вложение: ${att.name}`} tone="danger" onClick={onRemove} reveal className="p-0.5" />
    </div>
  );
}
