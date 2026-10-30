# Dependency semantics: review (30 October 2026)

Status: **review for the owner. No schema or data changed.** The recommendations at the end are proposals.

## What a dependency means today

`dependency (dependent: X, provider: Y)` with a `dependency-kind` reads: *X cannot do its job without Y*.
The failure-impact question follows these edges transitively: if Y fails, everything reachable from Y is
reported as "stopping working".

That rule is only sound when three things hold for every edge:

1. **Loss, not degradation.** Losing Y really stops X, rather than making it weaker, slower or less safe.
2. **One function.** X has only the function that Y supports. A tyre that loses drive torque still rolls,
   steers, brakes and carries load, so "the tyre stops working" overstates it.
3. **No redundancy.** X has no other provider that can stand in, and no mechanical fallback.

Our data breaks each of these in places. The result is answers that are mechanically traceable but
misleading as stated.

## Three families of dependency

The seven kinds fall into the three families you named. They behave differently under failure.

| Family | Kinds in our data | What flows | How a loss behaves |
|---|---|---|---|
| **Physical** | `support`, `torque` | Load paths and mechanical power: a pad pressed by a piston, torque through shaft, gears and hub | Mostly a hard loss of *that* mechanical function, but it does not destroy the dependent's other functions (a hub still carries the wheel without drive torque) |
| **Operational** | `power`, `cooling`, `hydraulic` | Energy or a working medium: electricity, coolant, brake fluid pressure | Electrical supply loss is usually a hard stop; cooling loss is usually a **derating** over time; hydraulic loss depends on fallback paths |
| **Control system** | `control`, `data` | Commands and sensor information | Usually **degradation**: control units are designed to fall back to safe modes, and most sensors have substitutes or are only needed by one sub-function |

## The 14-step chain from the 12 V battery to the rear tyres

```
lv-battery -power-> lv-harness -power-> vcu -control-> rear-gate-driver -control-> rear-power-module
  -power-> rear-stator -torque-> rear-rotor -torque-> rear-rotor-shaft -torque-> rear-pinion
  -torque-> rear-reduction-gear -torque-> rear-differential -torque-> rear-halfshaft-l
  -torque-> hub-rl -torque-> wheel-rl -torque-> tyre-rl
```

| Steps | Verdict | Reasoning |
|---|---|---|
| 1-2: 12 V battery → harness → VCU (power) | **Sound** | The vehicle control unit runs on 12 V. Real EVs keep 12 V alive from the DC-DC converter while the high-voltage system is up, but a failed 12 V battery at start-up, or a 12 V short, does take the control units down. This is the classic "12 V failure immobilises an EV" case. |
| 3-4: VCU → gate driver → power module (control) | **Sound, with a caveat** | With no torque request the inverter produces no torque. Missing in our data: the gate driver also needs its own 12 V supply, which is a second, independent route to the same conclusion. |
| 5-6: power module → stator → rotor | **Sound** | No phase current, no rotating field, no rotor torque. |
| 7-12: rotor → shaft → pinion → gear → differential → drive shaft | **Sound** | This is the drive torque path, a series chain with no alternative. |
| 13-15: drive shaft → hub → wheel → tyre | **Defensible only as "no drive torque reaches the tyre"** | The hub, wheel and tyre all have other functions (bearing the load, braking, steering, grip) that do not depend on drive torque. As written, "the rear-left tyre stops working" is false. |

**Conclusion:** the chain is a correct trace of *how drive torque would be lost*, and the end-to-end
statement "a 12 V failure leaves the vehicle unable to drive" is defensible. Saying that each part on the
chain "stops working" is not. The fault is in the **semantics of the edge, not in its direction**:
a `torque` dependency means "receives drive torque from", and the question should report which
**function** is lost.

## Relationships that produce misleading conclusions (flagged)

Measured with the live impact query on 30 October 2026.

