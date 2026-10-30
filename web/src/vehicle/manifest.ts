// The visual manifest: how each component is drawn. For every stable component id: its shape, its
// assembled position and its rendering material. Nothing about what a component is or how it relates to
// others: names, types, assemblies, systems and relationships live only in TypeDB
// (data/seed/ -> TypeDB -> the semantic API; docs/decisions/0001-typedb-sole-database.md).
//
// Tests keep the ids identical to TypeDB's. Ids never change once published.

import { bodyLines, type PanelId } from "./body";
import { AXLE_Y, DRIVER_Z, FRONT_AXLE_X, REAR_AXLE_X, TRACK_HALF } from "./dimensions";
import type { Shape, Vec3 } from "./shapes";

export type MaterialId =
  | "paint" | "glass" | "roof-glass" | "gloss-black" | "satin-black" | "rubber" | "alloy" | "iron" | "caliper"
  | "aluminium" | "cast" | "hv-orange" | "electronics" | "lamp" | "tail-lamp" | "leather" | "battery" | "steel"
  | "copper" | "pcb" | "fabric";

export interface Part {
  id: string;
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

// ---- Helpers for parts that come in left/right pairs or four corners ----------------------------------

type Side = { key: "l" | "r"; z: 1 | -1 };
const SIDES: Side[] = [
  { key: "l", z: -1 },
  { key: "r", z: 1 },
];
type Corner = { key: "fl" | "fr" | "rl" | "rr"; x: number; z: 1 | -1; front: boolean };
const CORNERS: Corner[] = [
  { key: "fl", x: FRONT_AXLE_X, z: -1, front: true },
  { key: "fr", x: FRONT_AXLE_X, z: 1, front: true },
  { key: "rl", x: REAR_AXLE_X, z: -1, front: false },
  { key: "rr", x: REAR_AXLE_X, z: 1, front: false },
];
/** A tube given by absolute points: the part's position becomes the points' centre. */
const absTube = (points: Vec3[], radius: number): Pick<Part, "shape" | "position"> => {
  const c: Vec3 = [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length) as Vec3;
  return { position: c, shape: { kind: "tube", radius, points: points.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]] as Vec3) } };
};
const mid = (a: Vec3, b: Vec3, lift = 0): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, (a[2] + b[2]) / 2];
const panel = (id: PanelId, material: MaterialId): Part => ({ id, material, shape: { kind: "panel" } });

// ---- Parts --------------------------------------------------------------------------------------------

const body: Part[] = [
  panel("bonnet", "paint"),
  panel("front-bumper", "paint"),
  { id: "grille", material: "gloss-black",
    shape: { kind: "box", size: [0.04, 0.13, 1.02], radius: 0.03 }, position: [-0.012, 0.53, 0], attach: "front" },
  ...SIDES.map((s): Part => panel(`fender-${s.key}` as PanelId, "paint")),
  ...SIDES.map((s): Part => ({
    id: `headlamp-${s.key}`, material: "lamp",
    shape: { kind: "box", size: [0.05, 0.032, 0.42], radius: 0.014 }, position: [-0.012, 0.8, s.z * 0.46], rotation: [0, s.z * 0.3, 0], attach: "front",
  })),
  ...SIDES.map((s): Part => ({
    id: `headlamp-lens-${s.key}`, material: "glass",
    shape: { kind: "box", size: [0.012, 0.045, 0.44], radius: 0.004 }, position: [0.006, 0.8, s.z * 0.46], rotation: [0, s.z * 0.3, 0], attach: "front",
  })),
  { id: "bonnet-inner", material: "aluminium",
    shape: { kind: "panel-inner", of: "bonnet" }, position: [0, -0.03, 0] },
  { id: "tailgate-inner", material: "aluminium",
    shape: { kind: "panel-inner", of: "tailgate" }, position: [0.035, 0, 0] },
  panel("windscreen", "glass"),
  panel("roof", "roof-glass"),
  ...SIDES.map((s): Part => panel(`body-side-${s.key}` as PanelId, "paint")),
  ...SIDES.map((s): Part => panel(`rocker-${s.key}` as PanelId, "gloss-black")),
  panel("tailgate", "paint"),
  panel("tailgate-glass", "glass"),
  panel("rear-bumper", "paint"),
  panel("rear-diffuser", "gloss-black"),
  ...SIDES.map((s): Part => panel(`quarter-${s.key}` as PanelId, "paint")),
  ...SIDES.map((s): Part => panel(`quarter-glass-${s.key}` as PanelId, "glass")),
  ...SIDES.map((s): Part => ({
    id: `tail-lamp-${s.key}`, material: "tail-lamp",
    shape: { kind: "box", size: [0.06, 0.05, 0.36], radius: 0.018 }, position: [-0.014, 1.04, s.z * 0.55], rotation: [0, -s.z * 0.32, 0], attach: "rear",
  })),
  ...CORNERS.map((c): Part => panel(`door-${c.key}` as PanelId, "paint")),
  ...CORNERS.map((c): Part => panel(`glass-${c.key}` as PanelId, "glass")),
  ...SIDES.map((s): Part => ({
    id: `mirror-${s.key}`, material: "gloss-black",
    shape: { kind: "mirror" }, position: [0.7, 1.22, s.z * 1.04], rotation: [0, s.z > 0 ? 0 : Math.PI, 0],
  })),
];

