/**
 * Достижения · Craft Dark · v3 «Баннер: полка ступеней».
 *
 *   ┌ hero ───────────────────────────────────────────────────────────────┐
 *   │ ╭──────╮  8 из 20 · Опытный                До 9-го ──────── 120 XP │
 *   │ │ 3D   │   ◉ Опытный   ◉ Гуру потока   ◯ Легенда   ◯ Абсолют        │
 *   │ │медаль│  ═══════════════ shelf ═══════════════                     │
 *   │ ╰──────╯   открыто      ▬▬▬ ещё 2      15 уровень   20 уровень      │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * The four tier medals stand on a lit shelf like trophies; the one being earned sits in a soft blue tint.
 */
import { C, R, T, plural } from "@/design-lab/screens/_kit/craft";
import { levelTitle } from "@/types";

import { AchievementsScreen, BANNER_BG, BANNER_SHADOW, Bar, HeroEmblem, MAX_LEVEL, ON_BLUE, TIERS, tierPct, type BannerProps } from "./_parts";
import { LiveBadge } from "./badges";

const MEDAL = 92;

function ShelfBanner({ a, nextTier, toTier }: BannerProps) {
  const { level, pct, toNext } = a.lvl;
  const maxed = level >= MAX_LEVEL;
  return (
    <section data-lab-block="hero" className="relative mt-6 overflow-hidden" style={{ borderRadius: R.page, background: BANNER_BG, boxShadow: BANNER_SHADOW }}>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-28 h-[420px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,192,255,0.24), transparent 65%)" }}
      />
      <div className="relative flex items-center gap-8 px-10 py-8">
        <HeroEmblem level={level} size={184} className="hidden min-[1200px]:block" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 items-baseline gap-3">
              <span style={{ ...T.num, fontSize: 64, lineHeight: 0.9, letterSpacing: "-0.05em" }}>{level}</span>
              <span className="truncate" style={{ fontSize: 22, color: "rgba(255,255,255,0.88)", letterSpacing: "-0.02em" }}>
                из {MAX_LEVEL} · {levelTitle(level)}
              </span>
            </div>
            <div className="w-[240px] max-w-full">
              <div className="mb-2 flex justify-between gap-3" style={{ ...T.body, color: ON_BLUE.text2 }}>
                <span className="truncate">{maxed ? "Все уровни открыты" : `До ${level + 1}-го`}</span>
                {!maxed && <span style={{ ...T.num, color: C.text, whiteSpace: "nowrap" }}>{toNext} XP</span>}
              </div>
              <Bar pct={maxed ? 100 : pct} h={6} color={ON_BLUE.fill} track={ON_BLUE.track} />
            </div>
          </div>

          <div className="relative mt-6">
            {/* The shelf the medals stand on, with a faint reflection under it */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0" style={{ top: 16 + MEDAL + 4 }}>
              <div style={{ height: 2, background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.22), rgba(255,255,255,0))" }} />
              <div style={{ height: 28, background: "linear-gradient(180deg, rgba(124,192,255,0.10), rgba(124,192,255,0))" }} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              {TIERS.map((t, i) => {
                const got = level >= t.level;
                const next = !got && t.id === nextTier.id;
                return (
                  <div
                    key={t.id}
                    className="relative flex min-w-0 flex-col items-center px-3 pb-4 pt-4 text-center"
                    style={{ borderRadius: R.card, background: next ? "rgba(90,169,255,0.14)" : "transparent" }}
                  >
                    <LiveBadge id={t.id} size={MEDAL} locked={!got} tilt={14} spinOnClick={false} />
                    <div className="mt-4 max-w-full truncate" style={{ fontSize: 16, fontWeight: 500, color: got || next ? C.text : ON_BLUE.text2 }}>
                      {levelTitle(t.level)}
                    </div>
                    {next ? (
                      <div className="mt-2 w-full max-w-[140px]">
                        <Bar pct={tierPct(level, pct, i)} h={4} color={ON_BLUE.fill} track={ON_BLUE.track} />
                        <div className="mt-1.5 truncate" style={{ ...T.foot, color: ON_BLUE.accent }}>
                          ещё {toTier} {plural(toTier, "уровень", "уровня", "уровней")}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 truncate" style={{ ...T.foot, color: ON_BLUE.text3 }}>
                        {got ? "открыто" : `${t.level} уровень`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AchievementsCraftShelf() {
  return <AchievementsScreen Banner={ShelfBanner} />;
}
