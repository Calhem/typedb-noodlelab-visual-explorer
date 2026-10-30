// The component manifest: every physical part of the vehicle, with a stable id, a name,
// the assembly it belongs to, its shape, its assembled position and its material.
//
// This is the single place the 3D scene learns what exists. The TypeDB dataset (Phase 3) is
// checked against these ids, so a part can't appear in one and silently be missing from the other.
// Ids never change once published; names can.

import { bodyLines, type PanelId } from "./body";
import { AXLE_Y, DRIVER_Z, FRONT_AXLE_X, REAR_AXLE_X, TRACK_HALF } from "./dimensions";
import type { Shape, Vec3 } from "./shapes";

export type MaterialId =
  | "paint" | "glass" | "roof-glass" | "gloss-black" | "satin-black" | "rubber" | "alloy" | "iron" | "caliper"
  | "aluminium" | "cast" | "hv-orange" | "electronics" | "lamp" | "tail-lamp" | "leather" | "battery" | "steel"
  | "copper" | "pcb" | "fabric";

/** What kind of thing a part is. Phase 3 maps each category onto a TypeDB entity type. */
export type Category =
  | "body-panel" | "glazing" | "lighting" | "structure" | "wheel" | "tyre" | "brake" | "suspension" | "steering"
  | "motor" | "gearbox" | "inverter" | "drive-shaft" | "battery" | "power-electronics" | "harness"
  | "camera" | "radar" | "lidar" | "gnss" | "wheel-speed-sensor" | "controller" | "compute" | "actuator"
  | "interior" | "trim" | "thermal";

export interface Assembly {
  id: string;
  name: string;
  parent: string | null;
}

export interface Part {
  id: string;
  name: string;
  assembly: string;
  category: Category;
  shape: Shape;
  material: MaterialId;
  /** Assembled position (vehicle coordinates). Body panels take theirs from the body surface;
   * inner panels give an offset from the panel they copy. */
  position?: Vec3;
  /** Mounted on the body's front or rear face: x is found from the surface at (y, z), and
   * position[0] becomes the offset from that surface (negative = set into it). */
  attach?: "front" | "rear";
  rotation?: Vec3;
}

// ---- Assemblies (the physical hierarchy) -------------------------------------------------------------

export const ASSEMBLIES: Assembly[] = [
  { id: "vehicle", name: "Vehicle", parent: null },
  { id: "body", name: "Body and closures", parent: "vehicle" },
  { id: "greenhouse", name: "Roof and glasshouse", parent: "body" },
  { id: "front-end", name: "Front end", parent: "body" },
  { id: "rear-end", name: "Rear end", parent: "body" },
  { id: "door-fl", name: "Front left door", parent: "body" },
  { id: "door-fr", name: "Front right door", parent: "body" },
  { id: "door-rl", name: "Rear left door", parent: "body" },
  { id: "door-rr", name: "Rear right door", parent: "body" },
  { id: "body-frame", name: "Body frame (pillars and roof structure)", parent: "body" },
  { id: "chassis", name: "Chassis", parent: "vehicle" },
  { id: "structure", name: "Body structure", parent: "chassis" },
  { id: "front-suspension", name: "Front suspension", parent: "chassis" },
  { id: "rear-suspension", name: "Rear suspension", parent: "chassis" },
  { id: "corner-fl", name: "Front left wheel end", parent: "chassis" },
  { id: "corner-fr", name: "Front right wheel end", parent: "chassis" },
  { id: "corner-rl", name: "Rear left wheel end", parent: "chassis" },
  { id: "corner-rr", name: "Rear right wheel end", parent: "chassis" },
  { id: "steering", name: "Steering system", parent: "chassis" },
  { id: "brake-control", name: "Brake control", parent: "chassis" },
  { id: "powertrain", name: "Electric powertrain", parent: "vehicle" },
  { id: "front-drive-unit", name: "Front drive unit", parent: "powertrain" },
  { id: "rear-drive-unit", name: "Rear drive unit", parent: "powertrain" },
  { id: "hv-battery", name: "High-voltage battery", parent: "powertrain" },
  { id: "power-distribution", name: "Power distribution", parent: "vehicle" },
  { id: "sensor-suite", name: "Driving sensor suite", parent: "vehicle" },
  { id: "electronics", name: "Control electronics", parent: "vehicle" },
  { id: "thermal", name: "Thermal management", parent: "vehicle" },
  { id: "interior", name: "Interior", parent: "vehicle" },
];

// ---- Helpers for parts that come in left/right pairs or four corners ----------------------------------

type Side = { key: "l" | "r"; word: string; z: 1 | -1 };
const SIDES: Side[] = [
  { key: "l", word: "left", z: -1 },
  { key: "r", word: "right", z: 1 },
];
type Corner = { key: "fl" | "fr" | "rl" | "rr"; word: string; x: number; z: 1 | -1; front: boolean };
const CORNERS: Corner[] = [
  { key: "fl", word: "front left", x: FRONT_AXLE_X, z: -1, front: true },
  { key: "fr", word: "front right", x: FRONT_AXLE_X, z: 1, front: true },
  { key: "rl", word: "rear left", x: REAR_AXLE_X, z: -1, front: false },
  { key: "rr", word: "rear right", x: REAR_AXLE_X, z: 1, front: false },
];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** A tube given by absolute points: the part's position becomes the points' centre. */
const absTube = (points: Vec3[], radius: number): Pick<Part, "shape" | "position"> => {
  const c: Vec3 = [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length) as Vec3;
  return { position: c, shape: { kind: "tube", radius, points: points.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]] as Vec3) } };
};
const mid = (a: Vec3, b: Vec3, lift = 0): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, (a[2] + b[2]) / 2];
const panel = (id: PanelId, name: string, assembly: string, category: Category, material: MaterialId): Part => ({
  id, name, assembly, category, material, shape: { kind: "panel" },
});

// ---- Parts --------------------------------------------------------------------------------------------

