import type { EffectsLevel } from "@/types";

/**
 * Reward-FX intensity, read off `<html data-effects>` (DataProvider mirrors the setting there,
 * the same way it already mirrors theme/accent/density).
 *
 * Why a data attribute instead of the store: the FX live in UI primitives (AnimatedCheckbox,
 * Celebration) that should not import the data layer — this keeps them dependency-free while
 * still honouring the user's setting everywhere.
 */
export function effectsLevel(): EffectsLevel {
  if (typeof document === "undefined") return "full";
  const v = document.documentElement.dataset.effects;
  return v === "off" || v === "subtle" ? v : "full";
}

/** Multiplier applied to burst size/particle counts. `off` is handled by callers (skip entirely). */
export function effectsScale(level: EffectsLevel = effectsLevel()): number {
  return level === "off" ? 0 : level === "subtle" ? 0.6 : 1;
}
