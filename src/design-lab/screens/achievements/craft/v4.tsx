/**
 * Достижения · Craft Dark · v4 «Баннер: компактная полоса».
 *
 *   ┌ hero ───────────────────────────────────────────────────────────────┐
 *   │ ╭────╮ Уровень 8  Опытный                    ◉   ◉   ◯   ◯          │
 *   │ │3D  │ ─────────────────────────────          5  10  15  20          │
 *   │ ╰────╯ 330 / 450 XP      до 9-го — 120 XP                           │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * One short strip — the quests are visible on the first screen.
 */
import { C, R, T, plural } from "@/design-lab/screens/_kit/craft";
import { levelTitle } from "@/types";

import { AchievementsScreen, BANNER_BG, BANNER_SHADOW, Bar, HeroEmblem, MAX_LEVEL, ON_BLUE, TIERS, type BannerProps } from "./_parts";
import { LiveBadge } from "./badges";

function StripBanner({ a, nextTier, toTier }: BannerProps) {
  const { level, pct, toNext, inLevel, span } = a.lvl;
  const maxed = level >= MAX_LEVEL;
  const tiersDone = level >= nextTier.level;
  return (
    <section data-lab-block="hero" className="relative mt-6 overflow-hidden" style={{ borderRadius: R.page, background: BANNER_BG, boxShadow: BANNER_SHADOW }}>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-24 h-[300px] w-[300px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,192,255,0.26), transparent 65%)" }}
      />
      <div className="relative flex items-center gap-6 py-5 pl-5 pr-7">
        <HeroEmblem level={level} size={112} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="whitespace-nowrap" style={{ ...T.num, fontSize: 30, lineHeight: 1 }}>
              Уровень {level}
            </span>
            <span className="truncate" style={{ fontSize: 18, color: ON_BLUE.text2 }}>
              {levelTitle(level)}
            </span>
          </div>
          <div className="mt-3.5">
            <Bar pct={maxed ? 100 : pct} h={8} color={ON_BLUE.fill} track={ON_BLUE.track} />
          </div>
          <div className="mt-2 flex justify-between gap-4" style={{ ...T.body, color: ON_BLUE.text3 }}>
            <span className="truncate" style={T.num}>
              {maxed ? `${a.xp} XP` : `${inLevel} / ${span} XP`}
            </span>
            <span className="truncate">
              {maxed ? (
                `Все ${MAX_LEVEL} уровней открыты`
              ) : tiersDone ? (
                <>
                  до {level + 1}-го — <span style={{ color: C.text }}>{toNext} XP</span>
                </>
              ) : (
                <>
                  до «{levelTitle(nextTier.level)}» —{" "}
                  <span style={{ color: ON_BLUE.accent }}>
                    {toTier} {plural(toTier, "уровень", "уровня", "уровней")}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-1 min-[1200px]:flex">
          {TIERS.map((t) => {
            const got = level >= t.level;
            const next = !got && t.id === nextTier.id;
            return (
              <div
                key={t.id}
                title={`${levelTitle(t.level)} · ${t.level} уровень`}
                className="flex w-[68px] flex-col items-center py-2"
                style={{ borderRadius: R.inner, background: next ? "rgba(90,169,255,0.14)" : "transparent" }}
              >
                <LiveBadge id={t.id} size={46} locked={!got} tilt={10} spinOnClick={false} />
                <span className="mt-1.5" style={{ ...T.foot, ...T.num, color: got || next ? C.text : ON_BLUE.text3 }}>
                  {t.level}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function AchievementsCraftStrip() {
  return <AchievementsScreen Banner={StripBanner} />;
}