| # | Data | Today's answer | Reality | Severity |
|---|---|---|---|---|
| 1 | `vcu ← wheel-speed-sensor-*` (data, "for traction control"), `esc-module ← wheel-speed-sensor-*` (data, "for anti-lock braking") | One failed wheel-speed sensor "stops" **50 components**, including both drive units, all four tyres and every calliper | A failed sensor disables traction control and anti-lock braking (a warning light); the car still drives and the friction brakes still work | **High**: a safety-related misstatement |
| 2 | `brake-hose-* ← esc-module` (hydraulic), `esc-module ← brake-booster` (hydraulic), `brake-booster ← lv-harness` (power) | Brake booster or 12 V failure "stops" all four callipers | Brake systems are designed with a mechanical or hydraulic fallback: the pedal still applies the brakes (with more force) when the booster or the ESC fails | **High**: a safety-related misstatement |
| 3 | `steering-rack ← eps-motor` (torque) | Power-steering motor failure "stops" the rack and tie rods | Steering still works through the column, just heavier (manual fallback). The data has both providers, but the impact walk treats any single lost provider as a total loss | Medium |
| 4 | `ad-compute ← each sensor` (data) | Losing one camera "stops" the automated-driving computer | Perception degrades; the system may hand over to the driver, but the computer does not stop | Medium |
| 5 | `battery-module-* ← battery-cooling-plate` (cooling), `radiator ← cooling-fan-*` | A coolant-pump failure "stops" 63 components including the whole drive | Loss of cooling makes the battery management system limit power, and eventually stop, over minutes. A derating, not an instant loss | Medium |
| 6 | Cooling loop back into the pack: module → busbar → junction box → PDU → heat-pump compressor → chiller → manifold → cooling plate → modules | One failed module "stops" the other 15 modules (through the cooling circuit) | Modules in series do share one fate (an open module stops the string, which is correct), but the route through the cooling circuit is an artefact of chaining a derating edge | Low: the conclusion is accidentally right, the reasoning wrong |
| 7 | `hub-* ← halfshaft`, `wheel-* ← hub`, `tyre-* ← wheel` (torque) | Drive-shaft failure "stops" the tyre | Only drive torque is lost (see the chain above) | Low, if the wording is fixed |

Sound as modelled: the high-voltage series path (modules → busbars → junction box → PDU → harness →
inverter), the BMS closing the contactors (a deliberate fail-safe), torque transmission inside each drive
unit, and the hydraulic supply from hose to calliper.

## Recommendations (for decision; not implemented)

Small, targeted changes. No redesign:

1. **Make the three families explicit in the schema.** Make `dependency` abstract, with subtypes
   `physical-dependency`, `operational-dependency` and `control-dependency`, keeping `dependency-kind`.
   Queries could then ask, for example, "only physical dependencies".
2. **Add the effect of a loss.** An attribute `loss-effect` with the values `function-lost` and `degraded`.
   The impact function follows only `function-lost` edges and reports `degraded` dependents as end points
   ("degraded: traction control unavailable"). This alone fixes flags 1, 4, 5 and 6.
