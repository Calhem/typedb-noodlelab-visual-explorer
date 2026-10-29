# Project notes for AI coding agents

## Who this is for
The project owner has no programming background and is learning as we go.
Explain new terms in plain English, keep steps small, and verify each step works before moving on.

## Approval gates
Stop at the end of every milestone and report what's done, what failed and what's next.
Phase 2 is the visual prototype (local data only): 2.1 assembled vehicle, 2.2 exploded view + scrubber,
2.3 selection + perspectives. Do not start TypeDB integration (Phase 3) until the visuals are approved.

## Rules
- The vehicle is original and unbranded. No manufacturer names, logos or claims of endorsement.
  Never present invented specifications as real; label the vehicle as a concept.
- `web/src/vehicle/manifest.ts` is the single list of parts. Part ids are stable: never rename one.
  Every displayed relationship must later be backed by TypeDB data; never fake query results in the frontend.
- Node.js is not installed on the host: run npm, tsc and vitest inside the `vx-web-dev` container
  (`docker exec vx-web-dev ...`). Docker's CLI is at `~/.docker/bin/docker`.
- Ports: 5180 (web dev). Reserved for later: 1733 (TypeDB), 8004 (TypeDB Studio), 8092 (web).
  Other projects on this machine use 1729-1732, 8002-8003, 8090-8091. Bind everything to 127.0.0.1.
- TypeDB is 3.x only (3.14.1). See the TypeDB notes in ../typedb-cyber-intel/CLAUDE.md; log TypeDB
  friction in ../typedb-cyber-intel/notes/typedb-feedback.md.

## Checking visuals in the Claude browser pane
The pane throttles animation when it is in the background. In development the app exposes the
React Three Fiber state as `window.__vx`; render a frame on demand with
`__vx.setFrameloop('never'); __vx.advance(performance.now())` before taking a screenshot.