const body: Part[] = [
  panel("bonnet", "Bonnet", "front-end", "body-panel", "paint"),
  panel("front-bumper", "Front bumper", "front-end", "body-panel", "paint"),
  { id: "grille", name: "Lower air intake", assembly: "front-end", category: "trim", material: "gloss-black",
    shape: { kind: "box", size: [0.04, 0.13, 1.02], radius: 0.03 }, position: [-0.012, 0.53, 0], attach: "front" },
  ...SIDES.map((s): Part => panel(`fender-${s.key}` as PanelId, `${cap(s.word)} front wing`, "front-end", "body-panel", "paint")),
  ...SIDES.map((s): Part => ({
    id: `headlamp-${s.key}`, name: `${cap(s.word)} headlamp`, assembly: "front-end", category: "lighting", material: "lamp",
    shape: { kind: "box", size: [0.05, 0.032, 0.42], radius: 0.014 }, position: [-0.012, 0.8, s.z * 0.46], rotation: [0, s.z * 0.3, 0], attach: "front",
  })),
  ...SIDES.map((s): Part => ({
    id: `headlamp-lens-${s.key}`, name: `${cap(s.word)} headlamp lens`, assembly: "front-end", category: "lighting", material: "glass",
    shape: { kind: "box", size: [0.012, 0.045, 0.44], radius: 0.004 }, position: [0.006, 0.8, s.z * 0.46], rotation: [0, s.z * 0.3, 0], attach: "front",
  })),
  { id: "bonnet-inner", name: "Bonnet inner panel", assembly: "front-end", category: "structure", material: "aluminium",
    shape: { kind: "panel-inner", of: "bonnet" }, position: [0, -0.03, 0] },
  { id: "tailgate-inner", name: "Tailgate inner panel", assembly: "rear-end", category: "structure", material: "aluminium",
    shape: { kind: "panel-inner", of: "tailgate" }, position: [0.035, 0, 0] },
  panel("windscreen", "Windscreen", "greenhouse", "glazing", "glass"),
  panel("roof", "Panoramic roof", "greenhouse", "glazing", "roof-glass"),
  ...SIDES.map((s): Part => panel(`body-side-${s.key}` as PanelId, `${cap(s.word)} body side`, "greenhouse", "body-panel", "paint")),
  ...SIDES.map((s): Part => panel(`rocker-${s.key}` as PanelId, `${cap(s.word)} sill trim`, "body", "trim", "gloss-black")),
  panel("tailgate", "Tailgate", "rear-end", "body-panel", "paint"),
  panel("tailgate-glass", "Rear window", "rear-end", "glazing", "glass"),
  panel("rear-bumper", "Rear bumper", "rear-end", "body-panel", "paint"),
  panel("rear-diffuser", "Rear diffuser", "rear-end", "trim", "gloss-black"),
  ...SIDES.map((s): Part => panel(`quarter-${s.key}` as PanelId, `${cap(s.word)} rear quarter panel`, "rear-end", "body-panel", "paint")),
  ...SIDES.map((s): Part => panel(`quarter-glass-${s.key}` as PanelId, `${cap(s.word)} rear quarter window`, "rear-end", "glazing", "glass")),
  ...SIDES.map((s): Part => ({
    id: `tail-lamp-${s.key}`, name: `${cap(s.word)} tail lamp`, assembly: "rear-end", category: "lighting", material: "tail-lamp",
    shape: { kind: "box", size: [0.06, 0.05, 0.36], radius: 0.018 }, position: [-0.014, 1.04, s.z * 0.55], rotation: [0, -s.z * 0.32, 0], attach: "rear",
  })),
  ...CORNERS.map((c): Part => panel(`door-${c.key}` as PanelId, `${cap(c.word)} door panel`, `door-${c.key}`, "body-panel", "paint")),
  ...CORNERS.map((c): Part => panel(`glass-${c.key}` as PanelId, `${cap(c.word)} door window`, `door-${c.key}`, "glazing", "glass")),
  ...SIDES.map((s): Part => ({
    id: `mirror-${s.key}`, name: `${cap(s.word)} door mirror`, assembly: `door-f${s.key}`, category: "trim", material: "gloss-black",
    shape: { kind: "mirror" }, position: [0.7, 1.22, s.z * 1.04], rotation: [0, s.z > 0 ? 0 : Math.PI, 0],
  })),
];

const structure: Part[] = [
  panel("underbody", "Underbody aero shield", "structure", "structure", "satin-black"),
  ...CORNERS.map((c): Part => ({
    id: `arch-liner-${c.key}`, name: `${cap(c.word)} wheel-arch liner`, assembly: "structure", category: "structure", material: "satin-black",
    shape: { kind: "arch-liner" }, position: [c.x, AXLE_Y, c.z * 0.79],
  })),
  ...SIDES.map((s): Part => ({
    id: `sill-${s.key}`, name: `${cap(s.word)} sill rail`, assembly: "structure", category: "structure", material: "aluminium",
    shape: { kind: "box", size: [3.0, 0.11, 0.09], radius: 0.02 }, position: [-0.02, 0.4, s.z * 0.76],
  })),
  ...SIDES.map((s): Part => ({
    id: `front-rail-${s.key}`, name: `${cap(s.word)} front longitudinal rail`, assembly: "structure", category: "structure", material: "aluminium",
    shape: { kind: "box", size: [1.1, 0.1, 0.07], radius: 0.015 }, position: [1.78, 0.56, s.z * 0.5],
  })),
  ...SIDES.map((s): Part => ({
    id: `rear-rail-${s.key}`, name: `${cap(s.word)} rear longitudinal rail`, assembly: "structure", category: "structure", material: "aluminium",
    shape: { kind: "box", size: [1.0, 0.1, 0.07], radius: 0.015 }, position: [-1.86, 0.56, s.z * 0.55],
  })),
  { id: "front-crash-beam", name: "Front crash beam", assembly: "structure", category: "structure", material: "aluminium",
    shape: { kind: "tube", radius: 0.035, points: [[-0.06, 0, -0.78], [0.02, 0, -0.4], [0.04, 0, 0], [0.02, 0, 0.4], [-0.06, 0, 0.78]] },
    position: [2.34, 0.52, 0] },
  { id: "rear-crash-beam", name: "Rear crash beam", assembly: "structure", category: "structure", material: "aluminium",
    shape: { kind: "tube", radius: 0.035, points: [[0.06, 0, -0.78], [-0.02, 0, -0.4], [-0.04, 0, 0], [-0.02, 0, 0.4], [0.06, 0, 0.78]] },
    position: [-2.38, 0.56, 0] },
  { id: "bulkhead", name: "Front bulkhead", assembly: "structure", category: "structure", material: "aluminium",
    shape: { kind: "box", size: [0.02, 0.48, 1.42], radius: 0.008 }, position: [1.04, 0.66, 0], rotation: [0, 0, 0.12] },
];

