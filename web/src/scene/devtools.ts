// Development-only helpers for checking visuals in a browser pane that pauses animation
// (see CLAUDE.md). Not included in production builds.

import type { RootState } from "@react-three/fiber";
import * as THREE from "three";
import { progress } from "./progress";
import { vehicleState } from "./vehicleState";

export function installDevtools(state: RootState) {
  const w = window as unknown as Record<string, unknown>;
  installShotSaver(state);
  installFocus(state);
  /** Render at a fixed size (CSS pixels x pixel ratio) regardless of the window, for comparable captures. */
  w.__size = (width: number, height: number, dpr = 1.5) => {
    state.setDpr(dpr);
    state.setSize(width, height);
  };
  w.__vx = state;
  w.__vxProgress = progress;
  /** Render the scene at explosion progress `p`, turntable turned to `turn` radians, camera tilted to `polar`. */
  w.__shot = async (p: number, turn?: number, polar?: number) => {
    state.setFrameloop("never");
    progress.set(p);
    // polar: camera angle down from straight overhead, in radians (about 1.4 is the default view)
    if (polar !== undefined) (state.get().controls as unknown as { rotatePolarTo(a: number, smooth: boolean): void }).rotatePolarTo(polar, false);
    if (turn !== undefined) state.scene.getObjectByName("turntable")!.rotation.y = turn;
    let t = performance.now();
    for (let i = 0; i < 150; i++) state.advance((t += 16)); // let the camera settle
    await new Promise((r) => setTimeout(r, 300));
    state.advance(t + 16);
    return state.camera.position.toArray().map((v) => +v.toFixed(2));
  };
}

type Controls = { setLookAt(...a: [number, number, number, number, number, number, boolean]): void };

/**
 * Close-up camera for comparisons: at explosion progress `p`, aim at the average centre of the given
 * parts from a fixed direction (azimuth / elevation in degrees) and distance, with the turntable square.
 * The same call gives the same camera for the procedural and the Blender versions. `only` limits
 * which parts are drawn.
 */
export function installFocus(state: RootState) {
  (window as unknown as Record<string, unknown>).__focus = async (p: number, ids: string[], azimuth: number, elevation: number, distance: number, only?: string[]) => {
    state.setFrameloop("never");
    // Optionally show only some parts (isolates an assembly for close-ups); otherwise show everything.
    for (const b of vehicleState.built) b.object.visible = !only || only.includes(b.id);
    progress.set(p);
    state.scene.getObjectByName("turntable")!.rotation.y = 0;
    let t = performance.now();
    for (let i = 0; i < 150; i++) state.advance((t += 16));
    const target = new THREE.Vector3();
    const parts = vehicleState.built.filter((b) => ids.includes(b.id));
    for (const b of parts) target.add(b.object.getWorldPosition(new THREE.Vector3()));
    target.divideScalar(parts.length);
    const a = THREE.MathUtils.degToRad(azimuth);
    const e = THREE.MathUtils.degToRad(elevation);
    const eye = target.clone().add(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(distance));
    (state.get().controls as unknown as Controls).setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, false);
    for (let i = 0; i < 10; i++) state.advance((t += 16));
    return target.toArray().map((v) => +v.toFixed(3));
  };
}

/** Save the current 3D view (canvas only, no page overlay) to web/shots/<name>.jpg. */
export function installShotSaver(state: RootState) {
  (window as unknown as Record<string, unknown>).__save = async (name: string) => {
    state.gl.render(state.scene, state.camera);
    const blob = await new Promise<Blob | null>((r) => state.gl.domElement.toBlob(r, "image/jpeg", 0.92));
    if (!blob) throw new Error("Could not capture the canvas");
    return (await fetch(`/__shots/${name}.jpg`, { method: "POST", body: blob })).text();
  };
}
