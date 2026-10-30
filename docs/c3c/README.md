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

## Step 2: suspension (30 October 2026)

Expected outcomes were written first (`docs/dependency-semantics.md`, "Suspension: expected outcomes", commit
`8c572f8`); the TypeDB tests check against them.

### What changed

- **Subframes, mounts, anti-roll bars** (new `blender/chassis.py` → `chassis.glb`, 218 KB, 12 parts):
  - Front and rear cast subframes. They have clevises for the lower-arm bushes and, at the rear, for the toe
    links.
  - Each subframe sits on **four rubber body mounts**, eight new parts
    (`front-subframe-mount-1..4`, `rear-subframe-mount-1..4`). Each mount is a cast boss with a rubber
    isolator, a spacer to the rail, and a bolt with its washer.
  - Front and rear **anti-roll bars**, each with two rubber bushes and clamps. Their bent ends meet the drop
    links clear of the damper forks.
- **Corners** (`blender/corner.py`, all four rebuilt). The ride-height model had parts passing through each
  other; once checked at 1.5 mm, these were fixed:
  - **Upper arm against the rim:** the ball joints moved and the arm's pivots widened.
  - **Calliper against the upper arm and tie rod:** the calliper was trimmed and its outboard bleed nipple
    removed.
  - **Disc shield against the lower arm:** the shield is notched at the ball joints and the steering arm.
  - **Spring against the upper arm:** the spring is slimmer.
  - **Brake hose:** rerouted.
  - The tie rod's inner joint was re-optimised for low bump steer.
- **Rear axle checked on its own.** It has its own toe links on the rear subframe and its own drop links to
  the rear bar.
- **Elsewhere:**
  - The 12 V battery moved.
  - The front HV cable and the 12 V harness were rerouted around the new mounts and the inverter.
  - Stand-in shapes were realigned. Rack: y 0.40, 0.88 m long.
- **Counts:** 392 components (+8 mounts), 511 connections, 337 dependencies, 78 vehicle functions.
- **New connections:**
  - every subframe mount ↔ its subframe and its rail (or the cabin floor);
  - upper arm ↔ rail;
  - drop link ↔ damper.

### Suspension semantics in TypeDB

The new functions are data in `data/seed/dependencies.yaml`, read by the existing reasoning; nothing in
`schema/functions.tql` changed.

| Function | Provided by | If lost |
|---|---|---|
| subframe location | each of the four mounts | **degraded** (the other three still hold it) |
| knuckle location | the subframe, for each lower arm | lost |
| wheel location | lower arm, upper arm | lost |
| wheel alignment | tie rod (front), toe link (rear, itself located by the rear subframe) | lost |
| load support | spring, via its top mount | **degraded** road holding: the corner rests on its bump stop |
| damping | damper, via its top mount | **degraded**: ride comfort and grip on rough roads |
| roll control | anti-roll bar, via both drop links | **degraded**: body roll and balance in corners |
| road holding (tyre) | knuckle (location, alignment), spring, damper, bar | lost or degraded, as above |

So the three levels the brief asked for come out of TypeDB:
- **Essential loss:** an arm, a tie rod or a toe link. The wheel loses road holding, and with it steering and
  braking at that wheel, through the existing dependencies.
- **Degraded handling:** a drop link, a bar or a subframe mount.
- **Ride comfort:** a damper or a spring degrades only. Nothing is lost.

New scenarios 28–35 (`api/tests/test_impact.py`, against a real TypeDB), with scenario 10 revised:

| # | Failure | Lost | Degraded | Must not appear |
|---|---|---|---|---|
| 28 | Front left lower arm | knuckle-fl wheel location; tyre-fl road holding | | other wheels; drive torque, braking, steering motion |
| 29 | Rear right spring | | tyre-rr road holding | anything lost |
| 30 | Front left damper | | tyre-fl road holding | anything lost |
| 31 | Rear left drop link | rear bar roll control | both rear tyres' road holding | front tyres |
| 32 | Front subframe mount 2 | | subframe location; both front arms, knuckles and tyres | anything lost; rear wheels |
| 33 | Front right tie rod | knuckle-fr alignment; tyre-fr road holding | | front left wheel |
| 34 | Rear right toe link | knuckle-rr alignment; tyre-rr road holding | | other wheels |
| 35 | Front left top mount | spring load support; damper damping | tyre-fl road holding | anything else lost |

### Kinematics and clearance through the envelope

`web/src/scene/kinematics.ts` solves each corner as a double wishbone with a tie rod (front) or toe link
(rear), using the models' own pickup points. `web/src/scene/travel.test.ts` places every moving part at each
pose:
- **Poses:** every corner at −80, 0 and +80 mm of wheel travel. The front corners also at −35°, 0° and +35° of
  steer in each position, which includes full lock at full bump and at full rebound. That is 24 poses.
- **What is checked:** the moving parts against everything around them, at 5 mm voxels. Any pair closer than
  about 5–9 mm is flagged.

| Front right | Camber | Toe | Rack |
|---|---|---|---|
| +80 mm (bump) | −1.7° | 0.13° out | |
| −80 mm (rebound) | −0.3° | 0.27° in | |
| ±35° at ride height | | | −70 / +85 mm |
| ±35° at +80 mm | | | −74 / +91 mm |

