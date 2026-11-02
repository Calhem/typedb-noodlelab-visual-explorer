// The introduction's timing: the drive ends exactly at the studio position without a jolt, Begin lands in the studio,
// and the wheels roll without slipping.

import { describe, expect, it } from "vitest";
import { BEGIN_SECONDS, DRIVE_DISTANCE, DRIVE_SECONDS, beginAmount, intro, remaining, TYRE_RADIUS, wheelAngle } from "./intro";

describe("the introduction", () => {
  it("drives the whole distance and stops exactly where the studio shows the car", () => {
    expect(remaining(0)).toBe(DRIVE_DISTANCE);
    expect(remaining(DRIVE_SECONDS)).toBe(0);
    expect(remaining(DRIVE_SECONDS + 5)).toBe(0);
  });

  it("slows down all the way and stops without a jolt", () => {
    const dt = DRIVE_SECONDS / 600;
    const speeds = Array.from({ length: 600 }, (_, i) => (remaining(i * dt) - remaining((i + 1) * dt)) / dt);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1] + 1e-9);
    expect(speeds[0]).toBeGreaterThan(20);              // arrives at road speed (m/s)
    expect(speeds[speeds.length - 1]).toBeLessThan(0.01); // and is all but stopped at the end
  });

  it("rolls the wheels by the distance covered, ending on a whole fifth of a turn (five spokes and nuts)", () => {
    expect(wheelAngle(2 * Math.PI * TYRE_RADIUS)).toBeCloseTo(-2 * Math.PI);
    expect(Math.abs(TYRE_RADIUS - 0.4)).toBeLessThan(0.001);
    const fifths = -wheelAngle(DRIVE_DISTANCE) / ((2 * Math.PI) / 5);
    expect(Math.abs(fifths - Math.round(fifths))).toBeLessThan(1e-9);
  });

  it("goes from the road to the studio over Begin's transition, smoothly", () => {
    expect(beginAmount(0)).toBe(0);
    expect(beginAmount(BEGIN_SECONDS)).toBe(1);
    for (let i = 0; i < 100; i++) expect(beginAmount(((i + 1) / 100) * BEGIN_SECONDS)).toBeGreaterThanOrEqual(beginAmount((i / 100) * BEGIN_SECONDS));
  });

  it("finishes the drive during Begin if the car has not yet arrived, and lands in the studio", () => {
    intro.tick(1);
    expect(intro.distance).toBeGreaterThan(0);
    intro.begin();
    for (let t = 0; t < BEGIN_SECONDS * 0.5 + 0.1; t += 1 / 60) intro.tick(1 / 60);
    expect(intro.distance).toBe(0);
    for (let t = 0; t < BEGIN_SECONDS; t += 1 / 60) intro.tick(1 / 60);
    expect(intro.stage).toBe("studio");
    expect(intro.studio).toBe(1);
  });
});
