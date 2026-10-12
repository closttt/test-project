/**
 * Проекты · Craft Dark — the glossy 3D folder (owner's ref: a skeuomorphic blue folder with paper
 * peeking out). Used by the projects grid (v6) and the project page cover (project/craft/v5).
 * Not a variant file — the board only loads v*.tsx.
 *
 * Four stacked layers share one 160×128 viewBox so each can move on its own:
 *   shadow (blurred blob) · back (body with tab) · papers · front flap.
 * `open` lifts the papers and tilts the front flap towards the viewer (real 3D, the flap is its own
 * HTML layer under a perspective), ~220 ms.
 */
import { useId, type CSSProperties } from "react";

const EASE = "cubic-bezier(.2,.8,.2,1)";
const DUR = 220;

/** `light` = sitting on a light surface (the project page cover): a softer, greyer shadow. */
export function Folder({ width = 120, open = false, light = false, style }: { width?: number | string; open?: boolean; light?: boolean; style?: CSSProperties }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (k: string) => `fld${uid}${k}`;
  const layer: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" };
  const t = (...props: string[]) => props.map((p) => `${p} ${DUR}ms ${EASE}`).join(", ");
  return (
    <span
      aria-hidden
      className="relative block shrink-0 select-none"
      style={{ width, aspectRatio: "160 / 128", perspective: 560, transform: open ? "translateY(-3%)" : undefined, transition: t("transform"), ...style }}
    >
      {/* Shadow: a soft dark blob plus a faint blue glow, spreading as the folder rises. */}
      <span
        className="absolute"
        style={{
          left: "12%",
          right: "12%",
          bottom: "-4%",
          height: "12%",
          borderRadius: "50%",
          background: light ? "rgba(20,30,50,0.32)" : "rgba(0,0,0,0.55)",
          filter: "blur(7px)",
          opacity: open ? 0.75 : 1,
          transform: open ? "scaleX(1.06) translateY(4%)" : undefined,
          transition: t("opacity", "transform"),
        }}
      />
      <span
        className="absolute"
        style={{
          left: "18%",
          right: "18%",
          bottom: "-2%",
          height: "16%",
          borderRadius: "50%",
          background: light ? "rgba(10,132,255,0.22)" : "rgba(10,132,255,0.35)",
          filter: "blur(14px)",
          opacity: open ? 0.9 : 0.55,
          transition: t("opacity"),
        }}
      />

      {/* Back: body with the tab, deep blue, the inside darker. */}
      <svg viewBox="0 0 160 128" style={layer}>
        <defs>
          <linearGradient id={id("back")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2F86F2" />
            <stop offset="0.55" stopColor="#1462D8" />
            <stop offset="1" stopColor="#0A47B4" />
          </linearGradient>
          <linearGradient id={id("inside")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#06306F" stopOpacity="0.55" />
            <stop offset="1" stopColor="#06306F" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path
          d="M10 21Q10 12 19 12H54Q59 12 62 15.5L68 22Q70 24 74 24H141Q150 24 150 33V108Q150 116 142 116H18Q10 116 10 108Z"
          fill={`url(#${id("back")})`}
        />
        <path d="M14 30Q14 27 17 27H143Q146 27 146 30V96H14Z" fill={`url(#${id("inside")})`} />
        <path d="M14 18Q15 13.5 20 13.5H53.5Q58 13.5 61 16.8L67 23.2Q69.6 25.6 74 25.6H141Q147.5 25.6 148.4 31" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1.1" strokeLinecap="round" />
      </svg>

      {/* Papers: two sheets, they rise when the folder opens. */}
      <svg
        viewBox="0 0 160 128"
        style={{ ...layer, transform: open ? "translateY(-9%)" : undefined, transition: t("transform") }}
      >
        <defs>
          <linearGradient id={id("pa")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#D5DEEA" />
          </linearGradient>
          <linearGradient id={id("pb")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E6ECF4" />
          </linearGradient>
        </defs>
        <rect x="24" y="25" width="110" height="76" rx="5" fill={`url(#${id("pa")})`} transform="rotate(-4 79 63)" />
        <rect x="27" y="30" width="108" height="72" rx="5" fill={`url(#${id("pb")})`} transform="rotate(2.5 81 66)" />
        <g transform="rotate(2.5 81 66)" stroke="#C3CEDD" strokeWidth="2.4" strokeLinecap="round">
          <path d="M38 41H104" />
          <path d="M38 48.5H112" />
          <path d="M38 56H90" />
        </g>
      </svg>

      {/* Front flap: lighter glossy panel; tilts towards the viewer on open. */}
      <span
        className="absolute inset-0 block"
        style={{
          transformOrigin: "50% 92%",
          transform: open ? "rotateX(-24deg)" : "rotateX(0deg)",
          transition: t("transform"),
        }}
      >
        <svg viewBox="0 0 160 128" style={layer}>
          <defs>
            <linearGradient id={id("front")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#86C8FF" />
              <stop offset="0.3" stopColor="#54A8FF" />
              <stop offset="0.72" stopColor="#2E89F6" />
              <stop offset="1" stopColor="#1B6CE2" />
            </linearGradient>
            <linearGradient id={id("gloss")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={id("base")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0A3F9E" stopOpacity="0" />
              <stop offset="1" stopColor="#0A3F9E" stopOpacity="0.45" />
            </linearGradient>
            <radialGradient id={id("sheen")} cx="0.28" cy="0.18" r="0.6">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="6" y="44" width="148" height="74" rx="11" fill={`url(#${id("front")})`} />
          <rect x="6" y="44" width="148" height="74" rx="11" fill={`url(#${id("sheen")})`} />
          <path d="M6 55Q6 44 17 44H143Q154 44 154 55V74H6Z" fill={`url(#${id("gloss")})`} />
          <rect x="6" y="94" width="148" height="24" rx="11" fill={`url(#${id("base")})`} />
          <rect x="6.5" y="44.5" width="147" height="73" rx="10.5" fill="none" stroke="rgba(255,255,255,0.16)" />
          <path d="M16 45.2H144" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="20" cy="105" r="3.4" fill="rgba(255,255,255,0.32)" />
        </svg>
      </span>
    </span>
  );
}
