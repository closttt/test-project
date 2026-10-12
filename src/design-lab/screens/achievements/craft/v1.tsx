/**
 * Достижения · Craft Dark · v1 «Баннер: путь из 20 уровней» (default — the production /achievements page).
 *
 *   ┌ hero ───────────────────────────────────────────────────────────────┐
 *   │  8  Опытный                                              ╭──────╮   │
 *   │     уровень из 20 · 1 240 XP                             │ 3D   │   │
 *   │  До 9-го уровня ─────────────── 120 XP                   │медаль│   │
 *   │  ▮▮▮▮◆▮▮▮▯▯▯▯▯◇▯▯▯▯▯◇▯▯▯▯▯◇   (20 pips, tiers every 5)      ╰──────╯   │
 *   │        Опытный ◉   Гуру потока ◉   Легенда ◉   Абсолют ◉             │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   quests · season / path / records / collection — shared (_parts.tsx)
 *
 * The whole journey reads in one line: every level is a pip, tier badges sit under their pip.
 */
import { C, R, T, plural } from "@/design-lab/screens/_kit/craft";
import { levelTitle } from "@/types";

import { AchievementsScreen, BANNER_BG, BANNER_SHADOW, Bar, HeroEmblem, MAX_LEVEL, ON_BLUE, TIERS, type BannerProps } from "./_parts";
import { LiveBadge } from "./badges";

function TrackBanner({ a, nextTier, toTier }: BannerProps) {
  const { level, pct, toNext } = a.lvl;
  const maxed = level >= MAX_LEVEL;
  return (
    <section data-lab-block="hero" className="relative mt-6 overflow-hidden" style={{ borderRadius: R.page, background: BANNER_BG, boxShadow: BANNER_SHADOW }}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-[440px] w-[440px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,192,255,0.28), transparent 65%)" }}
      />
      <div className="relative flex items-center gap-10 px-10 py-9">
        <div className="min-w-0 flex-1">
          <div className="flex items-end gap-4">
            <span style={{ ...T.num, fontSize: 96, lineHeight: 0.84, letterSpacing: "-0.05em" }}>{level}</span>
            <div className="min-w-0 pb-0.5">
              <div className="truncate" style={{ fontSize: 26, lineHeight: 1.15, fontWeight: 500, letterSpacing: "-0.02em" }}>
                {levelTitle(level)}
              </div>
              <div className="mt-1 truncate" style={{ fontSize: 15, color: ON_BLUE.text2 }}>
                уровень из {MAX_LEVEL} · {a.xp} XP
              </div>
            </div>
          </div>

          <div className="mt-7 max-w-[520px]">
            <div className="mb-2 flex items-baseline justify-between gap-3" style={{ ...T.body, color: ON_BLUE.text2 }}>
              <span className="truncate">{maxed ? `Все ${MAX_LEVEL} уровней открыты` : `До ${level + 1}-го уровня`}</span>
              {!maxed && <span style={{ ...T.num, color: C.text, whiteSpace: "nowrap" }}>{toNext} XP</span>}
            </div>
            <Bar pct={maxed ? 100 : pct} h={6} color={ON_BLUE.fill} track={ON_BLUE.track} />
          </div>

          {/* Path: 20 pips, a tier every 5 — tier badges sit right under their pip */}
          <div className="mt-8 grid gap-x-1 gap-y-4" style={{ gridTemplateColumns: `repeat(${MAX_LEVEL}, minmax(0,1fr))` }}>
            {Array.from({ length: MAX_LEVEL }, (_, k) => {
              const n = k + 1;
              const tier = n % 5 === 0;
              const done = n < level || maxed;
              const current = n === level && !maxed;
              const fill = done ? 100 : current ? pct : 0;
              return (
                <div key={n} className="flex items-center" style={{ height: 14 }} title={`${n} · ${levelTitle(n)}`}>
                  <span
                    className="block w-full"
                    style={{
                      height: tier ? 14 : 8,
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${tier && done ? "#D6ECFF" : ON_BLUE.fill} ${fill}%, ${ON_BLUE.track} ${fill}%)`,
                      boxShadow: current ? "0 0 0 3px rgba(159,208,255,0.16)" : "none",
                    }}
                  />
                </div>
              );
            })}
            {TIERS.map((t) => {
              const got = level >= t.level;
              const next = !got && t.id === nextTier.id;
              return (
                <div key={t.id} className="flex min-w-0 items-center justify-end gap-2.5" style={{ gridColumn: `${t.level - 4} / ${t.level + 1}` }}>
                  <div className="min-w-0 text-right">
                    <div className="truncate" style={{ fontSize: 15, fontWeight: 500, color: got || next ? C.text : ON_BLUE.text2 }}>
                      {levelTitle(t.level)}
                    </div>
                    <div className="truncate" style={{ ...T.foot, color: next ? ON_BLUE.accent : ON_BLUE.text3 }}>
                      {got ? "открыто" : next ? `ещё ${toTier} ${plural(toTier, "уровень", "уровня", "уровней")}` : `${t.level} уровень`}
                    </div>
                  </div>
                  <LiveBadge id={t.id} size={40} locked={!got} tilt={10} spinOnClick={false} />
                </div>
              );
            })}
          </div>
        </div>

        <HeroEmblem level={level} size={220} className="hidden min-[1200px]:block" />
      </div>
    </section>
  );
}

export default function AchievementsCraft() {
  return <AchievementsScreen Banner={TrackBanner} />;
}