const structure: Part[] = [
  panel("underbody", "satin-black"),
  ...CORNERS.map((c): Part => ({
    id: `arch-liner-${c.key}`, material: "satin-black",
    shape: { kind: "arch-liner" }, position: [c.x, AXLE_Y, c.z * 0.79],
  })),
  ...SIDES.map((s): Part => ({
    id: `sill-${s.key}`, material: "aluminium",
    shape: { kind: "box", size: [3.0, 0.11, 0.09], radius: 0.02 }, position: [-0.02, 0.4, s.z * 0.76],
  })),
  ...SIDES.map((s): Part => ({
    id: `front-rail-${s.key}`, material: "aluminium",
    shape: { kind: "box", size: [1.1, 0.1, 0.07], radius: 0.015 }, position: [1.78, 0.56, s.z * 0.5],
  })),
  ...SIDES.map((s): Part => ({
    id: `rear-rail-${s.key}`, material: "aluminium",
    shape: { kind: "box", size: [1.0, 0.1, 0.07], radius: 0.015 }, position: [-1.86, 0.56, s.z * 0.55],
  })),
  { id: "front-crash-beam", material: "aluminium",
    shape: { kind: "tube", radius: 0.035, points: [[-0.06, 0, -0.78], [0.02, 0, -0.4], [0.04, 0, 0], [0.02, 0, 0.4], [-0.06, 0, 0.78]] },
    position: [2.34, 0.52, 0] },
  { id: "rear-crash-beam", material: "aluminium",
    shape: { kind: "tube", radius: 0.035, points: [[0.06, 0, -0.78], [-0.02, 0, -0.4], [-0.04, 0, 0], [-0.02, 0, 0.4], [0.06, 0, 0.78]] },
    position: [-2.38, 0.56, 0] },
  { id: "bulkhead", material: "aluminium",
    shape: { kind: "box", size: [0.02, 0.48, 1.42], radius: 0.008 }, position: [1.04, 0.66, 0], rotation: [0, 0, 0.12] },
];

const corners: Part[] = CORNERS.flatMap((c): Part[] => {
  const flip: Vec3 = [0, c.z > 0 ? 0 : Math.PI, 0]; // wheel faces outwards on both sides
  const caliperAngle = c.front ? 2.2 : 2.3; // behind and above the axle
  const discR = c.front ? 0.19 : 0.175;
  return [
    { id: `tyre-${c.key}`, material: "rubber",
      shape: { kind: "tyre" }, position: [c.x, AXLE_Y, c.z * TRACK_HALF], rotation: flip },
    { id: `wheel-${c.key}`, material: "alloy",
      shape: { kind: "rim" }, position: [c.x, AXLE_Y, c.z * TRACK_HALF], rotation: flip },
    { id: `brake-disc-${c.key}`, material: "iron",
      shape: { kind: "disc", radius: discR }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.08)], rotation: flip },
    { id: `caliper-${c.key}`, material: "caliper",
      shape: { kind: "caliper" },
      position: [c.x + Math.cos(caliperAngle) * (discR - 0.03), AXLE_Y + Math.sin(caliperAngle) * (discR - 0.03), c.z * (TRACK_HALF - 0.08)],
      rotation: [0, c.z > 0 ? 0 : Math.PI, caliperAngle - Math.PI / 2] },
    { id: `knuckle-${c.key}`, material: "cast",
      shape: { kind: "box", size: [0.09, 0.3, 0.06], radius: 0.02 }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.15)] },
    { id: `wheel-speed-sensor-${c.key}`, material: "electronics", shape: { kind: "cylinder", radius: 0.012, length: 0.06, axis: "z" },
      position: [c.x + 0.07, AXLE_Y - 0.07, c.z * (TRACK_HALF - 0.17)] },
  ];
});

const suspension: Part[] = [
  ...CORNERS.flatMap((c): Part[] => {
    return [
      { id: `lower-arm-${c.key}`, material: "aluminium",
        shape: { kind: "arm", inner: [[0.17, 0, 0], [-0.17, 0, 0]], outer: [0, -0.02, c.z * 0.26] },
        position: [c.x, 0.24, c.z * 0.4] },
      { id: `coilover-${c.key}`, material: "steel",
        shape: { kind: "damper", length: 0.44 }, position: [c.x - 0.05, 0.72, c.z * 0.6], rotation: [c.z * 0.12, 0, 0] },
      { id: `spring-${c.key}`, material: "alloy",
        shape: { kind: "spring", length: 0.44 }, position: [c.x - 0.05, 0.72, c.z * 0.6], rotation: [c.z * 0.12, 0, 0] },
      { id: `top-mount-${c.key}`, material: "cast",
        shape: { kind: "cylinder", radius: 0.065, length: 0.035, axis: "y" }, position: [c.x - 0.05, 0.96, c.z * 0.575], rotation: [c.z * 0.12, 0, 0] },
    ];
  }),
  { id: "front-subframe", material: "cast",
    shape: { kind: "box", size: [0.5, 0.06, 0.9], radius: 0.02 }, position: [FRONT_AXLE_X, 0.22, 0] },
  { id: "rear-subframe", material: "cast",
    shape: { kind: "box", size: [0.5, 0.06, 0.9], radius: 0.02 }, position: [REAR_AXLE_X, 0.22, 0] },
  { id: "front-anti-roll-bar", material: "steel",
    shape: { kind: "tube", radius: 0.012, points: [[0.12, 0.06, -0.62], [-0.02, 0, -0.5], [-0.04, 0, 0], [-0.02, 0, 0.5], [0.12, 0.06, 0.62]] },
    position: [FRONT_AXLE_X - 0.2, 0.3, 0] },
];

