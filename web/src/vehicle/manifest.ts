// The component manifest: every physical part of the vehicle, with a stable id, a name,
// the assembly it belongs to, its shape, its assembled position and its material.
//
// This is the single place the 3D scene learns what exists. The TypeDB dataset (Phase 3) is
// checked against these ids, so a part can't appear in one and silently be missing from the other.
// Ids never change once published; names can.

import type { PanelId } from "./body";
import { AXLE_Y, DRIVER_Z, FRONT_AXLE_X, REAR_AXLE_X, TRACK_HALF } from "./dimensions";
import type { Shape, Vec3 } from "./shapes";

export type MaterialId =
  | "paint" | "glass" | "roof-glass" | "gloss-black" | "satin-black" | "rubber" | "alloy" | "iron" | "caliper"
  | "aluminium" | "cast" | "hv-orange" | "electronics" | "lamp" | "tail-lamp" | "leather" | "battery" | "steel";

/** What kind of thing a part is. Phase 3 maps each category onto a TypeDB entity type. */
export type Category =
  | "body-panel" | "glazing" | "lighting" | "structure" | "wheel" | "tyre" | "brake" | "suspension" | "steering"
  | "motor" | "gearbox" | "inverter" | "drive-shaft" | "battery" | "power-electronics" | "harness"
  | "camera" | "radar" | "lidar" | "gnss" | "wheel-speed-sensor" | "controller" | "compute" | "actuator"
  | "interior" | "trim";

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
  /** Assembled position (vehicle coordinates). Body panels take theirs from the body surface. */
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
  panel("windscreen", "Windscreen", "greenhouse", "glazing", "glass"),
  panel("roof", "Panoramic roof", "greenhouse", "glazing", "roof-glass"),
  ...SIDES.map((s): Part => panel(`body-side-${s.key}` as PanelId, `${cap(s.word)} body side`, "greenhouse", "body-panel", "paint")),
  ...SIDES.map((s): Part => panel(`rocker-${s.key}` as PanelId, `${cap(s.word)} sill trim`, "greenhouse", "trim", "gloss-black")),
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
      { id: `coilover-${c.key}`, name: `${cap(c.word)} spring and damper`, assembly: asm, category: "suspension", material: "steel",
        shape: { kind: "coilover", length: 0.44 }, position: [c.x - 0.05, 0.72, c.z * 0.6], rotation: [c.z * 0.12, 0, 0] },
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
  ...[-0.72, -0.24, 0.24, 0.72].flatMap((x, i) =>
    SIDES.map((s, j): Part => ({
      id: `battery-module-${i * 2 + j + 1}`, name: `Battery module ${i * 2 + j + 1}`, assembly: "hv-battery", category: "battery",
      material: "battery", shape: { kind: "battery-module" }, position: [x - 0.02, 0.31, s.z * 0.33],
    })),
  ),
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
    shape: { kind: "tube", radius: 0.012, points: [[1.95, 0.6, -0.3], [1.3, 0.75, -0.6], [0.6, 0.55, -0.68], [-0.4, 0.42, -0.68], [-1.2, 0.44, -0.66], [-1.9, 0.62, -0.5]] },
    position: [0, 0, 0] },
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
  ...SIDES.map((s): Part => ({
    id: `seat-front-${s.key}`, name: `Front ${s.word} seat`, assembly: "interior", category: "interior", material: "leather",
    shape: { kind: "seat", width: 0.52 }, position: [0.02, 0.55, s.z * DRIVER_Z],
  })),
  { id: "seat-rear", name: "Rear bench seat", assembly: "interior", category: "interior", material: "leather",
    shape: { kind: "seat", width: 1.3 }, position: [-0.95, 0.58, 0] },
  { id: "dashboard", name: "Dashboard", assembly: "interior", category: "interior", material: "satin-black",
    shape: { kind: "box", size: [0.36, 0.2, 1.46], radius: 0.06 }, position: [0.74, 0.88, 0] },
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
];

export const ASSEMBLY_BY_ID = new Map(ASSEMBLIES.map((a) => [a.id, a]));
export const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));
