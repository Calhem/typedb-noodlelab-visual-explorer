// Packaging check for the Blender drive units (docs/c3a/README.md): no drive-unit part may pass through a
// part around it (suspension, steering, subframes, thermal and power parts, the body structure, the corner).
// Each part's surface is sampled every few millimetres into a voxel grid; two parts whose surfaces share
// voxels are within about a voxel of each other. Parts designed to touch (a drive shaft in its hub, a mount on
// the subframe, the harness in its connector) are listed as contacts. Loads the real compressed models.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";
import { PART_BY_ID } from "../vehicle/manifest";
import { buildVehicle } from "./buildVehicle";

const VOXEL = 0.006; // metres
const asset = (name: string) => fileURLToPath(new URL(`../../public/assets/${name}`, import.meta.url));

async function loadParts(name: string) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const buf = readFileSync(asset(`${name}.glb`));
  const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const map: { nodes: Record<string, string> } = JSON.parse(readFileSync(asset(`${name}.map.json`), "utf8"));
  gltf.scene.updateMatrixWorld(true);
  return new Map(gltf.scene.children.map((n) => [map.nodes[n.name], n]));
}

/** Voxels touched by an object's surface (triangles sampled at a third of a voxel). */
function voxels(object: THREE.Object3D) {
  const out = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const tri = index ? index.count / 3 : pos.count / 3;
    const at = (i: number) => (index ? index.getX(i) : i);
    for (let t = 0; t < tri; t++) {
      a.fromBufferAttribute(pos, at(3 * t)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, at(3 * t + 1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, at(3 * t + 2)).applyMatrix4(mesh.matrixWorld);
      const n = Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / (VOXEL / 3));
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          p.copy(a).multiplyScalar(1 - (i + j) / n).addScaledVector(b, i / n).addScaledVector(c, j / n);
          out.add(`${Math.floor(p.x / VOXEL)},${Math.floor(p.y / VOXEL)},${Math.floor(p.z / VOXEL)}`);
        }
    }
  });
  return out;
}

/** Designed contacts: [drive-unit id pattern, neighbour id pattern]. */
const CONTACTS: [RegExp, RegExp][] = [
  // the splined stub runs through the hub and bearing (and through the simple discs' solid centres)
  [/-halfshaft-/, /^(hub|hub-nut|wheel-bearing|knuckle|brake-disc|brake-shield)-/],
  [/-drive-unit-mount-/, /-subframe$/],
  [/-hv-connector$/, /^hv-harness-/],
  [/-inverter$/, /^hv-harness-/],
];
// The body's underside panel, which the drive units sit through by design; and the sills, whose simple boxes run
// on into the wheel arches since the wheelbase change (a body-structure issue recorded in docs/c3a/README.md).
const SKIP = new Set(["underbody", "sill-l", "sill-r"]);

describe("drive-unit packaging", () => {
  it("no drive-unit part passes through a neighbouring part", async () => {
    const units = new Map([...(await loadParts("front-drive-unit")), ...(await loadParts("rear-drive-unit"))]);
    const corner = await loadParts("corner-fr");
    const built = buildVehicle(corner);
    const zones = [new THREE.Box3(new THREE.Vector3(1.0, 0.1, -0.85), new THREE.Vector3(2.1, 1.1, 0.85)),
                   new THREE.Box3(new THREE.Vector3(-2.1, 0.1, -0.85), new THREE.Vector3(-0.9, 1.1, 0.85))];
    const neighbours = built.filter((b) => {
      if (units.has(b.id) || SKIP.has(b.id) || PART_BY_ID.get(b.id)!.shape.kind === "panel") return false;
      b.object.position.copy(b.position);
      b.object.rotation.copy(b.rotation);
      b.object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(b.object);
      return zones.some((z) => z.intersectsBox(box));
    });
    const near = neighbours.map((b) => ({ id: b.id, box: new THREE.Box3().setFromObject(b.object).expandByScalar(VOXEL), cells: null as Set<string> | null, object: b.object }));
    const clashes: string[] = [];
    for (const [id, object] of units) {
      const box = new THREE.Box3().setFromObject(object);
      let mine: Set<string> | null = null;
      for (const n of near) {
        if (!n.box.intersectsBox(box)) continue;
        if (CONTACTS.some(([a, b]) => a.test(id) && b.test(n.id))) continue;
        mine ??= voxels(object);
        n.cells ??= voxels(n.object);
        let shared = 0;
        for (const v of n.cells) if (mine.has(v)) shared++;
        if (shared > 2) {
          const pts = [...n.cells].filter((v) => mine!.has(v)).map((v) => v.split(",").map((k) => (Number(k) + 0.5) * VOXEL));
          const lo = [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k])).toFixed(3));
          const hi = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k])).toFixed(3));
          clashes.push(`${id} / ${n.id}: ${shared} voxels, ${lo} .. ${hi}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  }, 120_000);
});