const steering: Part[] = [
  { id: "steering-rack", material: "aluminium",
    shape: { kind: "cylinder", radius: 0.03, length: 0.9, axis: "z" }, position: [FRONT_AXLE_X - 0.2, 0.4, 0] },
  { id: "eps-motor", material: "cast",
    shape: { kind: "cylinder", radius: 0.055, length: 0.16, axis: "x" }, position: [FRONT_AXLE_X - 0.31, 0.42, 0.18] },
  { id: "steering-ecu", material: "electronics",
    shape: { kind: "finned-box", size: [0.1, 0.06, 0.14], fins: 5 }, position: [FRONT_AXLE_X - 0.31, 0.51, 0.32] },
  { id: "steering-column", material: "steel",
    shape: { kind: "tube", radius: 0.02, points: [[0, 0, 0], [-0.22, 0.24, 0], [-0.55, 0.47, 0]] },
    position: [FRONT_AXLE_X - 0.24, 0.44, DRIVER_Z] },
  { id: "steering-wheel", material: "leather",
    shape: { kind: "steering-wheel" }, position: [0.6, 0.97, DRIVER_Z], rotation: [0, 0, -0.42] },
];

const brakeControl: Part[] = [
  { id: "brake-booster", material: "cast",
    shape: { kind: "cylinder", radius: 0.085, length: 0.16, axis: "x" }, position: [1.14, 0.84, DRIVER_Z] },
  { id: "esc-module", material: "aluminium",
    shape: { kind: "box", size: [0.15, 0.12, 0.14], radius: 0.02 }, position: [1.84, 0.7, 0.05] },
  { id: "master-cylinder", material: "aluminium",
    shape: { kind: "cylinder", radius: 0.03, length: 0.17, axis: "x" }, position: [1.3, 0.86, DRIVER_Z] },
  { id: "brake-pedal", material: "satin-black",
    shape: { kind: "box", size: [0.03, 0.09, 0.07], radius: 0.01 }, position: [0.86, 0.42, DRIVER_Z], rotation: [0, 0, 0.35] },
];

// Drive units: three parallel shafts along z (docs/engineering-references.md). The motor's axis is above the
// wheel axis on the left, the two-stage gear train in a split case on the right, the inverter on top.
// The Blender models (blender/drive_unit.py) use the same layout; these simple shapes are the fallback.
type DriveKey = "front" | "rear";
const DRIVE = {
  front: { motor: [-0.03, 0.593], inter: [0.0186, 0.5167], housingR: 0.13, statorR: 0.112, rotorR: 0.068, stack: [-0.215, -0.045], housing: [-0.27, 0.03] },
  rear: { motor: [-0.1, 0.567], inter: [-0.087, 0.4775], housingR: 0.145, statorR: 0.125, rotorR: 0.078, stack: [-0.25, -0.04], housing: [-0.285, 0.03] },
} as const;
/** Positions within a drive unit: axle x plus an offset; "motor" / "inter" / "wheel" shafts. */
const duAt = (key: DriveKey, x: number, shaft: "motor" | "inter" | "wheel", z: number, dy = 0): Vec3 => {
  const [ox, y] = shaft === "wheel" ? [0, AXLE_Y] : DRIVE[key][shaft];
  return [x + ox, y + dy, z];
};

const driveUnit = (key: DriveKey, x: number): Part[] => {
  const u = DRIVE[key];
  const [h0, h1] = u.housing;
  const top = u.motor[1] + u.housingR + 0.01;
  return [
    { id: `${key}-motor`, material: "cast",
      shape: { kind: "ring", radius: u.housingR, inner: u.statorR, length: h1 - h0, axis: "z" }, position: duAt(key, x, "motor", (h0 + h1) / 2) },
    { id: `${key}-gearbox`, material: "aluminium",
      shape: { kind: "box", size: [0.3, 0.34, 0.095], radius: 0.04 }, position: [x - 0.02, 0.47, 0.0775] },
    { id: `${key}-inverter`, material: "electronics",
      shape: { kind: "box", size: [0.3, 0.075, 0.4], radius: 0.01 }, position: [x + u.motor[0], top + 0.0375, -0.06] },
    ...SIDES.map((s): Part => ({
      id: `${key}-halfshaft-${s.key}`, material: "steel",
      shape: { kind: "cylinder", radius: 0.022, length: 0.6, axis: "z" }, position: [x, AXLE_Y, s.z * 0.44],
    })),
  ];
};

