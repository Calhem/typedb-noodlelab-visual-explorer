// Suspension and steering clearances through the approved concept envelope (C3c step 2): every corner at
// -80, 0 and +80 mm of wheel travel; the front corners also at -35 and +35 degrees of steer in each of those
// positions (full lock at full bump and full rebound). Concept targets, not validated production values.
//
// At each pose the corner's moving parts are placed by the linkage solver (kinematics.ts) and checked against
// the parts around them that do not move, and against the corner's other moving groups. Designed joints (ball
// joints, bushes, the damper's eye, the drive shaft's stub in the hub) are listed as contacts. The flexible
// brake hose is left out: it is designed to bend with the wheel (an abstraction, documented in docs/c3c).
// Known body-structure clashes are listed by backlog item (docs/body-structure-backlog.md) and printed on
// every run; anything else fails.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PART_BY_ID } from "../vehicle/manifest";
import { buildVehicle } from "./buildVehicle";
import { loadParts, shared, voxels } from "./clearance";
import { type Corner, pose, type Pose } from "./kinematics";
import openConflicts from "./travel-open.json";

const VOXEL = 0.005; // a pair sharing voxels is closer than about 5-9 mm
const MODELS = ["corner-fr", "corner-fl", "corner-rr", "corner-rl", "chassis", "front-drive-unit", "rear-drive-unit", "hv-battery", "power-electronics"];
const TRAVEL = [-0.08, 0, 0.08];
const STEER = [-35, 0, 35];

/** Which part of a corner moves how. Ids are given without the corner suffix. */
const WHEEL_GROUP = ["tyre", "wheel", "brake-disc", "caliper", "brake-pad-inner", "brake-pad-outer", "brake-shield", "hub", "hub-nut",
  "wheel-bearing", "knuckle", "wheel-speed-sensor", "epb-actuator"];
function movingParts(c: Corner): [string, keyof Pose][] {
  const front = c[0] === "f", axle = front ? "front" : "rear", s = c[1];
  return [
    ...WHEEL_GROUP.map((p): [string, keyof Pose] => [`${p}-${c}`, "wheel"]),
    ...[1, 2, 3, 4, 5].map((n): [string, keyof Pose] => [`wheel-nut-${c}-${n}`, "wheel"]),
    [`lower-arm-${c}`, "lowerArm"], [`upper-arm-${c}`, "upperArm"], [front ? `tie-rod-${c}` : `toe-link-${c}`, "link"],
    [`coilover-${c}`, "damper"], [`spring-${c}`, "spring"], [`drop-link-${c}`, "dropLink"], [`${axle}-halfshaft-${s}`, "shaft"],
  ];
}

/** Designed joints between a moving part and its neighbour (patterns over ids). */
const JOINTS: [RegExp, RegExp][] = [
  [/^knuckle-/, /^(lower-arm|upper-arm|tie-rod|toe-link)-/],
  [/^coilover-/, /^(lower-arm|drop-link|spring|top-mount)-/],
  [/^spring-/, /^top-mount-/],
  [/-halfshaft-/, /^(hub|hub-nut|wheel-bearing|knuckle|brake-disc|brake-shield)-/],
  // The check turns each drive shaft as a whole about its inner joint. In reality the inboard stub (beside the
  // motor, splined into the side gear) does not move, so pairs with the shaft's own drive unit are not
  // meaningful here; the static packaging check covers them.
  [/^front-halfshaft-/, /^front-(?!halfshaft)/],
  [/^rear-halfshaft-/, /^rear-(?!halfshaft)/],
  [/^lower-arm-/, /^(front|rear)-subframe$/],
  [/^tie-rod-/, /^steering-rack$/],
  [/^toe-link-/, /^rear-subframe$/],
  [/^drop-link-/, /-anti-roll-bar$/],
];
const joint = (a: string, b: string) => JOINTS.some(([p, q]) => (p.test(a) && q.test(b)) || (p.test(b) && q.test(a)));

