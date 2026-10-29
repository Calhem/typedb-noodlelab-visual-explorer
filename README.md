# TypeDB Vehicle Explorer

An interactive 3D demonstration of how TypeDB models a complex physical system. An original,
unbranded autonomous electric SUV floats in a dark studio. It will separate into an exploded
assembly, and its parts will be explored through overlapping semantic perspectives (drivetrain,
autonomous driving, power and electronics, safety, failure impact) served from a TypeDB 3 database.

> The vehicle is an original concept built for this demonstration. It is not a production model
> and is not affiliated with or endorsed by any manufacturer.

## Status

| Phase | What | State |
|---|---|---|
| 1 | Asset research and plan | Done: original procedural vehicle chosen ([docs/asset-strategy.md](docs/asset-strategy.md)) |
| 2.1 | Assembled vehicle, studio lighting, opening screen | **Built, awaiting review** |
| 2.2 | Exploded view and Assembled ↔ Exploded scrubber | Next |
| 2.3 | Part selection and perspective highlighting (local data) | Planned |
| 3 | TypeDB schema, data, API and technical panel | Planned |

## Run it

Only Docker is needed; Node.js runs inside a container.

```bash
docker compose up web-dev
```

Then open http://127.0.0.1:5180. The first start installs dependencies and takes about a minute.

Tests and type checks (with the container running):

```bash
docker exec vx-web-dev sh -c "npx tsc -p . && npx vitest run"
```

## How it is built

- `web/src/vehicle/manifest.ts`: the component manifest, the single list of every part (stable id,
  name, assembly, category, shape, position, material). The scene and, later, the TypeDB data are
  both checked against these ids.
- `web/src/vehicle/body.ts`: the body shell, lofted through cross-sections and cut into panels.
- `web/src/vehicle/shapes.ts`: geometry for the mechanical and electronic parts.
- `web/src/vehicle/materials.ts`: physically based materials.
- `web/src/scene/`: the 3D studio (camera, lighting, turntable) and the vehicle renderer.
- React, TypeScript, Vite, Three.js, React Three Fiber and Drei.

Everything is generated in code: there are no third-party 3D model files and no licence restrictions.
