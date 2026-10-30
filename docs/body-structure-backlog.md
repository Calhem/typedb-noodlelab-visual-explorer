# Body-structure backlog

Known geometry problems in the body structure, kept visible until fixed. The packaging check
(`web/src/scene/packaging.test.ts`) reports each one on every run and fails if one disappears without this
list being updated, or if a new one appears.

| # | Problem | Seen as | Cause | Fix (proposed) | Recorded |
|---|---|---|---|---|---|
| B1 | **Sills run into the wheel arches** | Rear drive shafts pass through `sill-l` / `sill-r`; the sill boxes also pass through all four tyres | The sills are simple Phase A boxes from x -1.52 to 1.48 m; since the wheelbase change (axles at 1.58 and -1.45 m) both ends reach into the arches | Shorten the sills to end clear of the tyres (about x -1.02 to 1.15 m) with closing plates, or rebuild them with the body-structure work | C3a, 30 Oct 2026 |

The drive-shaft clashes are the ones the packaging check can see (it checks drive-unit and battery parts
against their neighbours); the sill-tyre overlaps are recorded here from the bounding-box survey.