const battery: Part[] = [
  { id: "battery-enclosure", material: "aluminium",
    shape: { kind: "box", size: [2.0, 0.1, 1.36], radius: 0.03 }, position: [-0.02, 0.25, 0] },
  { id: "battery-lid", material: "satin-black",
    shape: { kind: "box", size: [1.98, 0.012, 1.34], radius: 0.005 }, position: [-0.02, 0.37, 0] },
  { id: "battery-cooling-plate", material: "aluminium",
    shape: { kind: "box", size: [1.9, 0.008, 1.28], radius: 0.003 }, position: [-0.02, 0.256, 0] },
  ...Array.from({ length: 8 }, (_, i) => -0.84 + i * 0.24).flatMap((x, i) =>
    SIDES.map((s, j): Part => ({
      id: `battery-module-${i * 2 + j + 1}`, material: "battery", shape: { kind: "battery-module" }, position: [x - 0.02, 0.31, s.z * 0.33],
    })),
  ),
  ...SIDES.map((s): Part => ({
    id: `battery-busbar-${s.key}`, material: "copper",
    shape: { kind: "box", size: [1.86, 0.008, 0.03], radius: 0.003 }, position: [-0.02, 0.375, s.z * 0.33 + 0.06],
  })),
  ...[-0.5, -0.02, 0.46].map((x, i): Part => ({
    id: `battery-crossmember-${i + 1}`, material: "aluminium",
    shape: { kind: "box", size: [0.025, 0.09, 1.28], radius: 0.006 }, position: [x, 0.3, 0],
  })),
  ...SIDES.map((s): Part => ({
    id: `battery-side-rail-${s.key}`, material: "aluminium",
    shape: { kind: "box", size: [1.96, 0.11, 0.04], radius: 0.01 }, position: [-0.02, 0.27, s.z * 0.67],
  })),
  { id: "battery-coolant-manifold", material: "aluminium",
    ...absTube([[-0.92, 0.27, 0], [0, 0.27, 0], [0.92, 0.27, 0]], 0.016) },
  { id: "hv-junction-box", material: "electronics",
    shape: { kind: "box", size: [0.16, 0.08, 0.22], radius: 0.012 }, position: [1.07, 0.31, -0.3] },
  { id: "bms", material: "electronics",
    shape: { kind: "box", size: [0.14, 0.05, 0.24], radius: 0.01 }, position: [1.08, 0.3, 0.36] },
];

const power: Part[] = [
  { id: "lv-battery", material: "satin-black",
    shape: { kind: "box", size: [0.24, 0.18, 0.17], radius: 0.015 }, position: [1.95, 0.66, -0.42] },
  { id: "pdu", material: "electronics",
    shape: { kind: "box", size: [0.2, 0.12, 0.22], radius: 0.015 }, position: [1.95, 0.66, 0.4] },
  { id: "dc-dc", material: "electronics",
    shape: { kind: "finned-box", size: [0.22, 0.08, 0.2], fins: 6 }, position: [-1.18, 0.44, -0.42] },
  { id: "obc", material: "electronics",
    shape: { kind: "finned-box", size: [0.3, 0.1, 0.26], fins: 8 }, position: [-1.9, 0.6, -0.33] },
  { id: "hv-harness-front", material: "hv-orange",
    shape: { kind: "tube", radius: 0.014, points: [[0, 0, 0], [0.18, 0.04, -0.2], [0.3, 0.3, -0.33], [0.38, 0.453, -0.35]] }, // ends at the front inverter's HV connector
    position: [0.98, 0.32, 0.18] },
  { id: "hv-harness-rear", material: "hv-orange",
    shape: { kind: "tube", radius: 0.014, points: [[0, 0, 0], [-0.3, 0, -0.15], [-0.34, 0.25, -0.3], [-0.34, 0.442, -0.35]] }, // ends at the rear inverter's HV connector
    position: [-1.02, 0.32, 0.18] },
  { id: "lv-harness", material: "satin-black",
    ...absTube([[1.95, 0.6, -0.3], [1.3, 0.75, -0.6], [0.6, 0.55, -0.68], [-0.4, 0.42, -0.68], [-1.2, 0.44, -0.66], [-1.9, 0.62, -0.5]], 0.012) },
];

const sensors: Part[] = [
  { id: "front-camera", material: "electronics",
    shape: { kind: "box", size: [0.07, 0.05, 0.16], radius: 0.012 }, position: [0.42, 1.43, 0] },
  { id: "rear-camera", material: "electronics",
    shape: { kind: "cylinder", radius: 0.018, length: 0.04, axis: "x" }, position: [-0.008, 0.96, 0], attach: "rear" },
  ...SIDES.map((s): Part => ({
    id: `side-camera-${s.key}`, material: "electronics",
    shape: { kind: "cylinder", radius: 0.014, length: 0.03, axis: "y" }, position: [0.7, 1.15, s.z * 1.08],
  })),
  { id: "front-radar", material: "electronics",
    shape: { kind: "box", size: [0.035, 0.11, 0.13], radius: 0.01 }, position: [-0.04, 0.53, 0], attach: "front" },
  ...CORNERS.map((c): Part => ({
    id: `corner-radar-${c.key}`, material: "electronics",
    shape: { kind: "box", size: [0.03, 0.09, 0.1], radius: 0.01 },
    position: [c.front ? 2.18 : -2.22, 0.64, c.z * 0.7], rotation: [0, c.front ? -c.z * 0.75 : c.z * 0.75, 0],
  })),
  { id: "lidar", material: "electronics",
    shape: { kind: "lidar" }, position: [0.18, 1.71, 0] },
  { id: "gnss-antenna", material: "paint",
    shape: { kind: "shark-fin" }, position: [-1.6, 1.68, 0] },
];

