# Project notes for AI coding agents

## Who this is for
The project owner has no programming background and is learning as we go.
Explain new terms in plain English, keep steps small, and verify each step works before moving on.

## Approval gates
Stop at the end of every milestone and report what's done, what failed and what's next.
Phase 2 is the visual prototype (local data only): 2.1 assembled vehicle, 2.2 exploded view + scrubber,
2.3 selection + perspectives. Do not start TypeDB integration (Phase 3) until the visuals are approved.

## Rules
- **TypeDB is the only database** (permanent: docs/decisions/0001-typedb-sole-database.md). No other
  database, database client or browser storage for application data; `web/src/architecture.test.ts`
  enforces it. Static assets (GLB, textures, animation data) and seed files are allowed; the running app
  must get domain facts from TypeDB, and show an explicit error when TypeDB is unavailable.
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

## Git workflow
- `main` holds reviewed, working states only. Every commit on `main` passes the tests and the production
  build: `docker exec vx-web-dev sh -c "npx tsc -p . && npx vitest run && npx vite build"`.
- In-progress and experimental work lives on a feature branch (`feature/<milestone>-<topic>`, e.g.
  `feature/m2.2-mechanical`). Commit each completed, tested step there and push it; merge into `main`
  only after the owner has reviewed it (normally at a phase checkpoint).
- Commit messages: a short imperative summary, then a body saying what changed and why, ending with the
  co-author line. Never commit secrets (`.env`) or review screenshots (`web/shots/`).
- Generated 3D assets (`web/public/assets/*.glb`) are committed because the app needs them (no Git LFS
  here); keep them compressed and regenerate rather than hand-edit.
- Remote: private GitHub repository `Calhem/typedb-vehicle-explorer`. There is no `gh` CLI: use the
  GitHub website in the browser pane; pushes use the macOS keychain credential helper.

## Blender pipeline (approved for mechanical systems; full rebuild follows docs/mechanical-upgrade-plan.md once approved)
- `blender/` holds Python scripts that model parts with Blender's `bpy` (5.2.3, isolated uv env in
  `blender/.venv`; it runs on the Mac, not Docker: there is no Linux ARM wheel). Rebuild the corner with
  `uv run --project blender python -I blender/corner.py` → `web/public/assets/corner-fr.glb`.
- Every top-level GLB node is named by a manifest component id; `web/src/scene/assets.test.ts` checks it.
  Material names in Blender are roles matched by `web/src/vehicle/studioMaterials.ts`.
- `import bpy` must come before `import bmesh` / `mathutils`.
- Comparison switches: `?corner=procedural` (old corner), `?fx=off` (no ambient occlusion / effects).

## Checking visuals in the Claude browser pane
The pane throttles animation when it is in the background, and screenshots can lag one frame.
In development the app installs helpers (`web/src/scene/devtools.ts`): `window.__vx` (React Three Fiber
state), `window.__vxProgress`, and `await __shot(progress, turntableAngle?, cameraPolarAngle?)`, which
renders a settled frame. Call `__shot` twice before a screenshot. Click "Explore the vehicle" first.
Emulated large viewports can freeze the pane; instead keep the pane's own size and call
`__size(1440, 900, 1.5)` to render at a fixed resolution, `__focus(p, ids, azimuth, elevation, distance, only?)`
for repeatable close-ups, and `await __save(name)` to write web/shots/<name>.jpg (git-ignored).
