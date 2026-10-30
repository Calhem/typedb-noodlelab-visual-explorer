# Optimisation backlog

Known performance costs, recorded so they are tackled deliberately rather than prematurely. Timings: M2 Pro,
TypeDB 3.14.1 in Docker, measured to the last answer.

| Item | Now | Notes and options | Recorded |
|---|---|---|---|
| **"Which single failures stop all propulsion?"** (Questions tab) | 3.4 s, one query | Runs `lost_steps` for every one of the 328 parts in one query. In the interface it shows "Asking TypeDB…" with **Cancel**, stays responsive, and a cancelled or superseded answer is ignored (the server finishes the query regardless). Options: start only from parts that provide some dependency (about a third of all parts); a dedicated function that follows only drive-torque-relevant edges; run per-part queries in parallel and stream results. | C2, 30 Oct 2026 |
| Failure impact for one part | 240-360 ms, 4 queries | `degraded_steps` is the larger share (160-270 ms) and recomputes `lost_steps` it depends on. Options: one function returning (step, state) once TypeDB allows a variable assigned in several branches; or fetch lost and degraded steps in one query. | C1, 30 Oct 2026 |
| Requirements (reverse walk) | 80 ms | Acceptable. | C2 |
| High quality tier, GPU per frame | 15-19 ms at 1600x1000 (was 34-79 ms) | Fixed in C3a (pixel ratio 1.5x, half-resolution occlusion above 3 million pixels). Re-measure as mechanical detail grows. | C3a |