const electronics: Part[] = [
  { id: "ad-compute", material: "electronics",
    shape: { kind: "finned-box", size: [0.32, 0.08, 0.26], fins: 10 }, position: [-1.92, 0.6, 0.33] },
  { id: "vcu", material: "electronics",
    shape: { kind: "box", size: [0.16, 0.05, 0.2], radius: 0.01 }, position: [0.86, 0.72, 0.05] },
  { id: "bcm", material: "electronics",
    shape: { kind: "box", size: [0.14, 0.05, 0.18], radius: 0.01 }, position: [0.8, 0.68, -0.55] },
  { id: "gateway", material: "electronics",
    shape: { kind: "box", size: [0.14, 0.04, 0.16], radius: 0.01 }, position: [0.22, 0.45, 0] },
  { id: "telematics", material: "electronics",
    shape: { kind: "box", size: [0.12, 0.03, 0.16], radius: 0.008 }, position: [-0.45, 1.55, 0] },
];

const interior: Part[] = [
  ...SIDES.flatMap((s): Part[] => {
    const at: Vec3 = [0.02, 0.55, s.z * DRIVER_Z];
    const seat = { position: at };
    return [
      { ...seat, id: `seat-front-${s.key}`, material: "leather", shape: { kind: "seat", width: 0.52, piece: "cushion" } },
      { ...seat, id: `seat-back-front-${s.key}`, material: "leather", shape: { kind: "seat", width: 0.52, piece: "back" } },
      { ...seat, id: `headrest-front-${s.key}`, material: "leather", shape: { kind: "seat", width: 0.52, piece: "headrest" } },
      { ...seat, id: `seat-frame-front-${s.key}`, material: "steel", shape: { kind: "seat", width: 0.52, piece: "frame" } },
    ];
  }),
  { id: "seat-rear", material: "leather",
    shape: { kind: "seat", width: 1.3, piece: "cushion" }, position: [-0.95, 0.58, 0] },
  { id: "seat-back-rear", material: "leather",
    shape: { kind: "seat", width: 1.3, piece: "back" }, position: [-0.95, 0.58, 0] },
  { id: "seat-frame-rear", material: "steel",
    shape: { kind: "seat", width: 1.3, piece: "frame" }, position: [-0.95, 0.58, 0] },
  ...SIDES.map((s): Part => ({
    id: `headrest-rear-${s.key}`, material: "leather",
    shape: { kind: "seat", width: 0.52, piece: "headrest" }, position: [-0.95, 0.58, s.z * 0.38],
  })),
  { id: "dashboard", material: "satin-black",
    shape: { kind: "box", size: [0.36, 0.2, 1.46], radius: 0.06 }, position: [0.74, 0.88, 0] },
];

// ---- Detail layers: what makes the exploded view read as an engineering assembly -----------------

const { topLine: T, beltLine: B, halfWidth: W, roofHalfWidth: RW, bottomLine: Y } = bodyLines;
const roofPt = (x: number, z: 1 | -1): Vec3 => [x, T(x) - 0.075, z * (RW(x) - 0.01)];
const beltPt = (x: number, z: 1 | -1): Vec3 => [x, B(x) - 0.02, z * (W(x) - 0.11)];
const sillPt = (x: number, z: 1 | -1): Vec3 => [x, Y(x) + 0.12, z * (W(x) - 0.08)];
const frameTube = (id: string, points: Vec3[], radius = 0.026): Part => ({
  id, material: "aluminium", ...absTube(points, radius),
});

const bodyFrame: Part[] = [
  ...SIDES.flatMap((s): Part[] => [
    frameTube(`a-pillar-${s.key}`, [beltPt(0.9, s.z), mid(beltPt(0.9, s.z), roofPt(0.2, s.z), 0.04), roofPt(0.2, s.z)]),
    frameTube(`b-pillar-${s.key}`, [sillPt(-0.1, s.z), beltPt(-0.1, s.z), roofPt(-0.1, s.z)], 0.03),
    frameTube(`c-pillar-${s.key}`, [beltPt(-1.27, s.z), roofPt(-1.27, s.z)]),
    frameTube(`d-pillar-${s.key}`, [beltPt(-2.1, s.z), mid(beltPt(-2.1, s.z), roofPt(-1.95, s.z)), roofPt(-1.95, s.z)]),
    frameTube(`roof-rail-${s.key}`, [0.2, -0.4, -1.0, -1.6, -1.95].map((x) => roofPt(x, s.z)), 0.024),
  ]),
  ...([[0.2, "front-header"], [-0.55, "roof-bow-1"], [-1.25, "roof-bow-2"], [-1.95, "rear-header"]] as const).map(([x, id]) =>
    frameTube(id, [roofPt(x, -1), [x, T(x) - 0.06, 0], roofPt(x, 1)], 0.02)),
  frameTube("cross-car-beam", [[0.8, 0.9, -0.78], [0.8, 0.94, 0], [0.8, 0.9, 0.78]], 0.032),
];

const floor: Part[] = [
  { id: "cabin-floor", material: "satin-black",
    shape: { kind: "box", size: [2.3, 0.012, 1.42], radius: 0.004 }, position: [-0.15, 0.39, 0] },
  ...([[0.45, 1], [-0.55, 2]] as const).map(([x, n]): Part => ({
    id: `floor-crossmember-${n}`, material: "aluminium",
    shape: { kind: "box", size: [0.08, 0.06, 1.42], radius: 0.012 }, position: [x, 0.43, 0],
  })),
];

