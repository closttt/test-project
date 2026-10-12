/**
 * Достижения · Craft Dark · v2 «Баннер: кольцо уровня».
 *
 *   ┌ hero ───────────────────────────────────────────────────────────────┐
 *   │  ╭─ring─╮   Уровень 8 из 20                                         │
 *   │  │ 3D   │   Опытный                                                 │
 *   │  │медаль│   до 9-го — 120 XP · 330 из 450                           │
 *   │  ╰──────╯   [XP всего] [Значков n/30] [Серия n дн.]                 │
 *   │             [◉ Следующая ступень · Гуру потока ──── ещё 2 уровня]   │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * XP to the next level is a ring around the emblem; the right side is a small profile summary.
 */
import { C, R, T, plural } from "@/design-lab/screens/_kit/craft";
import { levelTitle } from "@/types";

import { AchievementsScreen, BANNER_BG, BANNER_SHADOW, Bar, HeroEmblem, MAX_LEVEL, ON_BLUE, TIERS, tierPct, type BannerProps } from "./_parts";
import { LiveBadge } from "./badges";

const RING = 196;
const STROKE = 8;

function RingBanner({ a, gotCount, nextTier, toTier }: BannerProps) {
  const { level, pct, toNext, inLevel, span } = a.lvl;
  const maxed = level >= MAX_LEVEL;
  const r = (RING - STROKE) / 2;
  const len = 2 * Math.PI * r;
  const ringPct = maxed ? 100 : pct;
  const tierIdx = TIERS.findIndex((t) => t.id === nextTier.id);
  const tierGot = level >= nextTier.level;
  const tile = { borderRadius: R.inner, background: "rgba(255,255,255,0.07)" };

  return (
    <section data-lab-block="hero" className="relative mt-6 overflow-hidden" style={{ borderRadius: R.page, background: BANNER_BG, boxShadow: BANNER_SHADOW }}>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,192,255,0.26), transparent 65%)" }}
      />
      <div className="relative flex items-center gap-8 px-8 py-8">
        <div className="relative shrink-0" style={{ width: RING, height: RING }}>
          <svg width={RING} height={RING} className="absolute inset-0 -rotate-90" aria-hidden>
            <defs>
              <linearGradient id="ach-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#D6ECFF" />
                <stop offset="1" stopColor="#5AA9FF" />
              </linearGradient>
            </defs>
            <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke={ON_BLUE.track} strokeWidth={STROKE} />
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              fill="none"
              stroke="url(#ach-ring)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${(len * ringPct) / 100} ${len}`}
              style={{ transition: "stroke-dasharray 500ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <HeroEmblem level={level} size={140} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 15, color: ON_BLUE.text2 }}>
            Уровень {level} из {MAX_LEVEL}
          </div>
          <div className="mt-1 truncate" style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 500, letterSpacing: "-0.03em" }}>
            {levelTitle(level)}
          </div>
          <div className="mt-2 truncate" style={{ fontSize: 15, color: ON_BLUE.text2 }}>
            {maxed ? (
              `Все ${MAX_LEVEL} уровней открыты`
            ) : (
              <>
                до {level + 1}-го — <span style={{ ...T.num, color: C.text }}>{toNext} XP</span>
                <span style={{ color: ON_BLUE.text3 }}>
                  {" "}
                  · {inLevel} из {span}
                </span>
              </>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: "XP всего", value: String(a.xp) },
              { label: "Значков", value: `${gotCount} / ${a.list.length}` },
              { label: "Серия", value: `${a.stats.streak} ${plural(a.stats.streak, "день", "дня", "дней")}` },
            ].map((s) => (
              <div key={s.label} className="min-w-0 px-4 py-3" style={tile}>
                <div className="truncate" style={{ ...T.foot, color: ON_BLUE.text3 }}>
                  {s.label}
                </div>
                <div className="mt-1 truncate" style={{ ...T.num, fontSize: 22, lineHeight: 1.1 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-3 px-3 py-2.5" style={tile}>
            <LiveBadge id={nextTier.id} size={44} locked={!tierGot} tilt={10} spinOnClick={false} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate" style={{ ...T.body, color: ON_BLUE.text2 }}>
                  {tierGot ? "Все ступени пройдены" : "Следующая ступень"} · <span style={{ color: C.text }}>{levelTitle(nextTier.level)}</span>
                </span>
                {!tierGot && (
                  <span className="shrink-0 whitespace-nowrap" style={{ ...T.body, color: ON_BLUE.accent }}>
                    ещё {toTier} {plural(toTier, "уровень", "уровня", "уровней")}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <Bar pct={tierPct(level, pct, tierIdx)} h={5} color={ON_BLUE.fill} track={ON_BLUE.track} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AchievementsCraftRing() {
  return <AchievementsScreen Banner={RingBanner} />;
}