/** Known body-structure clashes (docs/body-structure-backlog.md). */
const KNOWN: [string, RegExp][] = [
  ["B1", / \/ sill-[lr]$|^sill-[lr] \//],
  ["B2", /(front|rear)-rail-[lr]/],
  ["B3", /cabin-floor/],
  ["B4", /door-(structure|trim|seal)-r[lr]/],
  ["B5", /arch-liner-/],
  ["B6", /^upper-arm-r[lr] \/ seat-(rear|back-rear)$/],
];

describe("suspension and steering clearances through travel and lock", () => {
  it("no moving corner part meets a neighbour, at -80/0/+80 mm and (front) -35/0/+35 degrees", async () => {
    const units = new Map<string, THREE.Object3D>();
    for (const m of MODELS) for (const [id, o] of await loadParts(m)) units.set(id, o);
    const built = buildVehicle(units);
    for (const b of built) {
      if (units.has(b.id)) continue;
      b.object.position.copy(b.position);
      b.object.rotation.copy(b.rotation);
      b.object.updateMatrixWorld(true);
    }
    const objects = new Map(built.map((b) => [b.id, b.object]));
    const lines: string[] = [];
    const unknown: string[] = [];
    const counts = new Map<string, number>();
    for (const c of ["fr", "fl", "rr", "rl"] as Corner[]) {
      const moving = movingParts(c).filter(([id]) => objects.has(id));
      const movingIds = new Set(moving.map(([id]) => id));
      const zone = new THREE.Box3();
      for (const [id] of moving) zone.expandByObject(objects.get(id)!);
      zone.expandByScalar(0.25);
      const fixed = built.filter((b) => !movingIds.has(b.id) && b.id !== "underbody" && !b.id.startsWith("brake-hose-")
        && PART_BY_ID.get(b.id)!.shape.kind !== "panel" && zone.intersectsBox(new THREE.Box3().setFromObject(b.object)));
      const fixedCells = new Map(fixed.map((b) => [b.id, { cells: voxels(b.object, VOXEL), box: new THREE.Box3().setFromObject(b.object).expandByScalar(VOXEL) }]));
      const poses = c[0] === "f" ? TRAVEL.flatMap((t) => STEER.map((s) => pose(c, t, s))) : TRAVEL.map((t) => pose(c, t));
      for (const p of poses) {
        const placed = moving.map(([id, key]) => {
          const m = p[key] as THREE.Matrix4;
          const box = new THREE.Box3().setFromObject(objects.get(id)!).applyMatrix4(m).expandByScalar(VOXEL);
          return { id, key, box, cells: voxels(objects.get(id)!, VOXEL, m) };
        });
        const where = `${c} ${(p.travel * 1000).toFixed(0).padStart(3)} mm ${String(p.steer).padStart(3)} deg`;
        const report = (a: string, b: string, n: number) => {
          const pair = `${a} / ${b}`;
          const known = KNOWN.find(([, re]) => re.test(pair))?.[0];
          counts.set(known ?? "new", (counts.get(known ?? "new") ?? 0) + 1);
          if (!known) unknown.push(`${where}: ${pair} (${n} voxels)`);
        };
        for (const a of placed) {
          for (const [id, f] of fixedCells) {
            if (!a.box.intersectsBox(f.box) || joint(a.id, id)) continue;
            const n = shared(a.cells, f.cells);
            if (n > 2) report(a.id, id, n);
          }
          for (const b of placed) {
            if (b.id <= a.id || b.key === a.key || !a.box.intersectsBox(b.box) || joint(a.id, b.id)) continue;
            const n = shared(a.cells, b.cells);
            if (n > 2) report(a.id, b.id, n);
          }
        }
        lines.push(`${where}: rack ${(p.rack * 1000).toFixed(1)} mm, camber ${p.camber.toFixed(2)} deg, toe ${p.toe.toFixed(2)} deg`);
      }
    }
    console.info(["travel and lock poses:", ...lines].join("\n"));
    console.info(`known body-structure clashes in motion: ${[...counts].map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
    const summary = new Map<string, string[]>();
    for (const u of unknown) {
      const [where, rest] = u.split(": ");
      const pair = rest.replace(/ \(\d+ voxels\)/, "");
      summary.set(pair, [...(summary.get(pair) ?? []), where.replace(/\s+/g, " ")]);
    }
    console.info(["open conflicts (travel-open.json), by pair:", ...[...summary].map(([k, w]) => `${k}: ${w.length} pose(s): ${w.join("; ")}`)].join("\n"));
    // The open list is reported for review, not excluded: any change in either direction fails here.
    const found = Object.fromEntries([...summary].map(([k, w]) => [k, [...w].sort()]));
    const listed = Object.fromEntries(Object.entries(openConflicts.open).map(([k, w]) => [k, [...w].sort()]));
    expect(found, "open clearance conflicts changed: review and update travel-open.json").toEqual(listed);
  }, 900_000);
});