const doorLayers: Part[] = CORNERS.flatMap((c): Part[] => {
  const cx = c.front ? 0.4 : -0.63;
  const len = c.front ? 1.0 : 1.06;
  const w = W(cx);
  return [
    { id: `door-structure-${c.key}`, material: "aluminium",
      shape: { kind: "box", size: [len * 0.92, 0.58, 0.03], radius: 0.012 }, position: [cx, 0.78, c.z * (w - 0.1)] },
    { id: `window-regulator-${c.key}`, material: "steel",
      shape: { kind: "regulator", height: 0.45 }, position: [cx, 0.86, c.z * (w - 0.14)] },
    { id: `door-speaker-${c.key}`, material: "satin-black",
      shape: { kind: "cylinder", radius: 0.075, length: 0.05, axis: "z" }, position: [cx + 0.28, 0.6, c.z * (w - 0.17)] },
    { id: `door-trim-${c.key}`, material: "leather",
      shape: { kind: "box", size: [len * 0.9, 0.56, 0.04], radius: 0.015 }, position: [cx, 0.8, c.z * (w - 0.21)] },
    { id: `door-handle-${c.key}`, material: "gloss-black",
      shape: { kind: "box", size: [0.15, 0.025, 0.03], radius: 0.01 }, position: [cx + 0.1, 1.0, c.z * (w + 0.0)] },
    { id: `door-latch-${c.key}`, material: "steel",
      shape: { kind: "box", size: [0.05, 0.09, 0.04], radius: 0.008 }, position: [cx - len / 2 + 0.05, 0.86, c.z * (w - 0.12)] },
    { id: `door-seal-${c.key}`, material: "rubber",
      ...absTube([[cx - len / 2 + 0.03, 0.5, 0], [cx + len / 2 - 0.03, 0.5, 0], [cx + len / 2 - 0.03, 1.12, 0], [cx - len / 2 + 0.03, 1.12, 0],
        [cx - len / 2 + 0.03, 0.5, 0]].map(([px, py]) => [px, py, c.z * (w - 0.075)] as Vec3), 0.009) },
  ];
});

const wheelDetail: Part[] = CORNERS.flatMap((c): Part[] => {
  const caliperAngle = c.front ? 2.2 : 2.3;
  const discR = c.front ? 0.19 : 0.175;
  return [
    { id: `hub-${c.key}`, material: "steel",
      shape: { kind: "ring", radius: 0.07, inner: 0.03, length: 0.06, axis: "z" }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.12)] },
    { id: `brake-shield-${c.key}`, material: "satin-black",
      shape: { kind: "cylinder", radius: discR + 0.012, length: 0.004, axis: "z", segments: 48 },
      position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.105)] },
    { id: `brake-hose-${c.key}`, material: "rubber",
      ...absTube([[c.x - 0.07, AXLE_Y + 0.34, c.z * (TRACK_HALF - 0.2)], [c.x - 0.04, AXLE_Y + 0.27, c.z * (TRACK_HALF - 0.12)],
        [c.x - 0.03, AXLE_Y + 0.21, c.z * (TRACK_HALF - 0.1)]], 0.006) },
    { id: `hub-nut-${c.key}`, material: "steel",
      shape: { kind: "cylinder", radius: 0.019, length: 0.016, axis: "z", segments: 6 }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF + 0.05)] },
    { id: `wheel-bearing-${c.key}`, material: "steel",
      shape: { kind: "ring", radius: 0.045, inner: 0.02, length: 0.04, axis: "z" }, position: [c.x, AXLE_Y, c.z * (TRACK_HALF - 0.12)] },
    ...(["inner", "outer"] as const).map((side, k): Part => ({
      id: `brake-pad-${side}-${c.key}`, material: "cast",
      shape: { kind: "box", size: [0.05, 0.12, 0.014], radius: 0.005 },
      position: [c.x + Math.cos(caliperAngle) * (discR - 0.03), AXLE_Y + Math.sin(caliperAngle) * (discR - 0.03),
        c.z * (TRACK_HALF - 0.08 + (k === 0 ? -0.028 : 0.028))],
      rotation: [0, 0, caliperAngle - Math.PI / 2],
    })),
    ...[1, 2, 3, 4, 5].map((n): Part => {
      const a = ((n - 1) / 5) * Math.PI * 2;
      return {
        id: `wheel-nut-${c.key}-${n}`, material: "steel",
        shape: { kind: "cylinder", radius: 0.011, length: 0.03, axis: "z", segments: 6 },
        position: [c.x + Math.cos(a) * 0.058, AXLE_Y + Math.sin(a) * 0.058, c.z * (TRACK_HALF + 0.09)],
      };
    }),
  ];
});

