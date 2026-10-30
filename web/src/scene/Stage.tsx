// The studio: camera, lighting and the slow turntable.
// Lighting imitates automotive product photography: a large soft box overhead, long strip
// lights either side that draw clean reflections along the body, and a dim rim light behind.

import { CameraControls, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { explodedVolume } from "./framing";
import { progress } from "./progress";
import { settings } from "./settings";
import { Vehicle } from "./Vehicle";

function Turntable({ spinning, children }: { spinning: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spinning && ref.current) ref.current.rotation.y += dt * 0.09;
  });
  return (
    <group ref={ref} name="turntable" rotation={[0, -0.5, 0]}>
      {children}
    </group>
  );
}

/** While the intro text is showing, shift the picture so the vehicle sits right of the headline
 * (a lens "film offset", so the camera itself doesn't move). Eases back to centre when exploring. */
function Framing({ exploring }: { exploring: boolean }) {
  const { camera, size } = useThree();
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const target = exploring || size.width < 900 ? 0 : -3.2;
    const next = THREE.MathUtils.damp(cam.filmOffset, target, 3, dt);
    // On narrow (portrait) screens, widen the lens so the whole car still fits across.
    const aspect = size.width / size.height;
    const fov = aspect >= 1.4 ? 24 : Math.min(55, (24 * 1.4) / aspect);
    if (Math.abs(next - cam.filmOffset) > 1e-4 || cam.fov !== fov) {
      cam.filmOffset = next;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

const ASSEMBLED_VIEW = { targetY: 0.72, distance: 11.9 };

/** Camera distance that shows the whole exploded assembly from any orbit angle, on this screen. */
function explodedDistance(aspect: number, fovDeg: number) {
  const v = THREE.MathUtils.degToRad(fovDeg) / 2;
  const h = Math.atan(Math.tan(v) * aspect);
  const { radius, halfHeight } = explodedVolume;
  const margin = aspect < 1 ? 0.88 : 1.02; // on portrait screens the width limit alone is overly cautious
  const byWidth = radius / Math.tan(h) + radius * 0.6; // the near side of the assembly comes towards the camera
  const byHeight = halfHeight / Math.tan(v) + radius * 0.6;
  return Math.max(byWidth, byHeight) * margin;
}

/** Orbit / zoom / pan, plus an automatic reframe while the explosion progresses: the camera keeps
 * its angle (the viewer's choice) but rises and pulls back until the whole assembly is in view. */
function Controls({ exploring }: { exploring: boolean }) {
  const ref = useRef<React.ComponentRef<typeof CameraControls>>(null);
  const framed = useRef(0);
  const { size, camera } = useThree();
  useEffect(() => {
    ref.current?.setTarget(0, ASSEMBLED_VIEW.targetY, 0, false); // look at the middle of the car, not the ground
  }, []);
  useFrame(() => {
    const c = ref.current;
    const p = progress.value;
    if (!c || Math.abs(p - framed.current) < 1e-4) return;
    framed.current = p;
    const e = 1 - Math.pow(1 - p, 2.5); // pull back early: the assembly opens up fast at the start
    const far = explodedDistance(size.width / size.height, (camera as THREE.PerspectiveCamera).fov);
    c.setTarget(0, THREE.MathUtils.lerp(ASSEMBLED_VIEW.targetY, explodedVolume.centreY, e), 0, true);
    c.dollyTo(THREE.MathUtils.lerp(ASSEMBLED_VIEW.distance, far, e), true);
  });
  return (
    <CameraControls
      ref={ref}
      makeDefault
      enabled={exploring}
      minDistance={3}
      maxDistance={60}
      maxPolarAngle={Math.PI / 2 - 0.04}
      smoothTime={0.35}
    />
  );
}

/** Lights that travel with the camera: a soft key from over the viewer's shoulder and two cool rim
 * lights from behind the assembly, so every part has a bright outline against the dark background
 * whichever way it is viewed. They strengthen as the vehicle opens up. */
function CameraLights() {
  const key = useRef<THREE.DirectionalLight>(null);
  const rimL = useRef<THREE.DirectionalLight>(null);
  const rimR = useRef<THREE.DirectionalLight>(null);
  const { camera, scene } = useThree();
  const v = useMemo(() => ({ fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    const p = progress.value;
    camera.getWorldDirection(v.fwd);
    v.right.crossVectors(v.fwd, v.up).normalize();
    const place = (light: THREE.DirectionalLight | null, along: number, side: number, up: number, intensity: number) => {
      if (!light) return;
      light.position.copy(v.fwd).multiplyScalar(along).addScaledVector(v.right, side).addScaledVector(v.up, up);
      light.target.position.set(0, 0, 0);
      light.target.updateMatrixWorld();
      light.intensity = intensity;
    };
    place(key.current, -10, -6, 8, 0.6 + 0.9 * p);
    place(rimL.current, 12, -9, 6, 0.9 + 1.6 * p);
    place(rimR.current, 12, 9, 4, 0.7 + 1.3 * p);
    scene.environmentIntensity = 1 + 0.55 * p;
  });
  return (
    <>
      <directionalLight ref={key} color="#fff6ec" />
      <directionalLight ref={rimL} color="#cfe0ff" />
      <directionalLight ref={rimR} color="#e6f2ff" />
    </>
  );
}

function Studio() {
  return (
    <Environment resolution={512} frames={1}>
      <color attach="background" args={["#050608"]} />
      {/* overhead soft box */}
      <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[9, 4, 1]} />
      {/* long side strips: these make the highlight lines along the doors */}
      <Lightformer form="rect" intensity={3} position={[0, 2.2, 6]} scale={[14, 0.35, 1]} />
      <Lightformer form="rect" intensity={3} position={[0, 2.2, -6]} rotation-y={Math.PI} scale={[14, 0.35, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[0, 0.8, 6]} scale={[14, 0.15, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[0, 0.8, -6]} rotation-y={Math.PI} scale={[14, 0.15, 1]} />
      {/* front and rear fill */}
      <Lightformer form="rect" intensity={1.4} position={[7, 2, 0]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
      <Lightformer form="rect" intensity={0.8} position={[-7, 2.5, 0]} rotation-y={Math.PI / 2} scale={[4, 1.2, 1]} />
      {/* faint surrounding walls and floor bounce, so bare metal reads as metal instead of black */}
      <Lightformer form="rect" intensity={0.22} position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[30, 30, 1]} />
      <Lightformer form="rect" intensity={0.16} position={[0, 2, 12]} scale={[30, 10, 1]} />
      <Lightformer form="rect" intensity={0.16} position={[0, 2, -12]} rotation-y={Math.PI} scale={[30, 10, 1]} />
      <Lightformer form="rect" intensity={0.12} position={[12, 2, 0]} rotation-y={-Math.PI / 2} scale={[30, 10, 1]} />
      <Lightformer form="rect" intensity={0.12} position={[-12, 2, 0]} rotation-y={Math.PI / 2} scale={[30, 10, 1]} />
      {/* a cool rim light from high behind */}
      <Lightformer form="ring" color="#bcd7ff" intensity={1.5} position={[-4, 5, -4]} scale={2.5} />
    </Environment>
  );
}

export function Stage({ exploring, reducedMotion, selectedId, onSelect }: {
  exploring: boolean;
  reducedMotion: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
      camera={{ position: [8.4, 1.75, 8.4], fov: 24, near: 0.1, far: 100 }}
      onPointerMissed={() => onSelect(null)}
      onCreated={(state) => {
        if (import.meta.env.DEV) import("./devtools").then((d) => d.installDevtools(state));
      }}
    >
      <color attach="background" args={["#060709"]} />
      <fog attach="fog" args={["#060709", 34, 70]} />
      <Studio />
      <Framing exploring={exploring} />
      <directionalLight position={[3, 8, 2]} intensity={0.6} />
      <hemisphereLight args={["#cfd8e2", "#0b0c0f", 0.45]} />
      <CameraLights />
      <Turntable spinning={!exploring && !reducedMotion}>
        <Suspense fallback={null}>
          <group position={[0.04, 0, 0]}>
            <Vehicle selectedId={selectedId} onSelect={exploring ? onSelect : () => {}} />
          </group>
          {/* Soft shadow under the car. Captured once (after the car has loaded) and turned with it. */}
          <ContactShadows position={[0, 0.001, 0]} opacity={0.8} scale={[6.5, 3.2]} blur={2.4} far={1.2} resolution={512} frames={1} color="#000000" />
        </Suspense>
      </Turntable>
      <Controls exploring={exploring} />
      {settings.effects && (
        <EffectComposer multisampling={4}>
          {/* Ambient occlusion: soft darkening where surfaces meet (crevices, contact between parts). */}
          <N8AO aoRadius={0.18} distanceFalloff={0.6} intensity={2.4} quality="medium" halfRes />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
