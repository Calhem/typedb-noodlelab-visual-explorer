// Checks the Blender-modelled corner (web/public/assets/corner-fr.*) against the component manifest:
// the mapping file links every node to a real component id, both detail levels have the same nodes,
// positions are sensible, and every material name is one the app renders. Reads the GLB's JSON chunk
// directly, so it needs no browser.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FRONT_AXLE_X } from "../vehicle/dimensions";
import { PART_BY_ID } from "../vehicle/manifest";
import { createStudioMaterials } from "../vehicle/studioMaterials";

const asset = (name: string) => fileURLToPath(new URL(`../../public/assets/${name}`, import.meta.url));

function gltfJson(path: string) {
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const length = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16)).toBe(0x4e4f534a); // "JSON" chunk
  return JSON.parse(buf.subarray(20, 20 + length).toString("utf8"));
}

const EXPECTED = [
  "tyre-fr", "wheel-fr", "wheel-nut-fr-1", "wheel-nut-fr-2", "wheel-nut-fr-3", "wheel-nut-fr-4", "wheel-nut-fr-5",
  "brake-disc-fr", "caliper-fr", "brake-pad-inner-fr", "brake-pad-outer-fr", "brake-shield-fr", "brake-hose-fr", "hub-fr", "hub-nut-fr",
  "wheel-bearing-fr", "knuckle-fr", "wheel-speed-sensor-fr", "lower-arm-fr", "upper-arm-fr", "coilover-fr",
  "spring-fr", "top-mount-fr", "drop-link-fr", "tie-rod-fr",
];

describe("Blender front-right corner", () => {
  const map: { asset: string; nodes: Record<string, string> } = JSON.parse(readFileSync(asset("corner-fr.map.json"), "utf8"));
  const roots = (json: { scenes: { nodes: number[] }[]; scene?: number; nodes: { name: string }[] }) =>
    json.scenes[json.scene ?? 0].nodes.map((i) => json.nodes[i]);
  const full = gltfJson(asset("corner-fr.glb"));
  const light = gltfJson(asset("corner-fr.lod1.glb"));
  const nodes = roots(full) as { name: string; translation: number[]; rotation?: number[] }[];

  it("maps every node to a component id from the manifest (node names are not ids)", () => {
    for (const n of nodes) {
      const id = map.nodes[n.name];
      expect(id, n.name).toBeDefined();
      expect(PART_BY_ID.has(id), id).toBe(true);
    }
  });

  it("draws exactly the corner's parts, once each", () => {
    expect(nodes.map((n) => map.nodes[n.name]).sort()).toEqual([...EXPECTED].sort());
    expect(Object.keys(map.nodes).sort()).toEqual(nodes.map((n) => n.name).sort());
  });

  it("has the same nodes in the light detail level", () => {
    expect(roots(light).map((n) => n.name).sort()).toEqual(nodes.map((n) => n.name).sort());
  });

  it("places every part near the front-right wheel, with no rotation baked into the node", () => {
    for (const n of nodes) {
      const [x, y, z] = n.translation;
      expect(Math.abs(x - FRONT_AXLE_X), n.name).toBeLessThan(0.35);
      expect(y, n.name).toBeGreaterThan(0);
      expect(y, n.name).toBeLessThan(1.1);
      expect(z, n.name).toBeGreaterThan(0.35);
      expect(n.rotation, n.name).toBeUndefined();
    }
  });

  it("uses only material names the web app knows how to render", () => {
    const t = new THREE.Texture();
    const known = createStudioMaterials({ tread: t, treadCavity: t, ringsFine: t, ringsFriction: t, brushing: t, cast: t, forged: t, friction: t });
    for (const m of full.materials) expect(known.has(m.name), m.name).toBe(true);
  });

  it("is compressed (Meshopt) and small enough to download quickly", () => {
    expect(full.extensionsUsed).toContain("EXT_meshopt_compression");
    expect(readFileSync(asset("corner-fr.glb")).byteLength).toBeLessThan(4_000_000);
  });
});
