// The introduction's landscape (Phase E): rolling green hills, a straight country road to the horizon, scattered
// trees and a restrained sky. Built in code (no downloads): one terrain mesh, one road strip with a drawn texture,
// two instanced meshes for the trees and a gradient sky dome. As Begin's transition runs, the sky, fog and light
// turn to the studio's black and the landscape dissolves; once in the studio it is removed altogether.
//
// The road runs along the x axis and the car stops at the origin, where the studio shows it; it drives in the
// right-hand lane (the road's centre line is at z = ROAD_CENTRE).

import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { intro } from "./intro";

const ROAD_CENTRE = -1.85;
const ROAD_HALF = 3.7;
const STUDIO_BG = new THREE.Color("#060709");
const HAZE = new THREE.Color("#c9d6df");
/** Where the sun is (direction): high and over the camera's shoulder, so it lights the car's front three-quarter. */
export const SUN = new THREE.Vector3(0.55, 0.72, 0.42).normalize();

// ---- Terrain height: smooth value noise, flattened along the road ------------------------------------------------

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ground height (metres) at (x, z): level along the road, rising into rolling hills either side and higher hills
 * in the distance. */
export function groundHeight(x: number, z: number) {
  const off = Math.abs(z - ROAD_CENTRE);
  const rolling = noise(x * 0.008, z * 0.008) * 0.6 + noise(x * 0.02 + 7, z * 0.02) * 0.3 + noise(x * 0.06, z * 0.06 + 3) * 0.1;
  const near = smoothstep(ROAD_HALF + 6, 70, off) * (4 + 26 * rolling);
  const far = smoothstep(180, 520, off) * 45 * noise(x * 0.004 + 11, z * 0.004);
  return near + far - 0.03;
}

function Terrain({ material }: { material: THREE.Material }) {
  const geometry = useMemo(() => {
    // x from -760 (the horizon down the road) to 220 (behind the camera), z ±420
    const g = new THREE.PlaneGeometry(980, 840, 196, 168);
    g.rotateX(-Math.PI / 2);
    g.translate(-270, 0, 0);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const low = new THREE.Color("#5b8236"), high = new THREE.Color("#7fa848"), dry = new THREE.Color("#a3a75e");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = groundHeight(x, z);
      pos.setY(i, y);
      // greener in the hollows, paler and drier on the tops, with a patchwork of fields
      const field = noise(x * 0.025 + 3, z * 0.025 - 4);
      c.copy(low).lerp(high, 0.5 * noise(x * 0.05, z * 0.05) + 0.5 * field)
        .lerp(dry, 0.45 * smoothstep(8, 30, y) * noise(x * 0.012 + 5, z * 0.012));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // UVs in metres / 3, so the grass texture repeats every 3 m
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} />;
}

/** A fine grass texture (greyscale, around 1): short blades and soft mottling, repeated every few metres so the hills
 * read as grass rather than smooth plastic. Multiplies the terrain's colours. */
function grassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "rgb(225,225,225)";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 170 + Math.floor(hash(i, 21) * 85);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    const x = hash(i, 22) * 256, y = hash(i, 23) * 256, a = (hash(i, 24) - 0.5) * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.sin(a) * 4, y - Math.cos(a) * 5);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---- Road: a strip with asphalt, edge lines and a dashed centre line drawn into a canvas texture -----------------

function roadTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512; // 12 m of road along its length
  canvas.height = 256; // the road's width
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#3c3f43";
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 5000; i++) {             // aggregate speckle
    const v = 50 + Math.floor(hash(i, 1) * 40);
    g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    g.fillRect(hash(i, 2) * 512, hash(i, 3) * 256, 1.5, 1.5);
  }
  g.fillStyle = "rgba(0,0,0,0.12)";            // darker wheel tracks
  for (const y of [40, 92, 164, 216]) g.fillRect(0, y - 10, 512, 20);
  g.fillStyle = "#e8e8e2";
  g.fillRect(0, 8, 512, 6);                    // edge lines
  g.fillRect(0, 242, 512, 6);
  g.fillRect(0, 125, 128, 6);                  // centre dash: 3 m in every 12 m
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Road({ material }: { material: THREE.MeshStandardMaterial }) {
  const geometry = useMemo(() => {
    const length = 940;
    const g = new THREE.PlaneGeometry(length, ROAD_HALF * 2 + 0.6, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(-length / 2 + 180, 0.004, ROAD_CENTRE);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (length / 12));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} />;
}

// ---- Trees: two instanced meshes (trunks and crowns), placed in clumps on the hills -------------------------------

function Trees({ crown, trunk }: { crown: THREE.Material; trunk: THREE.Material }) {
  const { crowns, trunks } = useMemo(() => {
    const spots: [number, number, number][] = [];
    for (let i = 0; spots.length < 260 && i < 6000; i++) {
      const x = -700 + hash(i, 11) * 880, z = (hash(i, 12) - 0.5) * 760;
      const off = Math.abs(z - ROAD_CENTRE);
      if (off < 22 || (x > -40 && off < 60)) continue;            // keep the road and the foreground open
      if (noise(x * 0.02 + 50, z * 0.02) < 0.62) continue;         // clumps, not an even scatter
      spots.push([x, z, 0.7 + hash(i, 13) * 0.8]);
    }
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
    const crowns = new THREE.InstancedMesh(crownGeo, undefined, spots.length);
    const shade = new THREE.Color(), dark = new THREE.Color("#2f4a22"), light = new THREE.Color("#57773a");
    const trunks = new THREE.InstancedMesh(trunkGeo, undefined, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    spots.forEach(([x, z, s], i) => {
      const y = groundHeight(x, z);
      m.compose(new THREE.Vector3(x, y + 3.6 * s, z), q, new THREE.Vector3(2.4 * s, 3.0 * s, 2.4 * s));
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, shade.copy(dark).lerp(light, hash(i, 14)));
      m.compose(new THREE.Vector3(x, y + 0.9 * s, z), q, new THREE.Vector3(s, 1.8 * s, s));
      trunks.setMatrixAt(i, m);
    });
    return { crowns, trunks };
  }, []);
  useEffect(() => () => { crowns.geometry.dispose(); trunks.geometry.dispose(); crowns.dispose(); trunks.dispose(); }, [crowns, trunks]);
  return (
    <>
      <primitive object={crowns} material={crown} />
      <primitive object={trunks} material={trunk} />
    </>
  );
}

// ---- Sky: a gradient dome with a soft glow towards the sun ----------------------------------------------------------

function Sky({ fade }: { fade: { value: number } }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color("#5d8ec6") }, horizon: { value: new THREE.Color("#d3e0ea") },
      haze: { value: HAZE.clone() }, sun: { value: SUN }, fade, black: { value: STUDIO_BG },
    },
    vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 haze; uniform vec3 sun; uniform vec3 black; uniform float fade;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, top, pow(smoothstep(-0.01, 0.32, d.y), 0.75));
        c = mix(haze, c, smoothstep(-0.02, 0.06, d.y));
        c += vec3(1.0, 0.92, 0.8) * pow(max(dot(d, sun), 0.0), 48.0) * 0.25;
        gl_FragColor = vec4(mix(c, black, fade), 1.0);
      }`,
  }), [fade]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh material={material} renderOrder={-1}><sphereGeometry args={[1800, 32, 16]} /></mesh>;
}

// ---- The outdoor light and reflections -----------------------------------------------------------------------------

/** Reflections for the car on the road: a bright sky overhead, a pale horizon all round, the sun, and green ground
 * below, so the paint and glass reflect the landscape rather than the studio's softboxes. (Removed halfway through
 * Begin's transition; the studio's own reflections then return.) */
function Outdoor() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" color="#cfe0f0" intensity={1.1} position={[0, 30, 0]} rotation-x={Math.PI / 2} scale={[80, 80, 1]} />
      {[0, 1, 2, 3].map((i) => (
        <Lightformer key={i} form="rect" color="#e6ecee" intensity={0.8} rotation-y={(i * Math.PI) / 2}
          position={[Math.sin((i * Math.PI) / 2) * -30, 3, Math.cos((i * Math.PI) / 2) * -30]} scale={[60, 8, 1]} />
      ))}
      <Lightformer form="circle" color="#fff4e2" intensity={14} position={SUN.clone().multiplyScalar(25).toArray()} scale={3} />
      <Lightformer form="rect" color="#5a6d42" intensity={0.5} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[80, 80, 1]} />
    </Environment>
  );
}

export function Landscape() {
  const { scene } = useThree();
  const fade = useMemo(() => ({ value: 0 }), []);
  const materials = useMemo(() => ({
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTexture(), roughness: 1, metalness: 0 }),
    road: new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.92, metalness: 0 }),
    crown: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: "#4a3a2a", roughness: 1 }),
  }), []);
  useEffect(() => () => {
    materials.road.map?.dispose();
    materials.ground.map?.dispose();
    for (const m of Object.values(materials)) m.dispose();
  }, [materials]);
  const sun = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const [outdoor, setOutdoor] = useState(true);
  const fog = useMemo(() => ({ color: new THREE.Color() }), []);

  // Fog, sky and light follow the transition: outdoors, a light haze far away; into the studio, the haze turns to
  // the studio's black and closes in, the sky darkens and the ground dissolves.
  useFrame(() => {
    const s = intro.studio;
    fade.value = smoothstep(0.1, 0.75, s);
    const f = scene.fog as THREE.Fog | null;
    if (f) {
      f.color.copy(fog.color.copy(HAZE).lerp(STUDIO_BG, smoothstep(0.05, 0.7, s)));
      f.near = THREE.MathUtils.lerp(160, 34, smoothstep(0, 0.8, s));
      f.far = THREE.MathUtils.lerp(1500, 70, smoothstep(0, 0.8, s));
    }
    const opacity = 1 - smoothstep(0.45, 0.95, s);
    for (const m of [materials.ground, materials.road, materials.crown, materials.trunk]) {
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity > 0.5;
    }
    if (sun.current) sun.current.intensity = 2.6 * (1 - smoothstep(0, 0.6, s));
    if (sky.current) sky.current.intensity = 0.9 * (1 - smoothstep(0, 0.6, s));
    if (outdoor && s > 0.5) setOutdoor(false);
  });
  // Back in the studio: the studio's fog.
  useEffect(() => () => {
    const f = scene.fog as THREE.Fog | null;
    if (f) { f.color.copy(STUDIO_BG); f.near = 34; f.far = 70; }
  }, [scene]);

  return (
    <group name="landscape">
      <Sky fade={fade} />
      <Terrain material={materials.ground} />
      <Road material={materials.road} />
      <Trees crown={materials.crown} trunk={materials.trunk} />
      <directionalLight ref={sun} color="#fff1dc" position={SUN.clone().multiplyScalar(40).toArray()} intensity={2.6} />
      <hemisphereLight ref={sky} args={["#c3d6ea", "#5d7040", 0.9]} />
      {outdoor && <Outdoor />}
    </group>
  );
}
