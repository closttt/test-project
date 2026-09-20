import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { loadAttachmentBlob } from "@/lib/attachments";
import type { Attachment } from "@/types";

/**
 * In-app preview for a stored attachment. Replaces `window.open(blobUrl)`, which popup blockers,
 * the installed PWA and mobile browsers silently swallow — the user clicked and "nothing opened".
 * Images, PDF, video, audio and plain text render inline; anything else gets a download card.
 */
export function FilePreviewDialog({ att, onClose }: { att: Attachment | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!att) { setUrl(null); setText(null); setMissing(false); return; }
    let revoke: string | null = null;
    let cancelled = false;
    loadAttachmentBlob(att.id).then(async (blob) => {
      if (cancelled) return;
      if (!blob) { setMissing(true); return; }
      const u = URL.createObjectURL(blob);
      revoke = u;
      setUrl(u);
      if (isText(att.type, att.name) && blob.size < 512 * 1024) setText(await blob.text());
    });
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [att]);

  function download() {
    if (!url || !att) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = att.name;
    a.click();
  }

  const kind = att ? kindOf(att.type, att.name) : "other";

  return (
    <Dialog open={!!att} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,64rem)] max-w-none flex-col gap-3 p-4">
        <DialogTitle className="truncate pr-8 text-sm font-medium">{att?.name}</DialogTitle>
        <div className="min-h-0 flex-1 overflow-auto rounded-md bg-secondary/40">
          {missing ? (
            <Fallback icon={<FileText className="h-8 w-8" />} text="Файл не найден на этом устройстве — вложения хранятся локально там, где их добавили." />
          ) : !url ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Загрузка…</div>
          ) : kind === "image" ? (
            <img src={url} alt={att?.name} className="mx-auto max-h-[75vh] object-contain" />
          ) : kind === "pdf" ? (
            <iframe src={url} title={att?.name} className="h-[75vh] w-full" />
          ) : kind === "video" ? (
            <video src={url} controls className="mx-auto max-h-[75vh]" />
          ) : kind === "audio" ? (
            <div className="flex h-40 items-center justify-center px-6"><audio src={url} controls className="w-full" /></div>
          ) : kind === "text" && text !== null ? (
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs">{text}</pre>
          ) : (
            <Fallback icon={<FileText className="h-8 w-8" />} text="Предпросмотр для этого типа файла недоступен — скачайте его." />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{att ? `${Math.max(1, Math.round(att.size / 1024))} КБ · ${att.type || "файл"}` : ""}</span>
          <div className="flex gap-2">
            {url && kind !== "other" && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="h-3.5 w-3.5" /> В новой вкладке
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={download} disabled={!url}>
              <Download className="h-3.5 w-3.5" /> Скачать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fallback({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
      {icon}
      {text}
    </div>
  );
}

type Kind = "image" | "pdf" | "video" | "audio" | "text" | "other";

function isText(type: string, name: string): boolean {
  return type.startsWith("text/") || /\.(md|txt|json|csv|log|ya?ml|xml|ts|tsx|js|css|html?)$/i.test(name) || type === "application/json";
}

export function kindOf(type: string, name: string): Kind {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (isText(type, name)) return "text";
  return "other";
}