3. **Say which function is lost.** An attribute `affected-function` on the edge (for example "drive
   torque", "power assistance", "anti-lock braking"), so answers read "tyre-rl: loses drive torque"
   instead of "tyre-rl stops working". This fixes flag 7 and the chain wording.
4. **Model fallbacks and redundancy explicitly.** A relation `redundancy (group-member, ...)` or an
   attribute `fallback` on the dependency, so a dependent with an alternative provider (manual steering,
   mechanical brake push-through) is degraded, not lost, when one provider fails. This fixes flags 2 and 3.
   It is a natural fit for TypeDB: "X is lost only if all members of this group are lost" is a rule a
   recursive function can express.
5. **Interim wording (UI only, done in this commit).** The button now reads "If this fails, what is
   affected?" and the summary reads "components affected", not "stop working", until 1-4 are decided.

Recommendations 2 and 3 are the most valuable for a demonstration: they show TypeDB reasoning that is
honest about degradation, which is exactly what an engineering audience will probe.

---

# C1: the corrected model and expected outcomes (written before implementation, 30 October 2026)

Approved by the owner with one refinement: **no blanket rule that degradation never propagates.** A degraded
function can make a higher-level function unavailable; propagation follows the affected function and the
available fallbacks.

## The model

**States belong to functions, not whole components.** A component can have several functions (the ESC
module provides *brake pressure*, *anti-lock braking* and *stability control*); a failure can take away one
and leave the others. Functions are first-class entities in TypeDB (`vehicle-function`), shared across
components (many parts carry *drive torque*).

**Every dependency is a four-role relation:**
`dependency (dependent: C, affected-function: F, provider: P, required-function: G)`:
"C's function F needs P's function G". It is one of three subtypes, by family:
`physical-dependency` (support, torque), `operational-dependency` (power, cooling, hydraulic) or
`control-dependency` (control, data). Each has:

- `loss-effect`: what happens to C's F when P's G is **lost**: `lost` or `degraded`.
- `degradation-effect` (optional): what happens when P's G is only **degraded**: `lost`, `degraded`, or
  (if absent) nothing. **This is how degradation propagates**, where engineering says it does (reduced
  pack power reduces drive power), and only there.
- Optionally a **fallback**: `fallback (protected: <the dependency>, backup: B)`. If P's G is lost but the
  backup B still works, the effect is `degraded` instead of `lost` (the pedal still brakes without the
  booster).

**A failure** of component X means all of X's functions are lost. The impact is the fixed point of applying
the rules above, starting from X. `lost` wins over `degraded` for the same function. The result has three
parts: **lost** functions, **degraded** functions, and **fallbacks in use**.

Single-failure analysis: a fallback is counted as available unless the backup itself is the failed part or
loses a function in the same failure. (The tests check this independently for every component.)

**New components needed by the fallbacks:** `brake-pedal` (type `driver-control`) and `master-cylinder`
(type `brake-component`), both in the brake-control assembly. The braking path becomes: pedal and booster →
master cylinder → ESC hydraulic unit → hoses → callipers. The pedal and the booster are each other's
fallback for brake pressure.

## Expected outcomes (the tests assert these)

Notation: *component: function*. "Must not" lists what the answer must **not** contain.

| # | Failure | Lost | Degraded | Fallback in use | Must not |
|---|---|---|---|---|---|
| 1 | **Wheel-speed sensor (front left)** | ESC module: anti-lock braking, stability control; VCU: traction control; AD computer: automated driving (it requires stability control) | | | any calliper: clamping force; any tyre: drive torque; ESC module: brake pressure |
| 2 | **Brake booster** | AD computer: automated driving (automatic braking needs the booster) | master cylinder, ESC module, all hoses: brake pressure; all callipers: clamping force; all pads: friction braking | pedal for the master cylinder | any calliper or pad lost |
| 3 | **12 V battery** | harness and every 12 V control unit; BMS: battery supervision → junction box: HV supply → PDU → both inverters → all four tyres: drive torque; ESC: anti-lock braking; booster: brake assistance; rack: steering assistance; AD | master cylinder, ESC, hoses, callipers, pads (manual braking via the pedal) | pedal for the master cylinder | any calliper or pad lost; tie rods: steering motion lost |
| 4 | **Coolant pump** | coolant lines and manifold: coolant flow; cooling plate: cell cooling | all 16 modules: cell power; busbars, junction box, PDU, inverters, and through them all four tyres: drive torque (reduced power) | | any tyre: drive torque lost; any module lost |
| 5 | **Power-steering motor** | rack: steering assistance; AD computer: automated driving | | | tie rods or rack: steering motion |
| 6 | **Front gate driver** | front power module, stator, rotor, shaft, gears, front drive shafts, front hubs, wheels and tyres: drive torque | | | any rear part: drive torque |
| 7 | **Battery module 5** (one of 16 in series) | left busbar: pack current → junction box → all propulsion (an open module stops the series string) | cooling plate: cell cooling (heat pump lost, so no chilling) | | any other module lost (the old artefact through the cooling loop) |
| 8 | **ESC module** | its anti-lock braking and stability control; AD computer: automated driving | all hoses: brake pressure; callipers: clamping force; pads (valves fail open: unmodulated braking) | master cylinder for each hose | any calliper or pad lost |
| 9 | **Front-left brake hose** | front-left calliper: clamping force; front-left pads: friction braking | | | any other wheel's brakes |
| 10 | **Steering rack** | tie rods: steering motion; AD computer: automated driving | | | |

The 12 V case (3) keeps the defensible part of the old 14-step chain, now worded as functions: the tyres lose
*drive torque* (not "stop working"), braking is degraded rather than lost, and steering remains (heavier).

---

## Drive units in detail: expected outcomes (C3a, 30 October 2026)

Written before the C3a data was loaded. The drive units gain the parts a real unit has between the battery
harness and the wheels, and each joins the function chains where it physically sits:

- **DC side:** harness → **HV connector** → DC busbars → DC-link capacitor → power module.
- **Control:** VCU torque request → **motor-control board**, which also needs the **resolver** (rotor angle)
  and the **current sensor** (phase currents) → gate driver → power module. The VCU no longer talks to the
  gate driver directly.
- **AC side:** power module → **phase busbars** → stator.
- **Torque:** rotor shaft → input pinion → **intermediate gear** → (front: **disconnect clutch** →)
  **intermediate shaft** → final-drive gear → differential → **spider gears** → **side gear** (one per side) →
  drive shaft → hub.
- **Oil:** the electric **oil pump** (12 V) feeds the **oil cooler**, which passes the heat to the coolant
  lines. Losing oil flow *degrades* the gear train (splash lubrication only); losing oil cooling *degrades*
  the stator (torque limited). New dependency kind `lubrication` (operational family).
- **Front disconnect** needs 12 V and the VCU's command: a spring opens it without them. **Rear park lock**
  needs the VCU's park command; it carries no drive torque, so its failure takes no drive function.

| # | Failure | Lost | Degraded | Must not |
|---|---|---|---|---|
| 4 (revised) | **Coolant pump** | as before, **plus both oil coolers: oil cooling** (their heat goes into the same coolant) | as before, plus both stators: magnetic field | any tyre: drive torque lost; any module lost |
| 11 | **Front resolver** | front control board: motor control → gate driver → power module → … → front tyres: drive torque | | any rear part |
| 12 | **Rear oil pump** | rear oil cooler: oil cooling | rear stator, rear gear train, rear drive shafts, hubs, wheels, tyres: drive torque (limited) | any tyre: drive torque lost |
| 13 | **Front disconnect clutch** | front intermediate shaft, final-drive gear, differential, front drive shafts → front tyres: drive torque | | the front motor's own functions (stator, rotor); any rear part |
| 14 | **Rear left side gear** | rear-left drive shaft, hub, wheel, tyre: drive torque | | the rear-right wheel (see the caveat below) |
| 15 | **Rear park lock** | nothing | nothing | any drive torque |
| 16 | **Front HV connector** | front DC busbars, capacitor, power module, … → front tyres: drive torque | | any rear part |

**Caveat for review (14, and the existing drive-shaft cases):** with an *open* differential, a broken side gear
or drive shaft leaves the other wheel of that axle with almost no torque too, because an open differential
passes equal torque to both sides and the broken side resists nothing. The model keeps the approved C1
per-side rule; correcting it would mean "a broken drive shaft loses drive at both wheels of its axle".
Proposed for decision, not implemented.

New assumptions, added to the table below: the resolver has no sensorless fallback (a failed resolver stops
that axle's motor); the oil pump is electric (12 V), not driven by the gears.

## What the tests do and do not establish (C2, 30 October 2026)

The impact tests compare TypeDB's answer with an independent Python implementation of the same rules, for
every component as the failed part. Agreement shows **computational consistency**: TypeDB applies the
modelled rules correctly and completely. It does **not** validate the engineering assumptions themselves,
because both implementations read the same dependency data. Whether each dependency, effect and fallback is
right is a matter of engineering review, not testing.

The assumptions that most shape the answers, for review:

| Assumption | Effect on answers | Basis |
|---|---|---|
| The 12 V supply has no redundancy (one battery, one harness) | A 12 V failure loses all propulsion (via the BMS and contactors) | Common in current EVs; some have a second supply for safety systems |
| The BMS must hold the contactors closed | BMS loss opens the high-voltage circuit | Standard fail-safe design |
| Modules are in one series string | Any module failure (open circuit) stops propulsion | Typical 800 V packs; partial-module failures that do not open the circuit are not modelled |
| Loss of cooling degrades rather than stops | Coolant-pump failure reduces power, nothing lost | BMS and inverter derating; over a long period this could become a stop |
| Brake hydraulics fail open through the ESC unit | ESC failure leaves unmodulated braking | Standard design intent |
| Pedal and booster are each other's fallback for brake pressure | Booster failure degrades braking | Mechanical push-through; booster-only braking on electronic demand |
| Automated driving requires stability control, booster, power steering, rack, VCU and gateway | Any of these loses automated driving | A deliberately conservative safety rule |
| One wheel-speed sensor missing switches off anti-lock braking, stability and traction control | Sensor failure loses those functions, not braking | Typical behaviour (warning light) |
| Single failures only; degradation has no magnitude | Answers do not combine failures or say "how much" | Scope of this model |
| A resolver failure stops its motor (no sensorless fallback) | Resolver or current-sensor failure loses that axle's drive | Many production inverters do the same; some can continue sensorless at reduced performance |
| Drive-unit oil pumps are electric (12 V) | Oil-pump failure degrades that axle's torque (splash lubrication and hotter windings) | Common in recent units; some use a gear-driven pump instead |
| Drive torque is lost per side downstream of the differential | A side-gear or drive-shaft failure loses only that wheel's drive | Simplification: with an open differential the other wheel loses most of its torque too (see the C3a caveat) |