- **Steering axis:** about 9.3° of kingpin inclination and 4.3° of caster.
- **Bump steer:** no more than 0.27° through the full travel.
- **Steering range:** about −40° to +49° is reachable, so the ±35° target is met at every travel position.
- **Rear corners:** toe-in in bump, same magnitudes (see the simplifications below).
- **For step 3:** full lock needs up to 91 mm of rack travel per side. Typical racks give about ±75 mm.

**Result.**
- **Clean poses:** ride height straight ahead, and full bump straight ahead, at all four corners.
- **Open conflicts:** 43 pairs at 73 poses, all reported in `web/src/scene/travel-open.json`. The test fails if
  that list changes in either direction, so nothing is silently excluded.

| Where | Pairs per pose (both corners of the axle) | Typical pairs |
|---|---|---|
| Front, full rebound (−80 mm), any steer | 12–13 | drop link vs spring and tie rod; calliper vs tie rod; damper vs drive shaft |
| Front, full lock at ride height | 2–3 | tyre vs upper arm; drop link vs tie rod |
| Front, full lock at full bump | 9 | tyre vs upper arm and bar; drop link vs tyre, wheel and drive shaft; spring vs upper arm |
| Rear, full rebound only | 12 | tyre vs upper arm; calliper vs toe link; drop link vs spring and toe link |

**Root cause:** the upper arm sits inside the tyre's height. At lock the tyre swings into it, and at rebound
the knuckle drops the tie rod and drop link into the spring.

**Proposal (not done; needs your decision):**
- Move to a **high upper arm with a goose-neck knuckle**, so the upper joint sits above the tyre.
- Mount the drop link on the knuckle side of the damper.
- This changes the corner model and its kinematics, so I did not do it inside step 2.
- The alternative is a smaller envelope (for example ±30° or −60 mm), which you asked me not to adopt
  silently.

### Packaging and C3c-2

- **C3c-2 is resolved.** The group is gone from the packaging test.
  - The anti-roll-bar ends no longer sit inside the damper forks.
  - The real subframe takes the lower-arm bushes in its clevises, instead of a box through them.
- **Static check:** every model against its neighbours, at 6 mm. No unlisted clash. Known body-structure
  groups:
  - B1 sills: 36
  - B2 rails: 16
  - B3 cabin floor: 7
  - B4 rear doors: 4
  - B6 rear seat over the rear upper arms: 4 (new)
- **Body-structure clashes in motion:**
  - B1 157, B2 112, B3 22, B4 18
  - B5 arch liners: 18 (new)
  - B6: 12
  - B5 and B6 are new **tracked** body items in `docs/body-structure-backlog.md`, because the body is rebuilt
    in the next milestone. B1–B4 are kept and extended.
- **Designed contacts listed in the tests:** ball joints, bushes, the damper's eye, the drive shaft at the
  hub, lower arm and toe link to the subframe, drop link to bar, mount to rail.

### Simplifications (concept, documented)

- **Rear geometry:** the rear pickups are the front's, flipped front to back, with a toe link instead of a tie
  rod. Real rear multi-links differ. The rear poses are still solved and checked on their own.
- **No compliance:** no bush compliance and no tyre deflection. The spring is stretched along its axis, and the
  damper turns rigidly about its top mount.
- **Drive shaft:** it turns as a whole about its inner joint. Its pairs with its own drive unit are therefore
  listed as contacts here, and checked statically instead.
- **Brake hose:** left out of the motion check, because it is designed to bend.

### Performance and size

- **Benchmark (`__perf`, high tier, standard view):**
  - Assembled: 1.28 M triangles, 799 draw calls, 2.6 ms median frame.
  - Exploded: 0.81 M triangles, 781 calls, 9.1 ms.
  - At C3b: 674,000 triangles and 651 calls. Most of the increase is the
    detailed corners (three new ones in step 1); step 2 adds the 12 chassis parts.
- **Frame time (`perf.py`):**
  - High tier: GPU 15.8–21.9 ms, at a steady 60 fps except the explorer-open view (p90 33 ms).
  - Medium tier: 12.5–16.7 ms GPU, 60 fps.
- **Download and loading:**
  - 13.9 MB of models in all; the chassis adds 218 KB (103 KB light copy).
  - The 18 models load in 0.42 s from the local server.
  - The corner-sharing optimisation (~8 MB) stays in the backlog.

### Tests

- **Web:** 52 passed, 7 skipped (live-only). Includes the travel check (about 10 minutes) and static packaging.
- **API and TypeDB:** 86 passed.
- **Web against live TypeDB:** 7 passed.

### Renders

- `scripts/browser/suspension.py` renders the views below in a separate headless Chrome.
- Wheels are hidden in the axle views.

![Front suspension](suspension-front.jpg)
![Front suspension from behind](suspension-front-rear-view.jpg)
![Rear suspension](suspension-rear.jpg)
![Rear suspension from ahead](suspension-rear-front-view.jpg)
![Front subframe and mounts from below](subframes-mounts-front.jpg)
![Rear subframe and mounts from below](subframes-mounts-rear.jpg)
![A subframe mount: cast boss, rubber isolator, spacer to the rail, bolt](subframe-mount-close.jpg)
![Underside](underside.jpg)