const upperArms: Part[] = [
  ...CORNERS.map((c): Part => ({
    id: `upper-arm-${c.key}`, material: "aluminium",
    shape: { kind: "arm", inner: [[0.12, 0, 0], [-0.12, 0, 0]], outer: [0, 0.02, c.z * 0.18] }, position: [c.x, 0.6, c.z * 0.46],
  })),
  ...CORNERS.map((c): Part => {
    const xe = c.front ? FRONT_AXLE_X - 0.08 : REAR_AXLE_X + 0.08;
    return { id: `drop-link-${c.key}`, material: "steel", ...absTube([[xe, 0.36, c.z * 0.62], [xe, 0.5, c.z * 0.62]], 0.008) };
  }),
  ...SIDES.map((s): Part => ({
    id: `toe-link-r${s.key}`, material: "steel",
    ...absTube([[REAR_AXLE_X + 0.2, 0.3, s.z * 0.4], [REAR_AXLE_X + 0.12, 0.32, s.z * 0.66]], 0.011),
  })),
  ...SIDES.map((s): Part => ({
    id: `tie-rod-f${s.key}`, material: "steel",
    ...absTube([[FRONT_AXLE_X - 0.2, 0.4, s.z * 0.45], [FRONT_AXLE_X - 0.12, 0.4, s.z * 0.68]], 0.012),
  })),
  { id: "rear-anti-roll-bar", material: "steel",
    shape: { kind: "tube", radius: 0.011, points: [[-0.12, 0.06, -0.62], [0.02, 0, -0.5], [0.04, 0, 0], [0.02, 0, 0.5], [-0.12, 0.06, 0.62]] },
    position: [REAR_AXLE_X + 0.2, 0.3, 0] },
];

const driveUnitDetail = (key: DriveKey, x: number): Part[] => {
  const u = DRIVE[key];
  const [s0, s1] = u.stack;
  const [h0] = u.housing;
  const top = u.motor[1] + u.housingR + 0.01;
  const mx = x + u.motor[0];
  const d = key === "front" ? 1 : -1;
  return [
    { id: `${key}-stator`, material: "copper",
      shape: { kind: "ring", radius: u.statorR, inner: u.rotorR + 0.001, length: s1 - s0 + 0.05, axis: "z" }, position: duAt(key, x, "motor", (s0 + s1) / 2) },
    { id: `${key}-rotor`, material: "steel",
      shape: { kind: "cylinder", radius: u.rotorR, length: s1 - s0, axis: "z", segments: 40 }, position: duAt(key, x, "motor", (s0 + s1) / 2) },
    { id: `${key}-motor-end-cover`, material: "cast",
      shape: { kind: "cylinder", radius: u.housingR, length: 0.03, axis: "z", segments: 48 }, position: duAt(key, x, "motor", h0 - 0.015) },
    { id: `${key}-rotor-shaft`, material: "steel",
      shape: { kind: "cylinder", radius: 0.02, length: 0.5, axis: "z" }, position: duAt(key, x, "motor", (h0 - 0.03 + 0.205) / 2) },
    ...[1, 2].map((n): Part => ({
      id: `${key}-motor-bearing-${n}`, material: "steel",
      shape: { kind: "ring", radius: n === 1 ? 0.042 : 0.047, inner: n === 1 ? 0.016 : 0.02, length: 0.015, axis: "z" },
      position: duAt(key, x, "motor", n === 1 ? h0 - 0.026 : 0.05),
    })),
    { id: `${key}-resolver`, material: "electronics",
      shape: { kind: "ring", radius: 0.045, inner: 0.022, length: 0.012, axis: "z" }, position: duAt(key, x, "motor", h0 - 0.012) },
    { id: `${key}-pinion`, material: "steel",
      shape: { kind: "gear", radius: 0.025, teeth: 21, thickness: 0.034 }, position: duAt(key, x, "motor", 0.165) },
    { id: `${key}-intermediate-gear`, material: "steel",
      shape: { kind: "gear", radius: 0.069, teeth: 61, thickness: 0.03 }, position: duAt(key, x, "inter", 0.165) },
    { id: `${key}-intermediate-shaft`, material: "steel",
      shape: { kind: "cylinder", radius: 0.019, length: 0.16, axis: "z" }, position: duAt(key, x, "inter", 0.125) },
    { id: `${key}-reduction-gear`, material: "steel",
      shape: { kind: "gear", radius: 0.089, teeth: 53, thickness: 0.038 }, position: duAt(key, x, "wheel", 0.085) },
    { id: `${key}-differential`, material: "cast",
      shape: { kind: "ring", radius: 0.06, inner: 0.019, length: 0.135, axis: "z" }, position: duAt(key, x, "wheel", 0.0675) },
    ...SIDES.map((s): Part => ({
      id: `${key}-side-gear-${s.key}`, material: "steel",
      shape: { kind: "gear", radius: 0.028, teeth: 16, thickness: 0.014 }, position: duAt(key, x, "wheel", 0.0675 + s.z * 0.03),
    })),
    { id: `${key}-spider-gears`, material: "steel",
      shape: { kind: "cylinder", radius: 0.007, length: 0.1, axis: "y" }, position: duAt(key, x, "wheel", 0.0675) },
    { id: `${key}-gearbox-cover`, material: "aluminium",
      shape: { kind: "box", size: [0.3, 0.34, 0.09], radius: 0.04 }, position: [x - 0.02, 0.47, 0.17] },
    { id: `${key}-oil-pump`, material: "cast",
      shape: { kind: "cylinder", radius: 0.026, length: 0.09, axis: "z" }, position: [x + d * 0.06, AXLE_Y - 0.105, 0.06] },
    { id: `${key}-oil-cooler`, material: "aluminium",
      shape: { kind: "box", size: [0.07, 0.06, 0.07], radius: 0.006 }, position: [x - d * 0.06, AXLE_Y + 0.09, 0.07] },
    { id: key === "front" ? "front-disconnect" : "rear-park-lock", material: "electronics",
      shape: { kind: "cylinder", radius: 0.022, length: 0.05, axis: "z" }, position: duAt(key, x, "inter", 0.24, d * 0.05) },
    { id: `${key}-gate-driver`, material: "pcb",
      shape: { kind: "box", size: [0.19, 0.006, 0.17], radius: 0.002 }, position: [mx, top + 0.05, -0.02] },
    { id: `${key}-control-board`, material: "pcb",
      shape: { kind: "box", size: [0.24, 0.006, 0.1], radius: 0.002 }, position: [mx, top + 0.07, 0.085] },
    { id: `${key}-inverter-busbars`, material: "copper",
      shape: { kind: "box", size: [0.11, 0.006, 0.16], radius: 0.002 }, position: [mx, top + 0.066, -0.15] },
    { id: `${key}-phase-busbars`, material: "copper",
      shape: { kind: "box", size: [0.07, 0.04, 0.05], radius: 0.002 }, position: [mx, top - 0.01, 0.08] },
    { id: `${key}-current-sensor`, material: "satin-black",
      shape: { kind: "box", size: [0.11, 0.022, 0.026], radius: 0.004 }, position: [mx, top + 0.03, 0.09] },
    { id: `${key}-hv-connector`, material: "hv-orange",
      shape: { kind: "box", size: [0.04, 0.05, 0.07], radius: 0.006 }, position: [mx - d * 0.168, top + 0.04, -0.17] },
    { id: `${key}-inverter-lid`, material: "aluminium",
      shape: { kind: "box", size: [0.3, 0.008, 0.4], radius: 0.004 }, position: [mx, top + 0.079, -0.06] },
    { id: `${key}-power-module`, material: "pcb",
      shape: { kind: "box", size: [0.1, 0.03, 0.15], radius: 0.004 }, position: [mx, top + 0.02, -0.02] },
    { id: `${key}-dc-link-capacitor`, material: "satin-black",
      shape: { kind: "box", size: [0.21, 0.05, 0.12], radius: 0.01 }, position: [mx, top + 0.034, -0.185] },
    ...[1, 2, 3].map((n): Part => ({
      id: `${key}-drive-unit-mount-${n}`, material: "satin-black",
      shape: { kind: "cylinder", radius: 0.03, length: 0.05, axis: "z" },
      position: n === 1 ? [mx, 0.285, h0 + 0.05] : n === 2 ? [x - d * 0.04, 0.285, 0.125] : [x + d * 0.15, 0.31, 0.175],
    })),
  ];
};

