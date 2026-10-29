// The studio: camera, lighting and the slow turntable.
// Lighting imitates automotive product photography: a large soft box overhead, long strip
// lights either side that draw clean reflections along the body, and a dim rim light behind.

import { CameraControls, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Vehicle } from "./Vehicle";

function Turntable({ spinning, children }: { spinning: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spinning && ref.current) ref.current.rotation.y += dt * 0.09;
  });
  return (
    <group ref={ref} rotation={[0, -0.5, 0]}>
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

function Controls({ exploring }: { exploring: boolean }) {
  const ref = useRef<React.ComponentRef<typeof CameraControls>>(null);
  useEffect(() => {
    ref.current?.setTarget(0, 0.72, 0, false); // look at the middle of the car, not the ground
  }, []);
  return (
    <CameraControls
      ref={ref}
      enabled={exploring}
      minDistance={3}
      maxDistance={16}
      maxPolarAngle={Math.PI / 2 - 0.04}
      smoothTime={0.35}
    />
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
      {/* a cool rim light from high behind */}
      <Lightformer form="ring" color="#bcd7ff" intensity={1.5} position={[-4, 5, -4]} scale={2.5} />
    </Environment>
  );
}

export function Stage({ exploring, reducedMotion }: { exploring: boolean; reducedMotion: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      camera={{ position: [8.4, 1.75, 8.4], fov: 24, near: 0.1, far: 100 }}
      onCreated={(state) => {
        if (import.meta.env.DEV) (window as unknown as { __vx: unknown }).__vx = state; // for inspection while developing
      }}
    >
      <color attach="background" args={["#060709"]} />
      <fog attach="fog" args={["#060709", 14, 30]} />
      <Studio />
      <Framing exploring={exploring} />
      <directionalLight position={[3, 8, 2]} intensity={0.8} />
      <Turntable spinning={!exploring && !reducedMotion}>
        <group position={[0.04, 0, 0]}>
          <Vehicle />
        </group>
        {/* Soft shadow under the car. Captured once and turned with the car, so it costs nothing per frame. */}
        <ContactShadows position={[0, 0.001, 0]} opacity={0.8} scale={[6.5, 3.2]} blur={2.4} far={1.2} resolution={512} frames={1} color="#000000" />
      </Turntable>
      <Controls exploring={exploring} />
    </Canvas>
  );
}
