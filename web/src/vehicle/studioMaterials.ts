// Physically based materials for the Blender-modelled parts, matched by the material names the
// Blender scripts assign (see blender/corner.py). Surface detail comes from small textures generated
// here in code, so there are no image files to license or download:
//  - concentric machining marks and circular brushing for discs, hubs and diamond-cut wheel faces
//    (these parts carry "radial" UVs centred on the axle, so the rings line up with the real axis)
//  - a fine grain for cast and forged metal and for brake-pad friction material.

import * as THREE from "three";

const SIZE = 1024;

function canvasTexture(size: number, paint: (img: ImageData) => void, repeat = false): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  paint(img);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; // match glTF texture coordinates
  tex.colorSpace = THREE.NoColorSpace; // data, not colour
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Deterministic pseudo-random noise (no Math.random: the picture must be identical every load). */
function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Roughness (green channel) with concentric lathe rings around the texture centre. */
function radialRoughness(base: number, depth: number) {
  return canvasTexture(SIZE, (img) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const r = Math.hypot(x - SIZE / 2, y - SIZE / 2);
        const rings = 0.5 + 0.5 * Math.sin(r * 2.4) * Math.sin(r * 0.37 + 1.3);
        const v = Math.min(1, Math.max(0, base + depth * (rings - 0.5) + 0.04 * (hash(Math.round(r * 4), 7) - 0.5)));
        const i = (y * SIZE + x) * 4;
        img.data[i] = 0;
        img.data[i + 1] = v * 255;
        img.data[i + 2] = 255; // metalness channel: fully metallic
        img.data[i + 3] = 255;
      }
    }
  });
}

