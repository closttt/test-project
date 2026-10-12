/**
 * Достижения · Craft Dark · v1 «Баннер уровня» (default — the production /achievements page).
 *
 *   ┌ hero ───────────────────────────────────────────────────────────────┐
 *   │  8 из 20 уровней · Опытный                                ╭──────╮  │
 *   │  До «Гуру потока» — ещё 2 уровня · до 9-го 120 XP         │ 3D   │  │
 *   │  ━━━━━━━━   ━━━━━───   ────────   ────────                │медаль│  │
 *   │  ◉ Опытный  ◉ Гуру…    ◉ Легенда  ◉ Абсолют               ╰──────╯  │
 *   │    5 уровней  10 уровней 15 уровней 20 уровней                       │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   quests · season / path / records / collection — shared (_parts.tsx)
 *
 * The original banner: big level number, next tier, one progress bar per tier with its live badge,
 * and the big floating emblem on the right (from 1200px).
 */
import { R, T, plural } from "@/design-lab/screens/_kit/craft";
import { levelTitle } from "@/types";

import { AchievementsScreen, Bar, HeroEmblem, MAX_LEVEL, TIERS, type BannerProps } from "./_parts";
import { LiveBadge } from "./badges";

function LevelBanner({ a, nextTier, toTier }: BannerProps) {
  const lvl = a.lvl;
  return (
    <section
      data-lab-block="hero"
      className="relative mt-6 flex items-center gap-8 overflow-hidden px-6 py-7 min-[720px]:px-10 min-[720px]:py-9"
      style={{
        borderRadius: R.page,
        background: "radial-gradient(120% 140% at 85% 20%, #1F6BEF 0%, #0E3D9E 38%, #0A1C46 72%, #0B1226 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-[380px] w-[380px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,192,255,0.35), transparent 65%)" }}
      />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span style={{ ...T.num, fontSize: 96, lineHeight: 0.9, letterSpacing: "-0.05em" }}>{lvl.level}</span>
          <span className="min-w-0" style={{ fontSize: 24, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.02em" }}>
            из {MAX_LEVEL} уровней · {levelTitle(lvl.level)}
          </span>
        </div>
        <div className="mt-4" style={{ fontSize: 18, color: "rgba(255,255,255,0.88)" }}>
          {lvl.level >= MAX_LEVEL ? (
            "Все уровни открыты"
          ) : (
            <>
              До «{levelTitle(nextTier.level)}» — ещё{" "}
              <span style={{ color: "#9FD0FF", fontWeight: 500 }}>
                {toTier} {plural(toTier, "уровень", "уровня", "уровней")}
              </span>
              <span style={{ color: "rgba(255,255,255,0.55)" }}>
                {" "}
                · до {lvl.level + 1}-го {lvl.toNext} XP
              </span>
            </>
          )}
        </div>
        <div className="mt-7 grid grid-cols-2 gap-5 min-[720px]:grid-cols-4">
          {TIERS.map((t, i) => {
            const from = i === 0 ? 1 : TIERS[i - 1].level;
            const pct =
              lvl.level >= t.level
                ? 100
                : lvl.level <= from
                  ? i === 0
                    ? ((lvl.level - 1 + lvl.pct / 100) / (t.level - 1)) * 100
                    : 0
                  : ((lvl.level - from + lvl.pct / 100) / (t.level - from)) * 100;
            const got = lvl.level >= t.level;
            return (
              <div key={t.id} className="min-w-0">
                <Bar pct={pct} h={8} color={got ? "#9FD0FF" : "#5AA9FF"} />
                <div className="mt-3 flex items-center gap-2.5">
                  <LiveBadge id={t.id} size={40} locked={!got} tilt={10} spinOnClick={false} />
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontSize: 15, fontWeight: 500 }}>
                      {levelTitle(t.level)}
                    </div>
                    <div style={{ ...T.foot, color: "rgba(255,255,255,0.6)" }}>{t.level} уровней</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <HeroEmblem level={lvl.level} size={230} className="hidden min-[1200px]:block" />
    </section>
  );
}

export default function AchievementsCraft() {
  return <AchievementsScreen Banner={LevelBanner} />;
}
