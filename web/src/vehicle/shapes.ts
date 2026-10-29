// Geometry for every non-body part. Each shape is plain data in the manifest; this file turns it
// into triangles. Shapes are built around their own centre, then placed by the part's position.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RIM_RADIUS, TYRE_WIDTH, WHEEL_RADIUS } from "./dimensions";

export type Vec3 = [number, number, number];
export type Axis = "x" | "y" | "z";

export type Shape =
  | { kind: "panel" } // a body panel: geometry comes from body.ts
  | { kind: "box"; size: Vec3; radius?: number }
  | { kind: "cylinder"; radius: number; length: number; axis: Axis; radiusEnd?: number; segments?: number }
  | { kind: "tube"; points: Vec3[]; radius: number } // points are relative to the part's position
  | { kind: "tyre" }
  | { kind: "rim" }
  | { kind: "disc"; radius: number }
  | { kind: "caliper" }
  | { kind: "coilover"; length: number }
  | { kind: "arm"; inner: Vec3[]; outer: Vec3 } // A-shaped control arm: two inner pivots, one outer
  | { kind: "arch-liner" }
  | { kind: "battery-module" }
  | { kind: "seat"; width: number }
  | { kind: "steering-wheel" }
  | { kind: "mirror" }
  | { kind: "lidar" }
  | { kind: "shark-fin" }
  | { kind: "finned-box"; size: Vec3; fins: number };

const turn = (g: THREE.BufferGeometry, axis: Axis) => {
  // Cylinders and lathes are built along y; turn them to the requested axis.
  if (axis === "x") g.rotateZ(-Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  return g;
};

const merge = (parts: THREE.BufferGeometry[]) => {
  const prepared = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of prepared) p.deleteAttribute("uv");
  return mergeGeometries(prepared, false)!;
};

const tubeBetween = (points: Vec3[], radius: number, radial = 10) => {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 12), radius, radial, false);
};

/** Tyre: a lathe (profile spun around the axle) with a rounded shoulder; outward face is +z. */
function tyre() {
  const r = WHEEL_RADIUS;
  const ri = RIM_RADIUS + 0.004;
  const hw = TYRE_WIDTH / 2;
  const pts: THREE.Vector2[] = [];
  const profile: [number, number][] = [
    [ri, -hw + 0.01], [ri + 0.03, -hw], [r - 0.05, -hw - 0.004], [r - 0.012, -hw + 0.02], [r, -hw + 0.06],
    [r, hw - 0.06], [r - 0.012, hw - 0.02], [r - 0.05, hw + 0.004], [ri + 0.03, hw], [ri, hw - 0.01],
  ];
  for (const [x, y] of profile) pts.push(new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 96);
  return turn(g, "z");
}

/** Rim: barrel, outer lip and ten twisted spokes. Outward face is +z. */
function rim() {
  const r = RIM_RADIUS;
  const hw = TYRE_WIDTH / 2 - 0.01;
  const parts: THREE.BufferGeometry[] = [];
  const barrel = new THREE.LatheGeometry(
    [
      new THREE.Vector2(r - 0.02, -hw), new THREE.Vector2(r - 0.005, -hw + 0.01), new THREE.Vector2(r - 0.03, -hw + 0.04),
      new THREE.Vector2(r - 0.035, hw - 0.05), new THREE.Vector2(r, hw - 0.01), new THREE.Vector2(r - 0.01, hw),
    ],
    72,
  );
  parts.push(turn(barrel, "z"));
  const hub = new THREE.CylinderGeometry(0.075, 0.085, 0.05, 32);
  turn(hub, "z").translate(0, 0, hw - 0.045);
  parts.push(hub);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spoke = new RoundedBoxGeometry(0.03, r - 0.08, 0.035, 2, 0.008);
    spoke.translate(0, (r - 0.08) / 2 + 0.07, 0);
    spoke.rotateY(0.18); // slight twist gives the spokes a turbine look
    spoke.rotateZ(a);
    spoke.translate(0, 0, hw - 0.04);
    parts.push(spoke);
  }
  const cap = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 24);
  turn(cap, "z").translate(0, 0, hw - 0.012);
  parts.push(cap);
  return merge(parts);
}

/** Ventilated brake disc with a hat in the middle. Axis z. */
function disc(radius: number) {
  const outer = new THREE.CylinderGeometry(radius, radius, 0.03, 64, 1, false);
  const hat = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 32);
  hat.translate(0, 0.02, 0);
  const g = merge([outer, hat]);
  return turn(g, "z");
}

function caliper() {
  const body = new RoundedBoxGeometry(0.07, 0.16, 0.075, 3, 0.02);
  const bridge = new RoundedBoxGeometry(0.035, 0.12, 0.02, 2, 0.008);
  bridge.translate(0.02, 0, 0.045);
  return merge([body, bridge]);
}

/** Coil spring around a damper; built along y, centred. */
function coilover(length: number) {
  const turns = 7;
  const r = 0.055;
  const pts: THREE.Vector3[] = [];
  const n = turns * 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, (t - 0.5) * length * 0.72, Math.sin(a) * r));
  }
  const spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.009, 8, false);
  const body = new THREE.CylinderGeometry(0.026, 0.026, length * 0.6, 20);
  body.translate(0, -length * 0.15, 0);
  const rod = new THREE.CylinderGeometry(0.01, 0.01, length * 0.5, 12);
  rod.translate(0, length * 0.22, 0);
  const seatLow = new THREE.CylinderGeometry(0.07, 0.07, 0.012, 24);
  seatLow.translate(0, -length * 0.37, 0);
  const seatHigh = new THREE.CylinderGeometry(0.07, 0.07, 0.012, 24);
  seatHigh.translate(0, length * 0.37, 0);
  return merge([spring, body, rod, seatLow, seatHigh]);
}

