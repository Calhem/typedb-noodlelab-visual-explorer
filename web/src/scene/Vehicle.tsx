// Renders every part in the manifest as its own mesh, named by its stable part id.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildBodyPanels, type BodyPanel } from "../vehicle/body";
import { PARTS } from "../vehicle/manifest";
import { createMaterials } from "../vehicle/materials";
import { buildShape } from "../vehicle/shapes";

export interface BuiltPart {
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

/** Returns a function giving the x of the body's front or rear face at height y, sideways offset z. */
function bodySurfaceFinder(panels: BodyPanel[]) {
  const meshes = panels.map((p) => {
    const m = new THREE.Mesh(p.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.position.copy(p.center);
    m.updateMatrixWorld();
    return m;
  });
  const ray = new THREE.Raycaster();
  return (end: "front" | "rear", y: number, z: number) => {
    const dir = end === "front" ? -1 : 1;
    ray.set(new THREE.Vector3(-dir * 10, y, z), new THREE.Vector3(dir, 0, 0));
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) throw new Error(`No body surface at the ${end}, y=${y}, z=${z}`);
    return hit.point.x;
  };
}

/** Build all geometry once. Body panels come from the lofted shell; everything else from shapes.ts. */
export function buildVehicle(): BuiltPart[] {
  const materials = createMaterials();
  const panels = new Map(buildBodyPanels().map((p) => [p.id as string, p]));
  const surface = bodySurfaceFinder([...panels.values()]);
  return PARTS.map((part) => {
    if (part.shape.kind === "panel") {
      const panel = panels.get(part.id);
      if (!panel) throw new Error(`Body panel "${part.id}" has no surface`);
      return { id: part.id, geometry: panel.geometry, material: materials[part.material], position: panel.center.clone(), rotation: new THREE.Euler() };
    }
    const position = new THREE.Vector3(...(part.position ?? [0, 0, 0]));
    if (part.attach) position.x = surface(part.attach, position.y, position.z) + (part.attach === "front" ? 1 : -1) * position.x;
    return {
      id: part.id,
      geometry: buildShape(part.shape),
      material: materials[part.material],
      position,
      rotation: new THREE.Euler(...(part.rotation ?? [0, 0, 0])),
    };
  });
}

export function Vehicle() {
  const built = useMemo(buildVehicle, []);
  useEffect(
    () => () => {
      for (const b of built) b.geometry.dispose();
      for (const m of new Set(built.map((b) => b.material))) m.dispose();
    },
    [built],
  );
  return (
    <group name="vehicle">
      {built.map((b) => (
        <mesh
          key={b.id}
          name={b.id}
          geometry={b.geometry}
          material={b.material}
          position={b.position}
          rotation={b.rotation}
          userData={{ partId: b.id }}
        />
      ))}
    </group>
  );
}
