# C3c: mechanical completion (in progress)

Scope and order: `docs/c3c/audit.md` (approved). This file collects the results step by step; the full review
package is added at the end of C3c.

## Step 1: all four wheel corners (30 October 2026)

- **What changed.** The front-left, rear-right and rear-left corners are now Blender models (`blender/corner.py`
  builds all four). They replace simple placeholder shapes; every id is unchanged.
- **Front-left:** the front-right corner mirrored. The tyre is turned round instead, so its sidewall marking
  reads correctly.
- **Rear corners:** the front corner flipped front to back. The calliper now sits ahead of the axle, and the
  steering arm becomes the arm for the **toe link** (an adjustable link without the tie rod's rubber gaiter).
  Each rear calliper carries a new **electric parking-brake actuator** (`epb-actuator-rl`, `-rr`): a motor and
  gear unit on its inboard half. Its parking semantics follow in step 4.
- **Fallback shapes** (`?corner=procedural`) were realigned to where the real parts are. The asset test now
  checks every part's stand-in within 15 cm.

**Simplifications.**
- The rear corners reuse the front's disc, calliper, knuckle and arm sizes. Real rear brakes are usually
  smaller, and a multi-link rear knuckle has a different shape. Concept simplification.
- The toe link uses the tie rod's geometry without its gaiter.

**Packaging.** All four corners are now checked against their neighbours, and models against each other.
That exposed clashes the front-right corner had always had but which were never checked:
- B1 (sills): extended to every corner.
- New body-structure items B2 (chassis rails through the suspension), B3 (cabin floor into the rear arches)
  and B4 (rear doors into the rear tyres): `docs/body-structure-backlog.md`.
- Two placeholder-suspension items, marked "C3c-2", are fixed in step 2 (anti-roll-bar ends inside the damper
  forks; the subframe box through the lower arms' bushes).
- The 12 V harness, which ran through the rear-left damper, drop link and tyre, has been rerouted inboard and
  over the drive shaft.

Every known group is listed in the test and printed on every run. Anything new fails the check, and so does a
group that disappears without the list being updated.

**Sizes.** Each corner model is 1.98 MB, with a 0.79 MB light copy. The four corners now total 11.1 MB of the
download. The corners share their geometry, so loading one model and mirroring it in the browser could save
about 8 MB. Recorded for the final optimisation phase.

![Front left](corner-fl.jpg)
![Rear right, inboard: knuckle, toe link, forked damper, calliper with parking-brake unit](corner-rr-inboard.jpg)
