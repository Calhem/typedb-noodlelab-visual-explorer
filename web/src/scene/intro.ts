// The cinematic introduction (Phase E): the vehicle drives along a country road and stops; Begin flies the camera
// into the studio while the landscape dissolves into black. Outside React, like the explosion progress, so the scene
// reads it every frame without re-rendering the page. Pure timing functions are exported for the tests.
//
// Stages: "road" (driving in, then parked), "begin" (the transition into the studio) and "studio" (the explorer).
// The car ends the drive exactly where the studio shows it, so the transition only has to turn it to the studio
// angle and move the camera: one model, one scene, no reload.

import { useSyncExternalStore } from "react";

export type IntroStage = "road" | "begin" | "studio";

/** How far down the road the car starts (metres behind its parked position) and how long it takes to arrive. */
export const DRIVE_DISTANCE = 70;
export const DRIVE_SECONDS = 7.5;
/** How long Begin's camera flight and fade take. */
export const BEGIN_SECONDS = 2.8;
/** Rolling radius of the tyres (metres): a 275/45 R22 is 806 mm across, a little less under load (about 0.4 m).
 * Tuned by under a millimetre so the whole drive turns the wheels a whole number of fifths of a turn: the
 * wheels have five spokes and five nuts, so when the studio puts them back to their modelled angle nothing moves. */
const FIFTH = (2 * Math.PI) / 5;
export const TYRE_RADIUS = DRIVE_DISTANCE / (Math.round(DRIVE_DISTANCE / 0.4 / FIFTH) * FIFTH);
/** The studio shows the car turned this far (radians) on its turntable; on the road it points along the road. */
export const STUDIO_TURN = -0.5;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Smooth start and stop. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Distance still to go (metres) at time t of the drive: (1 - u)^3 of the whole, so the car arrives already at road
 * speed (about 100 km/h at first) and brakes progressively; its speed and its braking both fade to nothing as it
 * stops, so there is no jolt. */
export function remaining(t: number) {
  const u = clamp01(t / DRIVE_SECONDS);
  return DRIVE_DISTANCE * Math.pow(1 - u, 3);
}

/** The wheels' rotation (radians, about the axle) after the car has covered `distance` metres; negative because the
 * car drives along +x: rolling forward turns the wheel clockwise seen from its right side (+z). */
export const wheelAngle = (distance: number) => -distance / TYRE_RADIUS;

/** Overall progress of Begin's transition (0..1, eased) at time t since Begin. */
export const beginAmount = (t: number) => easeInOut(clamp01(t / BEGIN_SECONDS));

type Listener = () => void;

class IntroStore {
  stage: IntroStage = "road";
  /** seconds since the drive started (frozen once parked) and since Begin */
  driveTime = 0;
  beginTime = 0;
  /** where the car is when Begin is pressed, so it finishes its last metres during the transition */
  remainingAtBegin = 0;
  private listeners = new Set<Listener>();

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getStage = () => this.stage;

  /** Distance from the parked position (metres): the car sits at -this along the road. */
  get distance() {
    if (this.stage === "studio") return 0;
    if (this.stage === "begin") return this.remainingAtBegin * (1 - easeInOut(clamp01(this.beginTime / (BEGIN_SECONDS * 0.5))));
    return remaining(this.driveTime);
  }
  /** How far into the studio the scene is (0 on the road, 1 in the studio). */
  get studio() {
    return this.stage === "studio" ? 1 : this.stage === "begin" ? beginAmount(this.beginTime) : 0;
  }

  /** Start in the studio: skipping the introduction, ?intro=off, or reduced motion after Begin. */
  skip() {
    this.set("studio");
  }
  /** Reduced motion: the car is already parked when the scene appears. */
  park() {
    this.driveTime = DRIVE_SECONDS;
  }
  begin() {
    if (this.stage !== "road") return;
    this.remainingAtBegin = remaining(this.driveTime);
    this.beginTime = 0;
    this.set("begin");
  }
  /** Called once per frame by the scene. */
  tick(dt: number) {
    if (this.stage === "road") this.driveTime = Math.min(this.driveTime + dt, DRIVE_SECONDS);
    else if (this.stage === "begin") {
      this.beginTime += dt;
      if (this.beginTime >= BEGIN_SECONDS) this.set("studio");
    }
  }
  private set(stage: IntroStage) {
    this.stage = stage;
    for (const l of this.listeners) l();
  }
}

export const intro = new IntroStore();
export const useIntroStage = () => useSyncExternalStore(intro.subscribe, intro.getStage);