const thermal: Part[] = [
  { id: "radiator", material: "aluminium",
    shape: { kind: "slats", size: [0.04, 0.36, 0.9], count: 46 }, position: [2.2, 0.64, 0] },
  ...SIDES.map((s): Part => ({
    id: `cooling-fan-${s.key}`, material: "satin-black",
    shape: { kind: "fan", radius: 0.16 }, position: [2.12, 0.64, s.z * 0.22],
  })),
  { id: "coolant-pump", material: "cast",
    shape: { kind: "cylinder", radius: 0.04, length: 0.1, axis: "y" }, position: [1.75, 0.5, -0.25] },
  { id: "battery-chiller", material: "aluminium",
    shape: { kind: "box", size: [0.14, 0.08, 0.1], radius: 0.01 }, position: [1.85, 0.46, -0.12] },
  { id: "heat-pump-compressor", material: "cast",
    shape: { kind: "cylinder", radius: 0.06, length: 0.16, axis: "x" }, position: [1.84, 0.47, 0.18] },
  { id: "hvac-module", material: "satin-black",
    shape: { kind: "box", size: [0.22, 0.2, 0.5], radius: 0.03 }, position: [0.72, 0.62, -0.1] },
  { id: "coolant-lines", material: "satin-black",
    // runs above the front-left drive shaft, beside the motor's end cover
    ...absTube([[2.12, 0.5, -0.3], [1.8, 0.5, -0.36], [1.3, 0.49, -0.4], [1.0, 0.28, -0.24]], 0.013) },
];

const cabin: Part[] = [
  { id: "centre-console", material: "satin-black",
    shape: { kind: "box", size: [0.62, 0.18, 0.22], radius: 0.04 }, position: [0.1, 0.5, 0] },
  { id: "driver-display", material: "gloss-black",
    shape: { kind: "box", size: [0.025, 0.11, 0.3], radius: 0.008 }, position: [0.68, 1.04, DRIVER_Z], rotation: [0, 0, -0.2] },
  { id: "centre-display", material: "gloss-black",
    shape: { kind: "box", size: [0.025, 0.2, 0.32], radius: 0.008 }, position: [0.8, 1.02, 0], rotation: [0, 0, -0.25] },
  { id: "headliner", material: "fabric",
    shape: { kind: "box", size: [2.0, 0.01, 1.22], radius: 0.004 }, position: [-0.75, 1.52, 0] },
];

export const PARTS: Part[] = [
  ...body,
  ...structure,
  ...corners,
  ...suspension,
  ...steering,
  ...brakeControl,
  ...driveUnit("front", FRONT_AXLE_X),
  ...driveUnit("rear", REAR_AXLE_X),
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
  ...driveUnitDetail("front", FRONT_AXLE_X),
  ...driveUnitDetail("rear", REAR_AXLE_X),
  ...thermal,
  ...cabin,
];

export const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));
