# Component id register

Component ids are permanent: once used, an id is never renamed or reused (decision 0001). Until the
TypeDB phase, the full list lives in `web/src/vehicle/manifest.ts`; after it, TypeDB is authoritative and
this file records changes for reviewers.

When a component is split into several independently meaningful parts, the original id keeps its
meaning where possible, and each new part gets a new id, recorded here with its parent assembly and the
relationships it will carry in TypeDB.

## Milestone 2.2 (uncommitted): splits and additions so far

| Original | Now | Parent assembly | Notes for the semantic model |
|---|---|---|---|
| `coilover-{c}` (spring and damper) | `coilover-{c}` = damper only; new `spring-{c}`, `top-mount-{c}` | front / rear suspension | spring and damper are separate components; both mechanically connected to the top mount |
| `brake-pads-{c}` (never committed) | `brake-pad-inner-{c}`, `brake-pad-outer-{c}` | wheel end | both actuated by `caliper-{c}` in the braking function |
| `wheel-nuts-{c}` (never committed) | `wheel-nut-{c}-1` ... `-5` | wheel end | fasteners joining `wheel-{c}` to `hub-{c}` |
| `seat-front-{s}`, `seat-rear` (whole seats) | `seat-front-{s}` / `seat-rear` = cushion; new `seat-back-…`, `headrest-…`, `seat-frame-…` | interior | seat assemblies may become their own sub-assemblies in TypeDB |
| `{key}-gear-set` (never committed) | `{key}-reduction-gear`, `{key}-pinion`, `{key}-differential` | drive unit | gear train: pinion driven by rotor shaft, drives reduction gear, which drives differential |

| (new) | `brake-hose-{c}` | wheel end | carries brake fluid to `caliper-{c}`; mechanically connected to the body |
| (new) | `hub-nut-{c}` | wheel end | fastener joining the drive shaft to `hub-{c}` |

`{c}` = corner (`fl`, `fr`, `rl`, `rr`); `{s}` = side (`l`, `r`); `{key}` = `front` or `rear`.
All other milestone-2.2 additions are new parts with new ids (see `manifest.ts`).

## Added for C1 (dependency semantics, 30 October 2026)

| Id | Assembly | Why |
|---|---|---|
| `brake-pedal` | brake-control | The driver's brake demand, and the mechanical fallback when the booster fails |
| `master-cylinder` | brake-control | Between the pedal/booster and the ESC hydraulic unit; the fallback path when the ESC module fails |