const corners: Part[] = CORNERS.flatMap((c): Part[] => {
  const asm = `corner-${c.key}`;
  const flip: Vec3 = [0, c.z > 0 ? 0 : Math.PI, 0]; // wheel faces outwards on both sides
  const caliperAngle = c.front ? 2.2 : 2.3; // behind and above the axle
  const discR = c.front ? 0.19 : 0.175;
  return [
    { id: `tyre-${c.key}`, name: `${cap(c.word)} tyre`, assembly: asm, category: "tyre", material: "rubber",
      shape: { kind: "tyre" }, position: [c.x, AXLE_Y, c.z * TRACK_HALF], rotation: flip },
    { id: `wheel-${c.key}`, name: `${cap(c.word)} wheel`, assembly: asm, category: "wheel", material: "alloy",
      shape: { kind: "rim" }, position: [c.x, AXLE_Y, c.z * TRACK_HALF], rotation: flip },
    { id: `brake-disc-${c.key}`, name: `${cap(c.word)} brake disc`, assembly: asm, category: "brake", material: "iron",
      shape: { kind: "disc", radius: discR }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.08)], rotation: flip },
    { id: `caliper-${c.key}`, name: `${cap(c.word)} brake caliper`, assembly: asm, category: "actuator", material: "caliper",
      shape: { kind: "caliper" },
      position: [c.x + Math.cos(caliperAngle) * (discR - 0.03), AXLE_Y + Math.sin(caliperAngle) * (discR - 0.03), c.z * (TRACK_HALF - 0.08)],
      rotation: [0, c.z > 0 ? 0 : Math.PI, caliperAngle - Math.PI / 2] },
    { id: `knuckle-${c.key}`, name: `${cap(c.word)} steering knuckle`, assembly: asm, category: "suspension", material: "cast",
      shape: { kind: "box", size: [0.09, 0.3, 0.06], radius: 0.02 }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.15)] },
    { id: `wheel-speed-sensor-${c.key}`, name: `${cap(c.word)} wheel-speed sensor`, assembly: asm, category: "wheel-speed-sensor",
      material: "electronics", shape: { kind: "cylinder", radius: 0.012, length: 0.06, axis: "z" },
      position: [c.x + 0.07, AXLE_Y - 0.07, c.z * (TRACK_HALF - 0.17)] },
  ];
});

const suspension: Part[] = [
  ...CORNERS.flatMap((c): Part[] => {
    const asm = c.front ? "front-suspension" : "rear-suspension";
    return [
      { id: `lower-arm-${c.key}`, name: `${cap(c.word)} lower control arm`, assembly: asm, category: "suspension", material: "aluminium",
        shape: { kind: "arm", inner: [[0.17, 0, 0], [-0.17, 0, 0]], outer: [0, -0.02, c.z * 0.26] },
        position: [c.x, 0.24, c.z * 0.4] },
      { id: `coilover-${c.key}`, name: `${cap(c.word)} damper`, assembly: asm, category: "suspension", material: "steel",
        shape: { kind: "damper", length: 0.44 }, position: [c.x - 0.05, 0.72, c.z * 0.6], rotation: [c.z * 0.12, 0, 0] },
      { id: `spring-${c.key}`, name: `${cap(c.word)} coil spring`, assembly: asm, category: "suspension", material: "alloy",
        shape: { kind: "spring", length: 0.44 }, position: [c.x - 0.05, 0.72, c.z * 0.6], rotation: [c.z * 0.12, 0, 0] },
      { id: `top-mount-${c.key}`, name: `${cap(c.word)} suspension top mount`, assembly: asm, category: "suspension", material: "cast",
        shape: { kind: "cylinder", radius: 0.065, length: 0.035, axis: "y" }, position: [c.x - 0.05, 0.96, c.z * 0.575], rotation: [c.z * 0.12, 0, 0] },
    ];
  }),
  { id: "front-subframe", name: "Front subframe", assembly: "front-suspension", category: "structure", material: "cast",
    shape: { kind: "box", size: [0.5, 0.06, 0.9], radius: 0.02 }, position: [FRONT_AXLE_X, 0.22, 0] },
  { id: "rear-subframe", name: "Rear subframe", assembly: "rear-suspension", category: "structure", material: "cast",
    shape: { kind: "box", size: [0.5, 0.06, 0.9], radius: 0.02 }, position: [REAR_AXLE_X, 0.22, 0] },
  { id: "front-anti-roll-bar", name: "Front anti-roll bar", assembly: "front-suspension", category: "suspension", material: "steel",
    shape: { kind: "tube", radius: 0.012, points: [[0.12, 0.06, -0.62], [-0.02, 0, -0.5], [-0.04, 0, 0], [-0.02, 0, 0.5], [0.12, 0.06, 0.62]] },
    position: [FRONT_AXLE_X - 0.2, 0.3, 0] },
];

const steering: Part[] = [
  { id: "steering-rack", name: "Steering rack", assembly: "steering", category: "steering", material: "aluminium",
    shape: { kind: "cylinder", radius: 0.03, length: 0.9, axis: "z" }, position: [FRONT_AXLE_X - 0.2, 0.4, 0] },
  { id: "eps-motor", name: "Electric power-steering motor", assembly: "steering", category: "actuator", material: "cast",
    shape: { kind: "cylinder", radius: 0.055, length: 0.16, axis: "x" }, position: [FRONT_AXLE_X - 0.31, 0.42, 0.18] },
  { id: "steering-ecu", name: "Steering control module", assembly: "steering", category: "controller", material: "electronics",
    shape: { kind: "finned-box", size: [0.1, 0.06, 0.14], fins: 5 }, position: [FRONT_AXLE_X - 0.31, 0.51, 0.32] },
  { id: "steering-column", name: "Steering column", assembly: "steering", category: "steering", material: "steel",
    shape: { kind: "tube", radius: 0.02, points: [[0, 0, 0], [-0.22, 0.24, 0], [-0.55, 0.47, 0]] },
    position: [FRONT_AXLE_X - 0.24, 0.44, DRIVER_Z] },
  { id: "steering-wheel", name: "Steering wheel", assembly: "steering", category: "steering", material: "leather",
    shape: { kind: "steering-wheel" }, position: [0.6, 0.97, DRIVER_Z], rotation: [0, 0, -0.42] },
];

