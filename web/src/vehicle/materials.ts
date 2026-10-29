// Physically based materials (PBR): each surface is described by colour, how metallic it is and
// how rough it is, and the renderer works out reflections from the studio lighting.

import * as THREE from "three";
import type { MaterialId } from "./manifest";

export function createMaterials(): Record<MaterialId, THREE.MeshPhysicalMaterial> {
  const m = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);
  return {
    // Metallic paint under a glossy clear coat, like real automotive paint.
    paint: m({ side: THREE.DoubleSide, color: "#9097a0", metalness: 0.8, roughness: 0.27, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 }),
    glass: m({ color: "#06080b", metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.62, clearcoat: 1, envMapIntensity: 1.4 }),
    "roof-glass": m({ color: "#030406", metalness: 0.3, roughness: 0.03, clearcoat: 1, envMapIntensity: 1.5 }),
    "gloss-black": m({ color: "#08090b", metalness: 0.3, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    "satin-black": m({ color: "#121316", metalness: 0.1, roughness: 0.62 }),
    rubber: m({ color: "#141416", metalness: 0, roughness: 0.86 }),
    alloy: m({ color: "#9aa0a6", metalness: 1, roughness: 0.24, clearcoat: 0.6 }),
    iron: m({ color: "#6d6f72", metalness: 1, roughness: 0.48 }),
    caliper: m({ color: "#2a2d31", metalness: 0.5, roughness: 0.38, clearcoat: 0.8 }),
    aluminium: m({ color: "#b6bbc0", metalness: 1, roughness: 0.36 }),
    cast: m({ color: "#7c8187", metalness: 0.9, roughness: 0.55 }),
    steel: m({ color: "#9ea3a8", metalness: 1, roughness: 0.3 }),
    // High-voltage cables are orange on real electric vehicles, by convention.
    "hv-orange": m({ color: "#d46a1f", metalness: 0.05, roughness: 0.45 }),
    electronics: m({ color: "#1d2024", metalness: 0.6, roughness: 0.42 }),
    battery: m({ color: "#3a4048", metalness: 0.8, roughness: 0.38 }),
    leather: m({ color: "#1a1714", metalness: 0, roughness: 0.68, sheen: 0.4, sheenColor: new THREE.Color("#3a332c") }),
    lamp: m({ color: "#d9dde2", metalness: 0.2, roughness: 0.1, emissive: new THREE.Color("#e8f0ff"), emissiveIntensity: 0.6, clearcoat: 1 }),
    "tail-lamp": m({ color: "#3a0507", metalness: 0.2, roughness: 0.15, emissive: new THREE.Color("#b3141b"), emissiveIntensity: 0.5, clearcoat: 1 }),
  };
}
