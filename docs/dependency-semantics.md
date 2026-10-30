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