function arm(inner: Vec3[], outer: Vec3) {
  const parts: THREE.BufferGeometry[] = inner.map((p) => tubeBetween([p, outer], 0.018, 8));
  for (const p of [...inner, outer]) {
    const bush = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16);
    bush.rotateZ(Math.PI / 2);
    bush.translate(...p);
    parts.push(bush);
  }
  return merge(parts);
}

/** Black wheel-well liner: half a cylinder over the top of the wheel. Axis z. */
function archLiner() {
  const g = new THREE.CylinderGeometry(0.445, 0.445, 0.3, 48, 1, true, -Math.PI / 2 - 0.25, Math.PI + 0.5);
  turn(g, "z");
  g.rotateZ(Math.PI / 2);
  return g;
}

function batteryModule() {
  const parts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(0.4, 0.1, 0.56, 2, 0.008)];
  for (const z of [-0.2, 0.2]) {
    const terminal = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 12);
    terminal.translate(0.14, 0.06, z);
    parts.push(terminal);
  }
  const busbar = new RoundedBoxGeometry(0.03, 0.006, 0.44, 1, 0.002);
  busbar.translate(0.14, 0.072, 0);
  parts.push(busbar);
  return merge(parts);
}

function seat(width: number) {
  const cushion = new RoundedBoxGeometry(0.5, 0.12, width, 4, 0.05);
  cushion.translate(0, 0, 0);
  const back = new RoundedBoxGeometry(0.12, 0.62, width, 4, 0.05);
  back.rotateZ(0.22);
  back.translate(-0.27, 0.3, 0);
  const parts = [cushion, back];
  if (width < 0.8) {
    const head = new RoundedBoxGeometry(0.1, 0.18, width * 0.55, 4, 0.04);
    head.rotateZ(0.22);
    head.translate(-0.37, 0.7, 0);
    parts.push(head);
  }
  return merge(parts);
}

function steeringWheel() {
  const ring = new THREE.TorusGeometry(0.18, 0.017, 16, 64);
  const hub = new THREE.CylinderGeometry(0.06, 0.07, 0.06, 32);
  hub.rotateX(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [ring, hub];
  for (const a of [Math.PI / 2 + 0.3, Math.PI / 2 - 0.3 + Math.PI, -Math.PI / 2]) {
    const spoke = new RoundedBoxGeometry(0.13, 0.03, 0.02, 2, 0.008);
    spoke.translate(0.1, 0, 0);
    spoke.rotateZ(a);
    parts.push(spoke);
  }
  const g = merge(parts);
  g.rotateY(Math.PI / 2); // face the driver (normal along x)
  return g;
}

function mirror() {
  const head = new RoundedBoxGeometry(0.12, 0.1, 0.22, 4, 0.04);
  const stalk = new RoundedBoxGeometry(0.06, 0.03, 0.08, 2, 0.01);
  stalk.translate(0.01, -0.035, -0.12);
  return merge([head, stalk]);
}

function lidar() {
  const base = new THREE.CylinderGeometry(0.075, 0.08, 0.02, 40);
  base.translate(0, -0.03, 0);
  const body = new THREE.CylinderGeometry(0.065, 0.07, 0.05, 40);
  const top = new THREE.CylinderGeometry(0.05, 0.065, 0.015, 40);
  top.translate(0, 0.032, 0);
  return merge([base, body, top]);
}

function sharkFin() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.09, 0);
  shape.quadraticCurveTo(0.02, 0.0, 0.08, 0.0);
  shape.quadraticCurveTo(0.02, 0.03, -0.06, 0.065);
  shape.quadraticCurveTo(-0.09, 0.04, -0.09, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 4, curveSegments: 16 });
  g.translate(0, -0.03, -0.02);
  return g;
}

function finnedBox(size: Vec3, fins: number) {
  const body = new RoundedBoxGeometry(size[0], size[1] * 0.55, size[2], 3, 0.008);
  body.translate(0, -size[1] * 0.225, 0);
  const parts = [body];
  for (let i = 0; i < fins; i++) {
    const fin = new THREE.BoxGeometry(size[0] * 0.92, size[1] * 0.45, 0.004);
    fin.translate(0, size[1] * 0.275, -size[2] / 2 + ((i + 0.5) / fins) * size[2]);
    parts.push(fin);
  }
  return merge(parts);
}

/** Build the triangles for a (non-panel) shape. */
export function buildShape(shape: Shape): THREE.BufferGeometry {
  switch (shape.kind) {
    case "box":
      return new RoundedBoxGeometry(...shape.size, 3, shape.radius ?? Math.min(...shape.size) * 0.15);
    case "cylinder":
      return turn(new THREE.CylinderGeometry(shape.radiusEnd ?? shape.radius, shape.radius, shape.length, shape.segments ?? 32), shape.axis);
    case "tube":
      return tubeBetween(shape.points, shape.radius);
    case "tyre":
      return tyre();
    case "rim":
      return rim();
    case "disc":
      return disc(shape.radius);
    case "caliper":
      return caliper();
    case "coilover":
      return coilover(shape.length);
    case "arm":
      return arm(shape.inner, shape.outer);
    case "arch-liner":
      return archLiner();
    case "battery-module":
      return batteryModule();
    case "seat":
      return seat(shape.width);
    case "steering-wheel":
      return steeringWheel();
    case "mirror":
      return mirror();
    case "lidar":
      return lidar();
    case "shark-fin":
      return sharkFin();
    case "finned-box":
      return finnedBox(shape.size, shape.fins);
    case "panel":
      throw new Error("Body panels are built by body.ts");
  }
}
