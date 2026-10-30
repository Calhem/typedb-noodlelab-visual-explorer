# Body-structure backlog

Known geometry problems in the body structure, kept visible until fixed. The packaging check
(`web/src/scene/packaging.test.ts`) reports each one on every run and fails if one disappears without this
list being updated, or if a new one appears.

| # | Problem | Seen as | Cause | Fix (proposed) | Recorded |
|---|---|---|---|---|---|
| B1 | **Sills run into the wheel arches** | Rear drive shafts and, since C3c checks all four corners, every corner's tyre, wheel, disc, calliper, shield, knuckle, hub and tie rod or toe link (36 pairs) pass through `sill-l` / `sill-r` | The sills are simple Phase A boxes from x -1.52 to 1.48 m; since the wheelbase change (axles at 1.58 and -1.45 m) both ends reach into the arches | Shorten the sills to end clear of the tyres (about x -1.02 to 1.15 m) with closing plates, or rebuild them with the body-structure work | C3a, 30 Oct 2026 |
| B2 | **Chassis rails run through the suspension** | `front-rail-*` and `rear-rail-*` (simple boxes at y 0.51-0.61 m, 0.46-0.59 m from the centre line) pass through the upper arms, springs, dampers and rear drop links (14 pairs) | The rails were placed before the suspension had real geometry; real rails rise over the suspension towers, and the dampers' top mounts sit in towers beside them | Rebuild the rails with the suspension towers in the body-in-white | C3c, 30 Oct 2026 |
| B3 | **Cabin floor reaches into the rear wheel arches and over the rear suspension** | `cabin-floor` (flat at 0.38-0.40 m, to x -1.30 m, 0.71 m wide either side) meets the rear tyres, wheels, knuckles and toe links (8 pairs), and since C3c step 2 the rear subframe's toe-link brackets and the rear drop links (3 more) | The floor was not cut back when the rear wheels became real models | Floor kicks up over the rear subframe at the rear seat crossmember, with wheel-arch inner panels | C3c, 30 Oct 2026 |
| B4 | **Rear doors reach into the rear tyres** | `door-structure-r*` and `door-trim-r*` meet `tyre-rl` / `tyre-rr` (4 pairs); in motion also `door-seal-r*` | The rear door's lower rear corner overlaps the wheel arch | Door shut line and arch shape in the exterior reconstruction | C3c, 30 Oct 2026 |

The drive-shaft clashes are the ones the packaging check can see (it checks drive-unit and battery parts
against their neighbours); the sill-tyre overlaps are recorded here from the bounding-box survey.
| B5 | **Front wheel arches too tight for steering and travel** | In motion only: at full lock and bump the front tyres reach `arch-liner-fl` / `-fr` (18 pose records in the C3c travel check) | The arch liners were sized for a static wheel | Size the arches from the wheel envelopes in docs/c3c/body-interfaces.md | C3c step 2 |
| B6 | **Rear seat sits over the rear suspension** | The rear upper arms' body pivots (x about -1.22 m, 0.62 m high, 0.47 m out) are inside `seat-rear` and `seat-back-rear` (4 static pairs, more in motion) | The simple rear seat was placed before the rear suspension had geometry | Move the rear seat forward of the rear suspension towers, or raise it on a heel kick-up | C3c step 2 |