const brakeControl: Part[] = [
  { id: "brake-booster", name: "Electric brake booster", assembly: "brake-control", category: "actuator", material: "cast",
    shape: { kind: "cylinder", radius: 0.085, length: 0.16, axis: "x" }, position: [1.14, 0.84, DRIVER_Z] },
  { id: "esc-module", name: "Stability control module (ABS/ESC)", assembly: "brake-control", category: "controller", material: "aluminium",
    shape: { kind: "box", size: [0.15, 0.12, 0.14], radius: 0.02 }, position: [1.8, 0.7, 0.05] },
];

const driveUnit = (key: "front" | "rear", x: number, asm: string): Part[] => {
  const d = key === "front" ? 1 : -1;
  return [
    { id: `${key}-motor`, name: `${cap(key)} electric motor`, assembly: asm, category: "motor", material: "cast",
      shape: { kind: "cylinder", radius: key === "front" ? 0.13 : 0.145, length: 0.3, axis: "z", segments: 48 },
      position: [x - d * 0.04, 0.42, -0.13] },
    { id: `${key}-gearbox`, name: `${cap(key)} reduction gearbox`, assembly: asm, category: "gearbox", material: "aluminium",
      shape: { kind: "box", size: [0.32, 0.3, 0.18], radius: 0.05 }, position: [x, 0.4, 0.12] },
    { id: `${key}-inverter`, name: `${cap(key)} inverter`, assembly: asm, category: "inverter", material: "electronics",
      shape: { kind: "finned-box", size: [0.34, 0.1, 0.42], fins: 9 }, position: [x - d * 0.02, 0.62, -0.05] },
    ...SIDES.map((s): Part => ({
      id: `${key}-halfshaft-${s.key}`, name: `${cap(key)} ${s.word} drive shaft`, assembly: asm, category: "drive-shaft", material: "steel",
      shape: { kind: "cylinder", radius: 0.022, length: 0.44, axis: "z" }, position: [x, AXLE_Y, s.z * 0.45],
    })),
  ];
};

const battery: Part[] = [
  { id: "battery-enclosure", name: "Battery enclosure", assembly: "hv-battery", category: "battery", material: "aluminium",
    shape: { kind: "box", size: [2.0, 0.1, 1.36], radius: 0.03 }, position: [-0.02, 0.25, 0] },
  { id: "battery-lid", name: "Battery lid", assembly: "hv-battery", category: "battery", material: "satin-black",
    shape: { kind: "box", size: [1.98, 0.012, 1.34], radius: 0.005 }, position: [-0.02, 0.37, 0] },
  { id: "battery-cooling-plate", name: "Battery cooling plate", assembly: "hv-battery", category: "thermal", material: "aluminium",
    shape: { kind: "box", size: [1.9, 0.008, 1.28], radius: 0.003 }, position: [-0.02, 0.256, 0] },
  ...Array.from({ length: 8 }, (_, i) => -0.84 + i * 0.24).flatMap((x, i) =>
    SIDES.map((s, j): Part => ({
      id: `battery-module-${i * 2 + j + 1}`, name: `Battery module ${i * 2 + j + 1}`, assembly: "hv-battery", category: "battery",
      material: "battery", shape: { kind: "battery-module" }, position: [x - 0.02, 0.31, s.z * 0.33],
    })),
  ),
  ...SIDES.map((s): Part => ({
    id: `battery-busbar-${s.key}`, name: `${cap(s.word)} battery busbar`, assembly: "hv-battery", category: "battery", material: "copper",
    shape: { kind: "box", size: [1.86, 0.008, 0.03], radius: 0.003 }, position: [-0.02, 0.375, s.z * 0.33 + 0.06],
  })),
  ...[-0.5, -0.02, 0.46].map((x, i): Part => ({
    id: `battery-crossmember-${i + 1}`, name: `Battery crossmember ${i + 1}`, assembly: "hv-battery", category: "structure", material: "aluminium",
    shape: { kind: "box", size: [0.025, 0.09, 1.28], radius: 0.006 }, position: [x, 0.3, 0],
  })),
  ...SIDES.map((s): Part => ({
    id: `battery-side-rail-${s.key}`, name: `${cap(s.word)} battery side rail`, assembly: "hv-battery", category: "structure", material: "aluminium",
    shape: { kind: "box", size: [1.96, 0.11, 0.04], radius: 0.01 }, position: [-0.02, 0.27, s.z * 0.67],
  })),
  { id: "battery-coolant-manifold", name: "Battery coolant manifold", assembly: "hv-battery", category: "thermal", material: "aluminium",
    ...absTube([[-0.92, 0.27, 0], [0, 0.27, 0], [0.92, 0.27, 0]], 0.016) },
  { id: "hv-junction-box", name: "High-voltage junction box", assembly: "hv-battery", category: "power-electronics", material: "electronics",
    shape: { kind: "box", size: [0.16, 0.08, 0.22], radius: 0.012 }, position: [1.07, 0.31, -0.3] },
  { id: "bms", name: "Battery management system", assembly: "hv-battery", category: "controller", material: "electronics",
    shape: { kind: "box", size: [0.14, 0.05, 0.24], radius: 0.01 }, position: [1.08, 0.3, 0.36] },
];

const power: Part[] = [
  { id: "lv-battery", name: "12-volt battery", assembly: "power-distribution", category: "battery", material: "satin-black",
    shape: { kind: "box", size: [0.24, 0.18, 0.17], radius: 0.015 }, position: [1.95, 0.66, -0.42] },
  { id: "pdu", name: "Power distribution unit", assembly: "power-distribution", category: "power-electronics", material: "electronics",
    shape: { kind: "box", size: [0.2, 0.12, 0.22], radius: 0.015 }, position: [1.95, 0.66, 0.4] },
  { id: "dc-dc", name: "DC-DC converter", assembly: "power-distribution", category: "power-electronics", material: "electronics",
    shape: { kind: "finned-box", size: [0.22, 0.08, 0.2], fins: 6 }, position: [-1.18, 0.44, -0.42] },
  { id: "obc", name: "On-board charger", assembly: "power-distribution", category: "power-electronics", material: "electronics",
    shape: { kind: "finned-box", size: [0.3, 0.1, 0.26], fins: 8 }, position: [-1.9, 0.6, -0.33] },
  { id: "hv-harness-front", name: "Front high-voltage cable", assembly: "power-distribution", category: "harness", material: "hv-orange",
    shape: { kind: "tube", radius: 0.014, points: [[0, 0, 0], [0.2, 0.08, -0.05], [0.38, 0.28, -0.12], [0.46, 0.3, -0.2]] },
    position: [0.98, 0.32, 0.18] },
  { id: "hv-harness-rear", name: "Rear high-voltage cable", assembly: "power-distribution", category: "harness", material: "hv-orange",
    shape: { kind: "tube", radius: 0.014, points: [[0, 0, 0], [-0.2, 0.08, -0.05], [-0.38, 0.28, -0.12], [-0.46, 0.3, -0.2]] },
    position: [-1.02, 0.32, 0.18] },
  { id: "lv-harness", name: "Low-voltage wiring harness", assembly: "power-distribution", category: "harness", material: "satin-black",
    ...absTube([[1.95, 0.6, -0.3], [1.3, 0.75, -0.6], [0.6, 0.55, -0.68], [-0.4, 0.42, -0.68], [-1.2, 0.44, -0.66], [-1.9, 0.62, -0.5]], 0.012) },
];

