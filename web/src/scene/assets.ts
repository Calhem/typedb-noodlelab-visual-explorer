// Loads the Blender-modelled parts (GLB files in web/public/assets). Each top-level node is named by
// its stable component id, so the rest of the app never depends on how the file is organised.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PART_BY_ID } from "../vehicle/manifest";
import { applyStudioMaterials, createStudioMaterials } from "../vehicle/studioMaterials";
import { settings } from "./settings";

export interface LoadedParts {
  parts: Map<string, THREE.Object3D>;
  bytes: number;
  millis: number;
}

async function load(url: string): Promise<LoadedParts> {
  const started = performance.now();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  const buffer = await response.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const library = createStudioMaterials();
  const parts = new Map<string, THREE.Object3D>();
  for (const node of [...gltf.scene.children]) {
    if (!PART_BY_ID.has(node.name)) {
      console.warn(`Ignoring "${node.name}" in ${url}: not a component id in the manifest`);
      continue;
    }
    node.removeFromParent();
    applyStudioMaterials(node, library);
    parts.set(node.name, node);
  }
  return { parts, bytes: buffer.byteLength, millis: performance.now() - started };
}

/** Started once, as soon as the app loads. Resolves to no parts when the Blender corner is switched off. */
export const externalParts: Promise<LoadedParts> = settings.blenderCorner
  ? load("/assets/corner-fr.glb")
  : Promise.resolve({ parts: new Map(), bytes: 0, millis: 0 });
