import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { loadAttachmentBlob, saveAttachmentBlob, deleteAttachmentBlob, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { uid } from "@/lib/id";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types";

function Thumb({ att, onOpen, onRemove }: { att: Attachment; onOpen: () => void; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    loadAttachmentBlob(att.id).then((blob) => {
      if (blob) {
        const u = URL.createObjectURL(blob);
        revoke = u;
        setUrl(u);
      }
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [att.id]);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-md bg-secondary/40">
      {url ? (
        <img
          src={url}
          alt={att.name}
          className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-80"
          onClick={onOpen}
        />
      ) : (
        <div className="h-full w-full animate-pulse" />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-risk group-hover:opacity-100 focus-visible:opacity-100"
        title="Удалить фото"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Photo gallery with drag & drop, paste (⌘V), and a lightbox — for project reference screenshots. */
export function PhotoGallery({
  photos,
  onAdd,
  onRemove,
}: {
  photos: Attachment[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) { setLightboxUrl(null); return; }
    let revoke: string | null = null;
    loadAttachmentBlob(lightbox.id).then((blob) => {
      if (blob) { const u = URL.createObjectURL(blob); revoke = u; setLightboxUrl(u); }
    });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [lightbox]);

  function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    onAdd(files);
  }

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((att) => (
            <Thumb key={att.id} att={att} onOpen={() => setLightbox(att)} onRemove={() => onRemove(att.id)} />
          ))}
        </div>
      )}

      <div
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData?.items ?? [])
            .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
            .map((it) => it.getAsFile())
            .filter((f): f is File => f !== null);
          if (files.length) handleFiles(files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-6 text-center outline-none transition-colors hover:border-muted-foreground/40 focus:border-brand/50",
          dragOver && "border-brand bg-brand/5"
        )}
      >
        <ImagePlus className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Перетащи фото сюда, или кликни в эту зону и нажми ⌘V
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-3xl">
          {lightboxUrl && <img src={lightboxUrl} alt={lightbox?.name} className="max-h-[75vh] w-full rounded-md object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export async function saveGalleryFiles(files: File[]): Promise<Attachment[]> {
  const added: Attachment[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) continue;
    const id = uid();
    await saveAttachmentBlob(id, file);
    added.push({ id, name: file.name, type: file.type, size: file.size, createdAt: new Date().toISOString() });
  }
  return added;
}

export { deleteAttachmentBlob as deleteGalleryFile };
