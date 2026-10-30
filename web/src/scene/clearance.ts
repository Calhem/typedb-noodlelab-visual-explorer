// Shared by the packaging and suspension-travel checks (test helpers only; the app does not import this).
// Each part's surface is sampled into a voxel grid; two parts whose surfaces share voxels are within about one
// voxel of each other.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const asset = (name: string) => fileURLToPath(new URL(`../../public/assets/${name}`, import.meta.url));

/** A model's parts by component id (the real compressed model and its mapping file). */
export async function loadParts(name: string) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const buf = readFileSync(asset(`${name}.glb`));
  const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const map: { nodes: Record<string, string> } = JSON.parse(readFileSync(asset(`${name}.map.json`), "utf8"));
  gltf.scene.updateMatrixWorld(true);
  return new Map(gltf.scene.children.map((n) => [map.nodes[n.name], n]));
}

/** Voxels touched by an object's surface (triangles sampled at a third of a voxel), optionally after moving
 * the object by `move` (a transform in vehicle coordinates applied on top of its own placement). */
export function voxels(object: THREE.Object3D, voxel = 0.006, move?: THREE.Matrix4) {
  const out = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const m = new THREE.Matrix4();
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    m.copy(mesh.matrixWorld);
    if (move) m.premultiply(move);
    const pos = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const tri = index ? index.count / 3 : pos.count / 3;
    const at = (i: number) => (index ? index.getX(i) : i);
    for (let t = 0; t < tri; t++) {
      a.fromBufferAttribute(pos, at(3 * t)).applyMatrix4(m);
      b.fromBufferAttribute(pos, at(3 * t + 1)).applyMatrix4(m);
      c.fromBufferAttribute(pos, at(3 * t + 2)).applyMatrix4(m);
      const n = Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / (voxel / 3));
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          p.copy(a).multiplyScalar(1 - (i + j) / n).addScaledVector(b, i / n).addScaledVector(c, j / n);
          out.add(`${Math.floor(p.x / voxel)},${Math.floor(p.y / voxel)},${Math.floor(p.z / voxel)}`);
        }
    }
  });
  return out;
}

/** Number of voxels two sets share. */
export function shared(a: Set<string>, b: Set<string>) {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let n = 0;
  for (const v of small) if (big.has(v)) n++;
  return n;
}
