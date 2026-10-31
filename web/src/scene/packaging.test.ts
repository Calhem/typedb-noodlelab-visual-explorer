// Packaging check for the Blender drive units, battery pack and power electronics (docs/c3a, docs/c3b): no
// modelled part may pass through a part around it (suspension, steering, subframes, thermal and power parts,
// harnesses, the body structure, the corner).
// Each part's surface is sampled every few millimetres into a voxel grid; two parts whose surfaces share
// voxels are within about a voxel of each other. Parts designed to touch (a drive shaft in its hub, a mount on
// the subframe, the harness in its connector) are listed as contacts. Loads the real compressed models.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PART_BY_ID } from "../vehicle/manifest";
import { buildVehicle } from "./buildVehicle";
import { loadParts, voxels } from "./clearance";

const VOXEL = 0.006; // metres

/** Designed contacts: [drive-unit id pattern, neighbour id pattern]. */
const CONTACTS: [RegExp, RegExp][] = [
  // the splined stub runs through the hub and bearing (and through the simple discs' solid centres)
  [/-halfshaft-/, /^(hub|hub-nut|wheel-bearing|knuckle|brake-disc|brake-shield)-/],
  [/-drive-unit-mount-/, /-subframe$/],
  [/-hv-connector$/, /^hv-harness-/],
  [/-inverter$/, /^hv-harness-/],
  // C3b: cables in their outlets, the pack bolted to the sills, the coolant line in the pack's ports
  [/^(battery-enclosure|hv-junction-box|battery-rear-feed|pdu|charge-port|obc)$/, /^hv-harness-/],
  [/^(battery-enclosure|battery-coolant-manifold)$/, /^coolant-lines$/],
  [/^battery-side-rail-/, /^sill-/],
  [/^(lv-battery|lv-fuse-box)$/, /^lv-harness$/],
  // C3c: the tie rod's inner joint on the rack end; the drop link's lower joint on the anti-roll bar's end
  [/^tie-rod-f[lr]$/, /^steering-rack$/],
  [/^drop-link-/, /-anti-roll-bar$/],
  // C3c step 2: the lower arms' bushes bolted in the subframe's clevis brackets; the toe links' inner joints in
  // their brackets; the subframe mounts bolted to the front rails
  [/^lower-arm-/, /^(front|rear)-subframe$/],
  [/^toe-link-r[lr]$/, /^rear-subframe$/],
  [/^front-subframe-mount-/, /^front-rail-[lr]$/],
];
// The body's underside panel, which the drive units sit through by design.
const SKIP = new Set(["underbody"]);

/** Known clashes, each listed with where it is tracked. They are not ignored: the check prints every one on every
 * run, fails if anything new appears, and fails if a listed group no longer occurs (so the list is kept current).
 * B1-B5: docs/body-structure-backlog.md (B6 occurs only in motion) (the simple body structure; fixed by the body reconstruction).
 * (C3c step 1's temporary group C3c-2, placeholder suspension parts, was resolved in step 2.) */
const KNOWN: [string, RegExp][] = [
  ["B1", /^.+-(fl|fr|rl|rr)(-\d)? \/ sill-[lr]$|^rear-halfshaft-[lr] \/ sill-[lr]$/],
  ["B2", /^(upper-arm|spring|coilover|drop-link|tie-rod)-(fl|fr|rl|rr) \/ (front|rear)-rail-[lr]$/],
  ["B3", /^(tyre|wheel|knuckle|toe-link|drop-link)-r[lr] \/ cabin-floor$|^rear-subframe \/ cabin-floor$/],
  ["B4", /^tyre-r[lr] \/ door-(structure|trim)-r[lr]$/],
  ["B5", /^knuckle-f[lr] \/ arch-liner-f[lr]$/],
];
const known = (pair: string) => KNOWN.find(([, re]) => re.test(pair))?.[0];

const MODELS = ["corner-fr", "corner-fl", "corner-rr", "corner-rl", "chassis", "front-drive-unit", "rear-drive-unit", "hv-battery", "power-electronics"];

describe("mechanical packaging", () => {
  it("no modelled part passes through a neighbouring part (simple shapes, or parts of another model)", async () => {
    const assetOf = new Map<string, string>();
    const units = new Map<string, THREE.Object3D>();
    for (const m of MODELS) for (const [id, o] of await loadParts(m)) { units.set(id, o); assetOf.set(id, m); }
    const built = buildVehicle(units);
    const zones = [new THREE.Box3(new THREE.Vector3(1.0, 0.1, -0.85), new THREE.Vector3(2.1, 1.1, 0.85)),
                   new THREE.Box3(new THREE.Vector3(-2.1, 0.1, -0.85), new THREE.Vector3(-0.9, 1.1, 0.85)),
                   new THREE.Box3(new THREE.Vector3(-1.1, 0.1, -0.85), new THREE.Vector3(1.3, 0.5, 0.85))];
    // neighbours: the simple shapes in the chassis zones, and every modelled part (checked against other models only)
    const neighbours = built.filter((b) => {
      if (SKIP.has(b.id) || PART_BY_ID.get(b.id)!.shape.kind === "panel") return false;
      if (units.has(b.id)) return true;
      b.object.position.copy(b.position);
      b.object.rotation.copy(b.rotation);
      b.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(b.object);
      return zones.some((z) => z.intersectsBox(box));
    });
    const near = neighbours.map((b) => ({ id: b.id, asset: assetOf.get(b.id) ?? "", box: new THREE.Box3().setFromObject(b.object).expandByScalar(VOXEL),
      cells: null as Set<string> | null, object: b.object }));
    const cells = new Map<string, Set<string>>();
    const cellsOf = (id: string, o: THREE.Object3D) => { if (!cells.has(id)) cells.set(id, voxels(o, VOXEL)); return cells.get(id)!; };
    const contact = (a: string, b: string) => CONTACTS.some(([p, q]) => (p.test(a) && q.test(b)) || (p.test(b) && q.test(a)));
    const clashes: string[] = [];
    for (const [id, object] of units) {
      const box = new THREE.Box3().setFromObject(object);
      for (const n of near) {
        if (n.asset && (n.asset === assetOf.get(id) || n.asset < assetOf.get(id)!)) continue; // same model, or pair already checked
        if (!n.box.intersectsBox(box) || contact(id, n.id)) continue;
        const mine = cellsOf(id, object), theirs = cellsOf(n.id, n.object);
        let shared = 0;
        for (const v of theirs) if (mine.has(v)) shared++;
        if (shared > 2) {
          const pts = [...theirs].filter((v) => mine.has(v)).map((v) => v.split(",").map((k) => (Number(k) + 0.5) * VOXEL));
          const lo = [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k])).toFixed(3));
          const hi = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k])).toFixed(3));
          clashes.push(`${id} / ${n.id}: ${shared} voxels, ${lo} .. ${hi}`);
        }
      }
    }
    const pairs = clashes.map((c) => c.split(":")[0]);
    const groups = new Map(KNOWN.map(([g]) => [g, pairs.filter((p) => known(p) === g)]));
    for (const [g, ps] of groups) console.info(`packaging, known ${g}: ${ps.length} clash(es)${ps.length ? ": " + ps.join(", ") : ""}`);
    expect(clashes.filter((c) => !known(c.split(":")[0])), "new clashes").toEqual([]);
    for (const [g, ps] of groups) expect(ps.length, `known group ${g} no longer occurs: update the list`).toBeGreaterThan(0);
  }, 600_000);
});
