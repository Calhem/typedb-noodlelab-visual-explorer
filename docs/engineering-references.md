# Engineering references and simplifications

The vehicle is an original, unbranded concept. Public sources inform its *layout and proportions*; none
of its numbers are measured from, or claimed for, any real product. Manufacturers named below are cited
only as published sources; they have no connection with this project.

## Drive units (C3a, 30 October 2026)

### Sources

| Topic | Source | What we took from it |
|---|---|---|
| Overall layout, ratio | Argonne National Laboratory, *D3 2020 Tesla Model 3* vehicle benchmarking page (anl.gov/taps/d3-2020-tesla-model-3): final drive 9.04:1; rear unit a six-pole interior permanent-magnet motor | A single-speed reduction of about 9:1 for a permanent-magnet traction motor; interior (buried) magnets |
| Two-stage reduction | Volkswagen's published description of its MEB single-speed gearbox (reported by InsideEVs, Automotive Powertrain Technology International, 2020): two stages, about 10:1, chosen to keep each gear small | A two-stage helical reduction on three parallel shafts rather than one large gear |
| Benchmarking teardowns | US DOE Vehicle Technologies Office, *Benchmarking state-of-the-art technologies* (ORNL motor and inverter teardown reports, energy.gov) | Typical arrangement of housing, water jacket, stator, rotor, resolver and inverter on the unit |
| SiC power module | Infineon, HybridPACK Drive CoolSiC press release and product pages (2021): a 1200 V silicon-carbide six-pack (three half-bridges) for traction inverters up to about 250 kW | One six-pack module on a pin-fin cold plate per inverter; 800 V class |
| Hairpin windings | Published papers on hairpin (bar-wound) stators, e.g. Berardi and Bianchi, *Design guideline of an AC hairpin winding*, ICEM 2018; Glaessel et al., laser welding of hairpin windings, 2017 | Bent crowns at one end, welded pin pairs at the other; two conductor layers per slot |
| Axle disconnect | US patents on EV drive-unit disconnects (for example US 12,011,995, *Electric drive unit with a disconnect assembly*; others in the same search describe a dog clutch engaged by a solenoid and opened by a spring on power loss); Chalmers and University of Zagreb papers on disconnect clutches and permanent-magnet drag losses | Front dog-clutch disconnect on the intermediate shaft; spring-opened, so it opens without 12 V or a VCU command |

### Concept numbers (design targets, not measurements)

| Item | Value | Note |
|---|---|---|
| Reduction | 21:61 then 17:53 = **9.06:1** | Stage 1 module 2.0 mm, helix 25°; stage 2 module 3.0 mm, helix 22°. Centre distances 90.5 mm and 113.2 mm |
| Front motor | 180 kW, 340 N·m; housing Ø 260 mm; core 170 mm long | 8 poles, 48 slots |
| Rear motor | 300 kW, 520 N·m; housing Ø 290 mm; core 210 mm long | 8 poles, 48 slots |
| Motor axis above the wheel axis | front 190 mm (30 mm behind), rear 190 mm (100 mm behind) | Lets the left drive shaft pass under the motor |
| Inverter | 300 × 85 × 400 mm on top of the motor | 800 V; front 200 kW, rear 330 kW (C1 values) |

### Simplifications and fictional assumptions

- **Geometry is representative, not designed.** Gear teeth are trapezoidal, not involute; helix twist and
  tooth counts are real, flank shapes are not. Bevel gears are tapered spur teeth. Gears are placed at their
  correct centre distances but not rotated into exact mesh.
- **Hidden internals are simplified:** no intermediate-shaft or differential bearings as separate parts, no
  seals, no oil passages, no stator slot liners, no rotor laminations visible as separate sheets.
- **The water jacket** is implied by the housing's coolant ports; the channel itself is not modelled.
- **Unequal-length drive shafts:** the left (motor-side) shaft starts with a long stub under the motor. Many
  front units add an intermediate shaft with its own support bearing to keep the shafts equal (torque
  steer); not modelled.
- **Mount positions** are plausible (two under the unit, one torque rod), not tuned for vibration.
- **Inverter internals** are arranged for legibility: one module, one capacitor block, two boards, one
  three-phase current sensor. Real units vary.
- **Dependencies** (docs/dependency-semantics.md): no sensorless fallback after a resolver failure; an
  electric oil pump; drive torque lost per side downstream of the differential (an open differential would
  in fact leave the other wheel with almost no torque; flagged for review).
