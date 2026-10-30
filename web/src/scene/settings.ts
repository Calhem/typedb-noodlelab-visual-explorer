// Display options and the adaptive rendering quality.
//
// Address options, for comparisons during development:
//   ?corner=procedural      use the original browser-built front-right corner instead of the Blender one
//   ?fx=off                 turn off ambient occlusion and the other post-processing effects
//   ?quality=high|medium|low  fix the rendering quality instead of choosing it automatically
//
// Quality tiers:
//   high    ambient occlusion at full resolution, 4x antialiasing, up to 2x pixel density
//   medium  half-resolution ambient occlusion, 2x antialiasing, up to 1.5x pixel density
//   low     no post-processing (the renderer's own antialiasing), 1x pixel density, earlier switch to light detail
// The starting tier comes from the device; if frames are too slow, the app steps down a tier.

import { useSyncExternalStore } from "react";

const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const settings = {
  blenderCorner: params.get("corner") !== "procedural",
  effects: params.get("fx") !== "off",
};

export type Tier = "high" | "medium" | "low";
const TIERS: Tier[] = ["high", "medium", "low"];

function initialTier(): { tier: Tier; fixed: boolean } {
  const asked = params.get("quality");
  if (asked === "high" || asked === "medium" || asked === "low") return { tier: asked, fixed: true };
  if (typeof navigator === "undefined") return { tier: "high", fixed: false };
  const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  return { tier: phone ? "low" : fewCores ? "medium" : "high", fixed: false };
}

type Listener = () => void;
const listeners = new Set<Listener>();
const start = initialTier();

export const quality = {
  tier: start.tier,
  /** True when the address fixes the tier: no automatic changes. */
  fixed: start.fixed,
  /** Step down one tier (called when frames are consistently slow). */
  stepDown() {
    if (this.fixed) return;
    const next = TIERS[Math.min(TIERS.indexOf(this.tier) + 1, TIERS.length - 1)];
    if (next === this.tier) return;
    this.tier = next;
    for (const l of listeners) l();
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useQualityTier = () => useSyncExternalStore((l) => quality.subscribe(l), () => quality.tier);