const sensors: Part[] = [
  { id: "front-camera", name: "Forward-facing camera", assembly: "sensor-suite", category: "camera", material: "electronics",
    shape: { kind: "box", size: [0.07, 0.05, 0.16], radius: 0.012 }, position: [0.42, 1.43, 0] },
  { id: "rear-camera", name: "Rear-view camera", assembly: "sensor-suite", category: "camera", material: "electronics",
    shape: { kind: "cylinder", radius: 0.018, length: 0.04, axis: "x" }, position: [-0.008, 0.96, 0], attach: "rear" },
  ...SIDES.map((s): Part => ({
    id: `side-camera-${s.key}`, name: `${cap(s.word)} side camera`, assembly: `door-f${s.key}`, category: "camera", material: "electronics",
    shape: { kind: "cylinder", radius: 0.014, length: 0.03, axis: "y" }, position: [0.7, 1.15, s.z * 1.08],
  })),
  { id: "front-radar", name: "Front long-range radar", assembly: "sensor-suite", category: "radar", material: "electronics",
    shape: { kind: "box", size: [0.035, 0.11, 0.13], radius: 0.01 }, position: [-0.04, 0.53, 0], attach: "front" },
  ...CORNERS.map((c): Part => ({
    id: `corner-radar-${c.key}`, name: `${cap(c.word)} corner radar`, assembly: "sensor-suite", category: "radar", material: "electronics",
    shape: { kind: "box", size: [0.03, 0.09, 0.1], radius: 0.01 },
    position: [c.front ? 2.18 : -2.22, 0.64, c.z * 0.7], rotation: [0, c.front ? -c.z * 0.75 : c.z * 0.75, 0],
  })),
  { id: "lidar", name: "Roof lidar", assembly: "sensor-suite", category: "lidar", material: "electronics",
    shape: { kind: "lidar" }, position: [0.18, 1.71, 0] },
  { id: "gnss-antenna", name: "Satellite-navigation antenna", assembly: "sensor-suite", category: "gnss", material: "paint",
    shape: { kind: "shark-fin" }, position: [-1.6, 1.68, 0] },
];

const electronics: Part[] = [
  { id: "ad-compute", name: "Automated-driving computer", assembly: "electronics", category: "compute", material: "electronics",
    shape: { kind: "finned-box", size: [0.32, 0.08, 0.26], fins: 10 }, position: [-1.92, 0.6, 0.33] },
  { id: "vcu", name: "Vehicle control unit", assembly: "electronics", category: "controller", material: "electronics",
    shape: { kind: "box", size: [0.16, 0.05, 0.2], radius: 0.01 }, position: [0.86, 0.72, 0.05] },
  { id: "bcm", name: "Body control module", assembly: "electronics", category: "controller", material: "electronics",
    shape: { kind: "box", size: [0.14, 0.05, 0.18], radius: 0.01 }, position: [0.8, 0.68, -0.55] },
  { id: "gateway", name: "Central gateway", assembly: "electronics", category: "controller", material: "electronics",
    shape: { kind: "box", size: [0.14, 0.04, 0.16], radius: 0.01 }, position: [0.22, 0.45, 0] },
  { id: "telematics", name: "Telematics unit", assembly: "electronics", category: "controller", material: "electronics",
    shape: { kind: "box", size: [0.12, 0.03, 0.16], radius: 0.008 }, position: [-0.45, 1.55, 0] },
];

const interior: Part[] = [
  ...SIDES.flatMap((s): Part[] => {
    const at: Vec3 = [0.02, 0.55, s.z * DRIVER_Z];
    const seat = { assembly: "interior", category: "interior" as const, position: at };
    return [
      { ...seat, id: `seat-front-${s.key}`, name: `Front ${s.word} seat cushion`, material: "leather", shape: { kind: "seat", width: 0.52, piece: "cushion" } },
      { ...seat, id: `seat-back-front-${s.key}`, name: `Front ${s.word} seat back`, material: "leather", shape: { kind: "seat", width: 0.52, piece: "back" } },
      { ...seat, id: `headrest-front-${s.key}`, name: `Front ${s.word} headrest`, material: "leather", shape: { kind: "seat", width: 0.52, piece: "headrest" } },
      { ...seat, id: `seat-frame-front-${s.key}`, name: `Front ${s.word} seat frame`, material: "steel", shape: { kind: "seat", width: 0.52, piece: "frame" } },
    ];
  }),
  { id: "seat-rear", name: "Rear bench cushion", assembly: "interior", category: "interior", material: "leather",
    shape: { kind: "seat", width: 1.3, piece: "cushion" }, position: [-0.95, 0.58, 0] },
  { id: "seat-back-rear", name: "Rear bench back", assembly: "interior", category: "interior", material: "leather",
    shape: { kind: "seat", width: 1.3, piece: "back" }, position: [-0.95, 0.58, 0] },
  { id: "seat-frame-rear", name: "Rear bench frame", assembly: "interior", category: "interior", material: "steel",
    shape: { kind: "seat", width: 1.3, piece: "frame" }, position: [-0.95, 0.58, 0] },
  ...SIDES.map((s): Part => ({
    id: `headrest-rear-${s.key}`, name: `Rear ${s.word} headrest`, assembly: "interior", category: "interior", material: "leather",
    shape: { kind: "seat", width: 0.52, piece: "headrest" }, position: [-0.95, 0.58, s.z * 0.38],
  })),
  { id: "dashboard", name: "Dashboard", assembly: "interior", category: "interior", material: "satin-black",
    shape: { kind: "box", size: [0.36, 0.2, 1.46], radius: 0.06 }, position: [0.74, 0.88, 0] },
];

