// Renders every part in the manifest as its own object, named by its stable part id, and moves the
// objects to their exploded positions whenever the progress value changes.

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { use, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildExplosionPlan, explodedBounds, partTransform } from "../vehicle/explode";
import type { Vec3 } from "../vehicle/shapes";
import { externalParts } from "./assets";
import { buildVehicle } from "./buildVehicle";
import { setExplodedVolume } from "./framing";
import { progress } from "./progress";
import { vehicleState } from "./vehicleState";

const ACCENT = new THREE.Color("#02dac9");

export function Vehicle({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const loaded = use(externalParts);
  const built = useMemo(() => buildVehicle(loaded.parts), [loaded]);
  const plan = useMemo(() => {
    const centers = new Map(built.map((b) => [b.id, b.position.toArray() as Vec3]));
    const plan = buildExplosionPlan(centers);
    const { min, max } = explodedBounds(centers, plan);
    setExplodedVolume(min, max);
    Object.assign(vehicleState, { built, plan, loaded });
    return plan;
  }, [built, loaded]);
  const applied = useRef(-1);

  useEffect(
    () => () => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const b of built) {
        b.object.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          geometries.add(mesh.geometry);
          for (const m of [mesh.material].flat()) materials.add(m);
        });
      }
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
    [built],
  );

  // Selection highlight: every mesh of the selected part gets a copy of its material with a faint accent glow.
  useEffect(() => {
    const part = built.find((b) => b.id === selectedId);
    if (!part) return;
    const restore: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const lit: THREE.Material[] = [];
    const glow = (m: THREE.Material) => {
      const copy = m.clone() as THREE.MeshPhysicalMaterial;
      if ("emissive" in copy) {
        copy.emissive = ACCENT.clone();
        copy.emissiveIntensity = 0.35;
      }
      lit.push(copy);
      return copy;
    };
    part.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      restore.push([mesh, mesh.material]);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(glow) : glow(mesh.material);
    });
    return () => {
      for (const [mesh, m] of restore) mesh.material = m;
      for (const m of lit) m.dispose();
    };
  }, [selectedId, built]);

  useFrame((_, dt) => {
    progress.tick(Math.min(dt, 0.1));
    const p = progress.value;
    if (p === applied.current) return;
    applied.current = p;
    for (const b of built) {
      const [pos, turn] = partTransform(b.position.toArray() as Vec3, plan.get(b.id)!, p);
      b.object.position.set(...pos);
      b.object.rotation.set(b.rotation.x + turn[0], b.rotation.y + turn[1], b.rotation.z + turn[2]);
    }
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect((e.object.userData.partId as string) ?? null);
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = on ? "pointer" : "";
  };

  return (
    <group name="vehicle" onClick={pick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      {built.map((b) => (
        <primitive key={b.id} object={b.object} />
      ))}
    </group>
  );
}
