// Checks the Blender-modelled corner (public/assets/corner-fr.glb) against the component manifest:
// every top-level node is named by a manifest id, nothing is missing, and positions are sensible.
// Reads the GLB's JSON chunk directly, so it needs no browser.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PART_BY_ID } from "../vehicle/manifest";
import { createStudioMaterials } from "../vehicle/studioMaterials";

const file = fileURLToPath(new URL("../../public/assets/corner-fr.glb", import.meta.url));

function gltfJson(path: string) {
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const length = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16)).toBe(0x4e4f534a); // "JSON" chunk
  return JSON.parse(buf.subarray(20, 20 + length).toString("utf8"));
}

const EXPECTED = [
  "tyre-fr", "wheel-fr", "wheel-nut-fr-1", "wheel-nut-fr-2", "wheel-nut-fr-3", "wheel-nut-fr-4", "wheel-nut-fr-5",
  "brake-disc-fr", "caliper-fr", "brake-pad-inner-fr", "brake-pad-outer-fr", "brake-shield-fr", "hub-fr",
  "wheel-bearing-fr", "knuckle-fr", "wheel-speed-sensor-fr", "lower-arm-fr", "upper-arm-fr", "coilover-fr",
  "spring-fr", "top-mount-fr", "drop-link-fr", "tie-rod-fr",
];

describe("Blender front-right corner", () => {
  const json = gltfJson(file);
  const roots: number[] = json.scenes[json.scene ?? 0].nodes;
  const nodes = roots.map((i) => json.nodes[i]);

  it("names every top-level node by a component id from the manifest", () => {
    for (const n of nodes) expect(PART_BY_ID.has(n.name), n.name).toBe(true);
  });

  it("contains exactly the corner's parts, once each", () => {
    expect(nodes.map((n) => n.name).sort()).toEqual([...EXPECTED].sort());
  });

  it("places every part near the front-right wheel, with no rotation baked into the node", () => {
    for (const n of nodes) {
      const [x, y, z] = n.translation;
      expect(Math.abs(x - 1.437), n.name).toBeLessThan(0.35);
      expect(y, n.name).toBeGreaterThan(0);
      expect(y, n.name).toBeLessThan(1.1);
      expect(z, n.name).toBeGreaterThan(0.35);
      expect(n.rotation, n.name).toBeUndefined();
    }
  });

  it("uses only material names the web app knows how to render", () => {
    const t = new THREE.Texture();
    const known = createStudioMaterials({ ringsFine: t, ringsFriction: t, brushing: t, cast: t, forged: t, friction: t });
    for (const m of json.materials) expect(known.has(m.name), m.name).toBe(true);
  });
});