// ---- Detail layers: what makes the exploded view read as an engineering assembly -----------------

const { topLine: T, beltLine: B, halfWidth: W, roofHalfWidth: RW, bottomLine: Y } = bodyLines;
const roofPt = (x: number, z: 1 | -1): Vec3 => [x, T(x) - 0.075, z * (RW(x) - 0.01)];
const beltPt = (x: number, z: 1 | -1): Vec3 => [x, B(x) - 0.02, z * (W(x) - 0.11)];
const sillPt = (x: number, z: 1 | -1): Vec3 => [x, Y(x) + 0.12, z * (W(x) - 0.08)];
const frameTube = (id: string, name: string, points: Vec3[], radius = 0.026): Part => ({
  id, name, assembly: "body-frame", category: "structure", material: "aluminium", ...absTube(points, radius),
});

const bodyFrame: Part[] = [
  ...SIDES.flatMap((s): Part[] => [
    frameTube(`a-pillar-${s.key}`, `${cap(s.word)} A-pillar`, [beltPt(0.9, s.z), mid(beltPt(0.9, s.z), roofPt(0.2, s.z), 0.04), roofPt(0.2, s.z)]),
    frameTube(`b-pillar-${s.key}`, `${cap(s.word)} B-pillar`, [sillPt(-0.1, s.z), beltPt(-0.1, s.z), roofPt(-0.1, s.z)], 0.03),
    frameTube(`c-pillar-${s.key}`, `${cap(s.word)} C-pillar`, [beltPt(-1.27, s.z), roofPt(-1.27, s.z)]),
    frameTube(`d-pillar-${s.key}`, `${cap(s.word)} D-pillar`, [beltPt(-2.1, s.z), mid(beltPt(-2.1, s.z), roofPt(-1.95, s.z)), roofPt(-1.95, s.z)]),
    frameTube(`roof-rail-${s.key}`, `${cap(s.word)} roof rail`, [0.2, -0.4, -1.0, -1.6, -1.95].map((x) => roofPt(x, s.z)), 0.024),
  ]),
  ...([[0.2, "front-header", "Front roof header"], [-0.55, "roof-bow-1", "Front roof bow"], [-1.25, "roof-bow-2", "Rear roof bow"],
    [-1.95, "rear-header", "Rear roof header"]] as const).map(([x, id, name]) =>
    frameTube(id, name, [roofPt(x, -1), [x, T(x) - 0.06, 0], roofPt(x, 1)], 0.02)),
  frameTube("cross-car-beam", "Cross-car beam", [[0.8, 0.9, -0.78], [0.8, 0.94, 0], [0.8, 0.9, 0.78]], 0.032),
];

const floor: Part[] = [
  { id: "cabin-floor", name: "Cabin floor panel", assembly: "structure", category: "structure", material: "satin-black",
    shape: { kind: "box", size: [2.3, 0.012, 1.42], radius: 0.004 }, position: [-0.15, 0.39, 0] },
  ...([[0.45, 1], [-0.55, 2]] as const).map(([x, n]): Part => ({
    id: `floor-crossmember-${n}`, name: `Floor crossmember ${n}`, assembly: "structure", category: "structure", material: "aluminium",
    shape: { kind: "box", size: [0.08, 0.06, 1.42], radius: 0.012 }, position: [x, 0.43, 0],
  })),
];

const doorLayers: Part[] = CORNERS.flatMap((c): Part[] => {
  const asm = `door-${c.key}`;
  const cx = c.front ? 0.4 : -0.63;
  const len = c.front ? 1.0 : 1.06;
  const w = W(cx);
  return [
    { id: `door-structure-${c.key}`, name: `${cap(c.word)} door inner structure`, assembly: asm, category: "structure", material: "aluminium",
      shape: { kind: "box", size: [len * 0.92, 0.58, 0.03], radius: 0.012 }, position: [cx, 0.78, c.z * (w - 0.1)] },
    { id: `window-regulator-${c.key}`, name: `${cap(c.word)} window lift`, assembly: asm, category: "actuator", material: "steel",
      shape: { kind: "regulator", height: 0.45 }, position: [cx, 0.86, c.z * (w - 0.14)] },
    { id: `door-speaker-${c.key}`, name: `${cap(c.word)} door speaker`, assembly: asm, category: "interior", material: "satin-black",
      shape: { kind: "cylinder", radius: 0.075, length: 0.05, axis: "z" }, position: [cx + 0.28, 0.6, c.z * (w - 0.17)] },
    { id: `door-trim-${c.key}`, name: `${cap(c.word)} door trim panel`, assembly: asm, category: "interior", material: "leather",
      shape: { kind: "box", size: [len * 0.9, 0.56, 0.04], radius: 0.015 }, position: [cx, 0.8, c.z * (w - 0.21)] },
    { id: `door-handle-${c.key}`, name: `${cap(c.word)} door handle`, assembly: asm, category: "trim", material: "gloss-black",
      shape: { kind: "box", size: [0.15, 0.025, 0.03], radius: 0.01 }, position: [cx + 0.1, 1.0, c.z * (w + 0.0)] },
    { id: `door-latch-${c.key}`, name: `${cap(c.word)} door latch`, assembly: asm, category: "actuator", material: "steel",
      shape: { kind: "box", size: [0.05, 0.09, 0.04], radius: 0.008 }, position: [cx - len / 2 + 0.05, 0.86, c.z * (w - 0.12)] },
    { id: `door-seal-${c.key}`, name: `${cap(c.word)} door seal`, assembly: asm, category: "trim", material: "rubber",
      ...absTube([[cx - len / 2 + 0.03, 0.5, 0], [cx + len / 2 - 0.03, 0.5, 0], [cx + len / 2 - 0.03, 1.12, 0], [cx - len / 2 + 0.03, 1.12, 0],
        [cx - len / 2 + 0.03, 0.5, 0]].map(([px, py]) => [px, py, c.z * (w - 0.075)] as Vec3), 0.009) },
  ];
});

