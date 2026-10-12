/**
 * Design lab · a collectible badge with a light 3D feel: it tilts toward the cursor (perspective
 * rotateX/Y), a glare follows the pointer, a soft blue glow sits under it, and a click spins it
 * once around Y. Locked badges are greyed and do not glow. Respects prefers-reduced-motion.
 *
 * Art: /design-lab/badges/<id>.webp — generated with Gemini in the Craft Dark style (sapphire
 * enamel, platinum rim, ivory emblem) and chroma-keyed to transparent.
 */
import { useRef, useState, type CSSProperties } from "react";

export const badgeSrc = (id: string) => `/design-lab/badges/${id}.webp`;

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Badge3D({
  id,
  size = 120,
  locked,
  tilt = 16,
  float,
  spinOnClick = true,
  onClick,
  title,
}: {
  id: string;
  size?: number;
  locked?: boolean;
  /** Max tilt in degrees. */
  tilt?: number;
  /** Gentle idle bob (for the hero emblem). */
  float?: boolean;
  spinOnClick?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0, gx: 50, gy: 30, on: false });
  const [spin, setSpin] = useState(0);

  const move = (e: React.PointerEvent) => {
    if (reduced()) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setT({ rx: (0.5 - py) * tilt * 2, ry: (px - 0.5) * tilt * 2, gx: px * 100, gy: py * 100, on: true });
  };
  const leave = () => setT({ rx: 0, ry: 0, gx: 50, gy: 30, on: false });

  const stage: CSSProperties = { width: size, height: size, perspective: size * 6 };
  const body: CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    transformStyle: "preserve-3d",
    transform: `rotateX(${t.rx}deg) rotateY(${t.ry + spin}deg) translateZ(${t.on ? size * 0.06 : 0}px) scale(${t.on ? 1.04 : 1})`,
    transition: t.on ? "transform 90ms linear" : "transform 600ms cubic-bezier(.2,.8,.2,1)",
  };
  const img: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    filter: locked
      ? "grayscale(1) brightness(0.62) contrast(1.05)"
      : `drop-shadow(0 ${size * 0.06}px ${size * 0.12}px rgba(10,132,255,${t.on ? 0.45 : 0.28}))`,
    transition: "filter 300ms ease",
    userSelect: "none",
    pointerEvents: "none",
  };
  return (
    <div
      ref={ref}
      title={title}
      role={onClick || spinOnClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={() => {
        if (spinOnClick && !locked && !reduced()) setSpin((s) => s + 360);
        onClick?.();
      }}
      className={`relative shrink-0 select-none ${float ? "lab-badge-float" : ""}`}
      style={{ ...stage, cursor: onClick || (spinOnClick && !locked) ? "pointer" : "default" }}
    >
      <style>{`@keyframes labBadgeFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}.lab-badge-float{animation:labBadgeFloat 5s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.lab-badge-float{animation:none}}`}</style>
      <div style={{ ...body, transition: spin && !t.on ? "transform 900ms cubic-bezier(.3,.7,.2,1)" : body.transition }}>
        <img src={badgeSrc(id)} alt="" draggable={false} style={img} />
        {/* Glare: a soft highlight that follows the pointer, clipped to the badge silhouette. */}
        {!locked && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              WebkitMaskImage: `url(${badgeSrc(id)})`,
              maskImage: `url(${badgeSrc(id)})`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              background: `radial-gradient(circle at ${t.gx}% ${t.gy}%, rgba(255,255,255,${t.on ? 0.34 : 0.1}) 0%, rgba(255,255,255,0) 46%)`,
              mixBlendMode: "screen",
              transition: t.on ? "none" : "background 600ms ease",
            }}
          />
        )}
      </div>
    </div>
  );
}
