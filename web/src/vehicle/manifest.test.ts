// Checks that the component manifest is internally consistent and matches the built geometry.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildVehicle } from "../scene/buildVehicle";
import { buildBodyPanels, PANEL_IDS } from "./body";
import { ASSEMBLIES, ASSEMBLY_BY_ID, PARTS } from "./manifest";

describe("component manifest", () => {
  it("gives every part a unique, stable-looking id", () => {
    const ids = PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("puts every part in a known assembly, and every assembly under a known parent", () => {
    for (const p of PARTS) expect(ASSEMBLY_BY_ID.has(p.assembly), p.id).toBe(true);
    const roots = ASSEMBLIES.filter((a) => a.parent === null);
    expect(roots.map((a) => a.id)).toEqual(["vehicle"]);
    for (const a of ASSEMBLIES) if (a.parent) expect(ASSEMBLY_BY_ID.has(a.parent), a.id).toBe(true);
  });

  it("has no empty assemblies", () => {
    const used = new Set<string>();
    for (const p of PARTS) {
      for (let a: string | null = p.assembly; a; a = ASSEMBLY_BY_ID.get(a)!.parent) used.add(a);
    }
    for (const a of ASSEMBLIES) expect(used.has(a.id), a.id).toBe(true);
  });

  it("lists exactly the body panels the shell produces, each with real geometry", () => {
    const panelParts = PARTS.filter((p) => p.shape.kind === "panel").map((p) => p.id).sort();
    expect(panelParts).toEqual([...PANEL_IDS].sort());
    const built = buildBodyPanels();
    expect(built.map((b) => b.id).sort()).toEqual([...PANEL_IDS].sort());
    for (const b of built) expect(b.geometry.index!.count, b.id).toBeGreaterThan(30);
  });

  it("gives non-panel parts an explicit position", () => {
    for (const p of PARTS) if (p.shape.kind !== "panel") expect(p.position, p.id).toBeDefined();
  });

  it("builds every part with finite geometry, tagged with its id", () => {
    for (const b of buildVehicle()) {
      const mesh = b.object as THREE.Mesh;
      const pos = mesh.geometry.getAttribute("position");
      expect(pos.count, b.id).toBeGreaterThan(0);
      for (let i = 0; i < pos.count; i += 7) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), b.id).toBe(true);
      b.object.traverse((o) => expect(o.userData.partId, b.id).toBe(b.id));
    }
  });
});