const wheelDetail: Part[] = CORNERS.flatMap((c): Part[] => {
  const asm = `corner-${c.key}`;
  const caliperAngle = c.front ? 2.2 : 2.3;
  const discR = c.front ? 0.19 : 0.175;
  return [
    { id: `hub-${c.key}`, name: `${cap(c.word)} wheel hub and bearing`, assembly: asm, category: "suspension", material: "steel",
      shape: { kind: "ring", radius: 0.07, inner: 0.03, length: 0.06, axis: "z" }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.12)] },
    { id: `brake-shield-${c.key}`, name: `${cap(c.word)} brake dust shield`, assembly: asm, category: "brake", material: "satin-black",
      shape: { kind: "cylinder", radius: discR + 0.012, length: 0.004, axis: "z", segments: 48 },
      position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.105)] },
    { id: `wheel-bearing-${c.key}`, name: `${cap(c.word)} wheel bearing`, assembly: asm, category: "suspension", material: "steel",
      shape: { kind: "ring", radius: 0.045, inner: 0.02, length: 0.04, axis: "z" }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.12)] },
    ...(["inner", "outer"] as const).map((side, k): Part => ({
      id: `brake-pad-${side}-${c.key}`, name: `${cap(c.word)} ${side} brake pad`, assembly: asm, category: "brake", material: "cast",
      shape: { kind: "box", size: [0.05, 0.12, 0.014], radius: 0.005 },
      position: [c.x + Math.cos(caliperAngle) * (discR - 0.03), AXLE_Y + Math.sin(caliperAngle) * (discR - 0.03),
        c.z * (TRACK_HALF - 0.08 + (k === 0 ? -0.028 : 0.028))],
      rotation: [0, 0, caliperAngle - Math.PI / 2],
    })),
    ...[1, 2, 3, 4, 5].map((n): Part => {
      const a = ((n - 1) / 5) * Math.PI * 2;
      return {
        id: `wheel-nut-${c.key}-${n}`, name: `${cap(c.word)} wheel nut ${n}`, assembly: asm, category: "wheel", material: "steel",
        shape: { kind: "cylinder", radius: 0.011, length: 0.03, axis: "z", segments: 6 },
        position: [c.x + Math.cos(a) * 0.058, AXLE_Y + Math.sin(a) * 0.058, c.z * (TRACK_HALF + 0.09)],
      };
    }),
  ];
});

const upperArms: Part[] = [
  ...CORNERS.map((c): Part => ({
    id: `upper-arm-${c.key}`, name: `${cap(c.word)} upper control arm`, assembly: c.front ? "front-suspension" : "rear-suspension",
    category: "suspension", material: "aluminium",
    shape: { kind: "arm", inner: [[0.12, 0, 0], [-0.12, 0, 0]], outer: [0, 0.02, c.z * 0.18] }, position: [c.x, 0.6, c.z * 0.46],
  })),
  ...CORNERS.map((c): Part => {
    const xe = c.front ? FRONT_AXLE_X - 0.08 : REAR_AXLE_X + 0.08;
    return { id: `drop-link-${c.key}`, name: `${cap(c.word)} anti-roll bar link`, assembly: c.front ? "front-suspension" : "rear-suspension",
      category: "suspension", material: "steel", ...absTube([[xe, 0.36, c.z * 0.62], [xe, 0.5, c.z * 0.62]], 0.008) };
  }),
  ...SIDES.map((s): Part => ({
    id: `toe-link-r${s.key}`, name: `Rear ${s.word} toe link`, assembly: "rear-suspension", category: "suspension", material: "steel",
    ...absTube([[REAR_AXLE_X + 0.2, 0.3, s.z * 0.4], [REAR_AXLE_X + 0.12, 0.32, s.z * 0.66]], 0.011),
  })),
  ...SIDES.map((s): Part => ({
    id: `tie-rod-f${s.key}`, name: `Front ${s.word} track rod`, assembly: "steering", category: "steering", material: "steel",
    ...absTube([[FRONT_AXLE_X - 0.2, 0.4, s.z * 0.45], [FRONT_AXLE_X - 0.12, 0.4, s.z * 0.68]], 0.012),
  })),
  { id: "rear-anti-roll-bar", name: "Rear anti-roll bar", assembly: "rear-suspension", category: "suspension", material: "steel",
    shape: { kind: "tube", radius: 0.011, points: [[-0.12, 0.06, -0.62], [0.02, 0, -0.5], [0.04, 0, 0], [0.02, 0, 0.5], [-0.12, 0.06, 0.62]] },
    position: [REAR_AXLE_X + 0.2, 0.3, 0] },
];

