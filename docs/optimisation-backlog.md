# Optimisation backlog

Known performance costs, recorded so they are tackled deliberately rather than prematurely. Timings: M2 Pro,
TypeDB 3.14.1 in Docker, measured to the last answer.

| Item | Now | Notes and options | Recorded |
|---|---|---|---|
| **"Which single failures stop all propulsion?"** (Questions tab) | 5.1 s, one query (3.4 s at C2) | Runs `lost_steps` for every one of the 360 parts in one query; the C3a drive units added 32 parts and longer chains (about +50%), so it will keep growing with C3b. In the interface it shows "Asking TypeDB…" with **Cancel**, stays responsive, and a cancelled or superseded answer is ignored (the server finishes the query regardless). Options: start only from parts that provide some dependency (about a third of all parts); a dedicated function that follows only drive-torque-relevant edges; run per-part queries in parallel and stream results. | C2, 30 Oct 2026 |
| Failure impact for one part | 240-360 ms at C2; 380-400 ms with the C3a drive units, 4 queries | `degraded_steps` is the larger share (160-270 ms) and recomputes `lost_steps` it depends on. Options: one function returning (step, state) once TypeDB allows a variable assigned in several branches; or fetch lost and degraded steps in one query. | C1, 30 Oct 2026 |
| Requirements (reverse walk) | 80 ms | Acceptable. | C2 |
| High quality tier, GPU per frame | 16-20 ms at 1600x1000 with the drive units (15-19 ms before them; 34-79 ms before the fix) | Fixed in C3a (pixel ratio 1.5x, half-resolution occlusion above 3 million pixels). The drive units add about 1 ms of GPU and up to 2 ms of CPU per frame. Re-measure as mechanical detail grows. | C3a |
| Small API answers over HTTP | 5-44 ms where TypeDB takes under 1 ms | Connection overhead between the containers varies; not a TypeDB cost. Investigate keep-alive only if it becomes noticeable. | C3a |
