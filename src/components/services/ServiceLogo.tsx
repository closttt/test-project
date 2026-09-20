import { cn } from "@/lib/utils";
import type { ServiceId } from "@/lib/services";

/**
 * Brand marks drawn inline. No remote favicons here: the hub must render instantly and offline,
 * and a grey box where a logo should be is exactly what makes an integrations screen look broken.
 * Each mark sits on a white chip, like the link shelf's logo plates, so brand colours stay legible
 * on the dark theme.
 */
export function ServiceLogo({ id, tint, className }: { id: ServiceId; tint: string; className?: string }) {
  return (
    <span
      className={cn("flex items-center justify-center rounded-lg bg-white shadow-sm", className)}
      style={{ boxShadow: `0 0 0 1px rgb(${tint} / 0.25)` }}
    >
      <Mark id={id} />
    </span>
  );
}

function Mark({ id }: { id: ServiceId }) {
  switch (id) {
    case "gmail":
      return (
        <svg viewBox="0 0 24 18" className="h-[55%] w-[55%]" aria-hidden>
          <path d="M1.6 17h3V8.4L12 13.7l7.4-5.3V17h3a1.6 1.6 0 0 0 1.6-1.6V2.6A1.6 1.6 0 0 0 22.4 1h-.9L12 7.9 2.5 1h-.9A1.6 1.6 0 0 0 0 2.6v12.8A1.6 1.6 0 0 0 1.6 17Z" fill="#EA4335" />
          <path d="M4.6 17V8.4L0 5v10.4A1.6 1.6 0 0 0 1.6 17h3Z" fill="#C5221F" />
          <path d="M19.4 17V8.4L24 5v10.4a1.6 1.6 0 0 1-1.6 1.6h-3Z" fill="#FBBC04" />
          <path d="M0 5V2.6A1.6 1.6 0 0 1 1.6 1h.9L12 7.9 21.5 1h.9A1.6 1.6 0 0 1 24 2.6V5l-12 8.7L0 5Z" fill="#EA4335" />
        </svg>
      );
    case "notion":
      return (
        <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" aria-hidden>
          <path d="M3.6 3.1 16 2.2c1.5-.1 1.9 0 2.9.7l3 2.1c.6.5.8.6.8 1.1v14.4c0 .9-.3 1.4-1.4 1.5l-14.4.9c-.9 0-1.3-.1-1.8-.7l-2.2-2.9c-.5-.7-.7-1.2-.7-1.8V4.5c0-.7.3-1.3 1.4-1.4Z" fill="#fff" />
          <path d="M16 2.2 3.6 3.1c-1.1.1-1.4.7-1.4 1.4v12.9c0 .6.2 1.1.7 1.8l2.2 2.9c.5.6.9.7 1.8.7l14.4-.9c1.1-.1 1.4-.6 1.4-1.5V6.1c0-.5-.2-.6-.8-1.1l-3-2.1c-1-.7-1.4-.8-2.9-.7Zm-9.5 3c-1 .1-1.3.1-1.8-.4L3.4 3.6c-.2-.2-.1-.4.4-.5l11.9-.9c.9-.1 1.3.2 1.7.5l1.6 1.2c.1.1.4.4 0 .4L6.7 5.2h-.2Zm-1.2 13V6.4c0-.5.2-.8.7-.8l12.7-.7c.5 0 .7.2.7.7v11.5c0 .5-.1.9-.8.9l-12.2.7c-.7 0-1.1-.2-1.1-.9Zm12.1-11.2c.1.4 0 .7-.4.8l-.6.1v8.6c-.5.3-1 .4-1.4.4-.6 0-.8-.2-1.3-.8l-3.9-6.1v5.9l1.2.3s0 .7-1 .7l-2.7.2c-.1-.2 0-.6.3-.7l.7-.2V8.4l-1-.1c-.1-.4.1-.9.7-1l2.9-.2 4 6.2V7.8l-1-.1c-.1-.5.2-.8.7-.9l2.8-.2Z" fill="#191919" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" aria-hidden>
          <rect x="2.5" y="3.5" width="19" height="18" rx="2.5" fill="#fff" stroke="#4285F4" strokeWidth="2" />
          <path d="M2.5 8.5h19" stroke="#4285F4" strokeWidth="2" />
          <rect x="6.5" y="1" width="2" height="5" rx="1" fill="#4285F4" />
          <rect x="15.5" y="1" width="2" height="5" rx="1" fill="#4285F4" />
          <rect x="6.5" y="11.5" width="4" height="4" rx="1" fill="#34A853" />
          <rect x="13" y="11.5" width="4" height="4" rx="1" fill="#FBBC04" />
        </svg>
      );
    case "drive":
      return (
        <svg viewBox="0 0 24 21" className="h-[58%] w-[58%]" aria-hidden>
          <path d="M8 0h8l8 14h-8L8 0Z" fill="#FBBC04" />
          <path d="M8 0 0 14l4 7 8-14L8 0Z" fill="#34A853" />
          <path d="M4 21h16l4-7H8l-4 7Z" fill="#4285F4" />
        </svg>
      );
  }
}