const driveUnitDetail = (key: "front" | "rear", x: number, asm: string): Part[] => {
  const d = key === "front" ? 1 : -1;
  const r = key === "front" ? 0.13 : 0.145;
  const mx = x - d * 0.04;
  return [
    { id: `${key}-stator`, name: `${cap(key)} motor stator`, assembly: asm, category: "motor", material: "copper",
      shape: { kind: "ring", radius: r - 0.016, inner: 0.074, length: 0.2, axis: "z" }, position: [mx, 0.42, -0.13] },
    { id: `${key}-rotor`, name: `${cap(key)} motor rotor`, assembly: asm, category: "motor", material: "steel",
      shape: { kind: "cylinder", radius: 0.068, length: 0.34, axis: "z", segments: 40 }, position: [mx, 0.42, -0.13] },
    { id: `${key}-motor-end-cover`, name: `${cap(key)} motor end cover`, assembly: asm, category: "motor", material: "cast",
      shape: { kind: "cylinder", radius: r, length: 0.025, axis: "z", segments: 48 }, position: [mx, 0.42, -0.295] },
    { id: `${key}-rotor-shaft`, name: `${cap(key)} rotor shaft`, assembly: asm, category: "motor", material: "steel",
      shape: { kind: "cylinder", radius: 0.018, length: 0.5, axis: "z" }, position: [mx, 0.42, -0.13] },
    ...[1, 2].map((n): Part => ({
      id: `${key}-motor-bearing-${n}`, name: `${cap(key)} motor bearing ${n}`, assembly: asm, category: "motor", material: "steel",
      shape: { kind: "ring", radius: 0.036, inner: 0.018, length: 0.02, axis: "z" }, position: [mx, 0.42, -0.13 + (n === 1 ? -0.18 : 0.18)],
    })),
    { id: `${key}-reduction-gear`, name: `${cap(key)} reduction gear`, assembly: asm, category: "gearbox", material: "steel",
      shape: { kind: "gear", radius: 0.1, teeth: 36, thickness: 0.035 }, position: [x - 0.04, 0.38, 0.12] },
    { id: `${key}-pinion`, name: `${cap(key)} pinion gear`, assembly: asm, category: "gearbox", material: "steel",
      shape: { kind: "gear", radius: 0.045, teeth: 16, thickness: 0.05 }, position: [x + 0.09, 0.42, 0.12] },
    { id: `${key}-differential`, name: `${cap(key)} differential`, assembly: asm, category: "gearbox", material: "cast",
      shape: { kind: "ring", radius: 0.07, inner: 0.025, length: 0.07, axis: "z" }, position: [x - 0.04, 0.38, 0.04] },
    { id: `${key}-gate-driver`, name: `${cap(key)} inverter gate-driver board`, assembly: asm, category: "inverter", material: "pcb",
      shape: { kind: "box", size: [0.2, 0.012, 0.28], radius: 0.003 }, position: [x - d * 0.02, 0.645, -0.05] },
    { id: `${key}-inverter-busbars`, name: `${cap(key)} inverter busbars`, assembly: asm, category: "inverter", material: "copper",
      shape: { kind: "box", size: [0.16, 0.006, 0.3], radius: 0.002 }, position: [x - d * 0.02, 0.575, -0.05] },
    { id: `${key}-gearbox-cover`, name: `${cap(key)} gearbox cover`, assembly: asm, category: "gearbox", material: "aluminium",
      shape: { kind: "box", size: [0.3, 0.28, 0.02], radius: 0.008 }, position: [x, 0.4, 0.22] },
    { id: `${key}-inverter-lid`, name: `${cap(key)} inverter lid`, assembly: asm, category: "inverter", material: "aluminium",
      shape: { kind: "box", size: [0.34, 0.012, 0.42], radius: 0.005 }, position: [x - d * 0.02, 0.68, -0.05] },
    { id: `${key}-power-module`, name: `${cap(key)} inverter power module`, assembly: asm, category: "inverter", material: "pcb",
      shape: { kind: "box", size: [0.22, 0.02, 0.3], radius: 0.004 }, position: [x - d * 0.02, 0.6, -0.05] },
    { id: `${key}-dc-link-capacitor`, name: `${cap(key)} DC-link capacitor`, assembly: asm, category: "inverter", material: "satin-black",
      shape: { kind: "box", size: [0.1, 0.06, 0.18], radius: 0.01 }, position: [x - d * 0.1, 0.6, 0.1] },
  ];
};

const thermal: Part[] = [
  { id: "radiator", name: "Front heat exchanger", assembly: "thermal", category: "thermal", material: "aluminium",
    shape: { kind: "slats", size: [0.04, 0.36, 0.9], count: 46 }, position: [2.2, 0.64, 0] },
  ...SIDES.map((s): Part => ({
    id: `cooling-fan-${s.key}`, name: `${cap(s.word)} cooling fan`, assembly: "thermal", category: "thermal", material: "satin-black",
    shape: { kind: "fan", radius: 0.16 }, position: [2.12, 0.64, s.z * 0.22],
  })),
  { id: "coolant-pump", name: "Coolant pump", assembly: "thermal", category: "thermal", material: "cast",
    shape: { kind: "cylinder", radius: 0.04, length: 0.1, axis: "y" }, position: [1.75, 0.5, -0.25] },
  { id: "battery-chiller", name: "Battery chiller", assembly: "thermal", category: "thermal", material: "aluminium",
    shape: { kind: "box", size: [0.14, 0.08, 0.1], radius: 0.01 }, position: [1.85, 0.46, -0.12] },
  { id: "heat-pump-compressor", name: "Heat-pump compressor", assembly: "thermal", category: "thermal", material: "cast",
    shape: { kind: "cylinder", radius: 0.06, length: 0.16, axis: "x" }, position: [1.8, 0.47, 0.18] },
  { id: "hvac-module", name: "Cabin climate module", assembly: "thermal", category: "thermal", material: "satin-black",
    shape: { kind: "box", size: [0.22, 0.2, 0.5], radius: 0.03 }, position: [0.72, 0.62, -0.1] },
  { id: "coolant-lines", name: "Battery coolant lines", assembly: "thermal", category: "thermal", material: "satin-black",
    ...absTube([[2.12, 0.5, -0.3], [1.8, 0.44, -0.32], [1.3, 0.33, -0.3], [1.0, 0.28, -0.24]], 0.013) },
];

const cabin: Part[] = [
  { id: "centre-console", name: "Centre console", assembly: "interior", category: "interior", material: "satin-black",
    shape: { kind: "box", size: [0.62, 0.18, 0.22], radius: 0.04 }, position: [0.1, 0.5, 0] },
  { id: "driver-display", name: "Driver display", assembly: "interior", category: "interior", material: "gloss-black",
    shape: { kind: "box", size: [0.025, 0.11, 0.3], radius: 0.008 }, position: [0.68, 1.04, DRIVER_Z], rotation: [0, 0, -0.2] },
  { id: "centre-display", name: "Centre touchscreen", assembly: "interior", category: "interior", material: "gloss-black",
    shape: { kind: "box", size: [0.025, 0.2, 0.32], radius: 0.008 }, position: [0.8, 1.02, 0], rotation: [0, 0, -0.25] },
  { id: "headliner", name: "Headliner", assembly: "interior", category: "interior", material: "fabric",
    shape: { kind: "box", size: [2.0, 0.01, 1.22], radius: 0.004 }, position: [-0.75, 1.52, 0] },
];

export const PARTS: Part[] = [
  ...body,
  ...structure,
  ...corners,
  ...suspension,
  ...steering,
  ...brakeControl,
  ...driveUnit("front", FRONT_AXLE_X, "front-drive-unit"),
  ...driveUnit("rear", REAR_AXLE_X, "rear-drive-unit"),
  ...battery,
  ...power,
  ...sensors,
  ...electronics,
  ...interior,
  ...bodyFrame,
  ...floor,
  ...doorLayers,
  ...wheelDetail,
  ...upperArms,
  ...driveUnitDetail("front", FRONT_AXLE_X, "front-drive-unit"),
  ...driveUnitDetail("rear", REAR_AXLE_X, "rear-drive-unit"),
  ...thermal,
  ...cabin,
];

export const ASSEMBLY_BY_ID = new Map(ASSEMBLIES.map((a) => [a.id, a]));
export const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));