/** Anisotropy direction map: the brushing runs round the circle (tangent to the rings). */
function radialAnisotropy() {
  return canvasTexture(SIZE, (img) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - SIZE / 2 + 0.5;
        const dy = y - SIZE / 2 + 0.5;
        const len = Math.hypot(dx, dy) || 1;
        const i = (y * SIZE + x) * 4;
        img.data[i] = ((-dy / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((dx / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
  });
}

/** Tileable grain in the roughness channel: cast metal, forged metal, friction material. */
function grain(base: number, depth: number, scale: number) {
  const n = 512;
  return canvasTexture(
    n,
    (img) => {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const coarse = hash(Math.floor(x / scale) % (n / scale), Math.floor(y / scale) % (n / scale));
          const fine = hash(x, y);
          const v = Math.min(1, Math.max(0, base + depth * (0.6 * coarse + 0.4 * fine - 0.5)));
          const i = (y * n + x) * 4;
          img.data[i] = 0;
          img.data[i + 1] = v * 255;
          img.data[i + 2] = 255;
          img.data[i + 3] = 255;
        }
      }
    },
    true,
  );
}

export interface StudioTextures {
  ringsFine: THREE.Texture;
  ringsFriction: THREE.Texture;
  brushing: THREE.Texture;
  cast: THREE.Texture;
  forged: THREE.Texture;
  friction: THREE.Texture;
}

/** Generate the surface textures (needs a browser: they are drawn on a canvas). */
export function createStudioTextures(): StudioTextures {
  return {
    ringsFine: radialRoughness(0.2, 0.22),
    ringsFriction: radialRoughness(0.32, 0.3),
    brushing: radialAnisotropy(),
    cast: grain(0.55, 0.35, 4),
    forged: grain(0.36, 0.18, 8),
    friction: grain(0.92, 0.12, 2),
  };
}

export function createStudioMaterials(textures: StudioTextures = createStudioTextures()): Map<string, THREE.MeshPhysicalMaterial> {
  const { ringsFine, ringsFriction, brushing, cast, forged, friction } = textures;

  const m = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);
  const c = (hex: string) => new THREE.Color(hex);
  return new Map<string, THREE.MeshPhysicalMaterial>([
    // tyre: soft black rubber with a faint sheen on the sidewall, never pure black
    ["rubber-tyre", m({ color: c("#1d1e21"), roughness: 0.86, sheen: 0.35, sheenRoughness: 0.6, sheenColor: c("#5b6068"), roughnessMap: friction })],
    ["rubber", m({ color: c("#1b1c1f"), roughness: 0.78, sheen: 0.2, sheenColor: c("#4a4e55") })],
    // wheel: gunmetal metallic paint, lacquered, with a diamond-cut machined face
    ["alloy-painted", m({ color: c("#5b6067"), metalness: 0.75, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08 })],
    ["alloy-machined", m({ color: c("#dadde0"), metalness: 1, roughness: 1, roughnessMap: ringsFine, anisotropy: 0.8, anisotropyMap: brushing, clearcoat: 0.7, clearcoatRoughness: 0.05 })],
    ["gloss-black", m({ color: c("#101114"), metalness: 0.3, roughness: 0.12, clearcoat: 1 })],
    ["steel-chrome", m({ color: c("#eef0f2"), metalness: 1, roughness: 0.07 })],
    ["steel-zinc", m({ color: c("#bdb8aa"), metalness: 1, roughness: 0.36 })],
    ["steel-dark", m({ color: c("#3d4045"), metalness: 0.6, roughness: 0.5 })],
    ["steel-machined", m({ color: c("#c7cbcf"), metalness: 1, roughness: 1, roughnessMap: ringsFine, anisotropy: 0.7, anisotropyMap: brushing })],
    // brakes: machined friction faces with circular brushing; cast iron vanes; anodised aluminium hat;
    // calliper in an anodised bronze (a restrained warm accent against the cool metals)
    ["iron-friction", m({ color: c("#a3a6a9"), metalness: 1, roughness: 1, roughnessMap: ringsFriction, anisotropy: 0.9, anisotropyMap: brushing })],
    ["iron-cast", m({ color: c("#55585c"), metalness: 0.85, roughness: 1, roughnessMap: cast })],
    ["aluminium-anodised", m({ color: c("#3e4248"), metalness: 1, roughness: 0.3, clearcoat: 0.4 })],
    ["caliper-paint", m({ color: c("#b8864f"), metalness: 0.85, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 })],
    ["pad-friction", m({ color: c("#2d2925"), metalness: 0, roughness: 1, roughnessMap: friction })],
    // hub, bearing
    ["bearing-steel", m({ color: c("#d8dbde"), metalness: 1, roughness: 0.1 })],
    ["brass", m({ color: c("#c9a04f"), metalness: 1, roughness: 0.28 })],
    // knuckle and arms: cast and forged aluminium with machined faces
    ["aluminium-cast", m({ color: c("#b9bdc2"), metalness: 0.9, roughness: 1, roughnessMap: cast })],
    ["aluminium-machined", m({ color: c("#e1e4e7"), metalness: 1, roughness: 0.18 })],
    ["aluminium-forged", m({ color: c("#c9cdd1"), metalness: 1, roughness: 1, roughnessMap: forged })],
    // damper, spring, plastics
    ["plastic-black", m({ color: c("#1f2023"), metalness: 0, roughness: 0.5 })],
    ["spring-paint", m({ color: c("#2c3035"), metalness: 0.4, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 })],
    ["damper-paint", m({ color: c("#23262b"), metalness: 0.5, roughness: 0.3, clearcoat: 0.8 })],
    ["polyurethane", m({ color: c("#b88a2f"), metalness: 0, roughness: 0.55, sheen: 0.3, sheenColor: c("#e0b866") })],
  ]);
}

/** Swap the placeholder materials on a loaded object for the studio materials of the same name. */
export function applyStudioMaterials(object: THREE.Object3D, library: Map<string, THREE.MeshPhysicalMaterial>) {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (mat: THREE.Material) => library.get(mat.name) ?? mat;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
