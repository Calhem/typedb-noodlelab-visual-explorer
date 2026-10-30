// Integration tests against the running semantic API and TypeDB (decision 0001, tests 1, 2 and 4 from the
// web app's side). They need the whole stack, so they only run when asked:
//   docker exec -e TYPEDB_INTEGRATION=1 noodlelab-web-dev npx vitest run src/semantic
// When asked, an unreachable API is a failure, not a skip.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARTS } from "../vehicle/manifest";

const API = process.env.API_URL ?? "http://127.0.0.1:8000";
const root = process.env.PROJECT_ROOT ?? join(__dirname, "../../..");

async function get<T>(path: string): Promise<{ data: T; typeql: string[] }> {
  const response = await fetch(`${API}/api/${path}`);
  expect(response.status, `${path}: ${response.status}`).toBe(200);
  return response.json();
}

describe.runIf(process.env.TYPEDB_INTEGRATION === "1")("the web app against TypeDB", () => {
  it("every part the web app draws is a component in TypeDB, and every component is drawn", async () => {
    const { data } = await get<{ id: string; asset: string; node: string }[]>("components");
    expect(data.map((c) => c.id).sort()).toEqual(PARTS.map((p) => p.id).sort());
  });

  it("TypeDB's visual references are the nodes the app loads from each model file", async () => {
    const { data } = await get<{ id: string; asset: string; node: string }[]>("components");
    const fromTypeDB = Object.fromEntries(data.filter((c) => c.asset !== "procedural").map((c) => [c.node, c.id]));
    const map = JSON.parse(readFileSync(join(root, "web/public/assets/corner-fr.map.json"), "utf8"));
    expect(fromTypeDB).toEqual(map.nodes);
  });

  it("component details and assembly paths are answered by TypeQL", async () => {
    const component = await get<{ name: string; types: string[] }>("components/brake-disc-fl");
    expect(component.data.types[0]).toBe("brake-disc");
    expect(component.typeql.join("\n")).toContain('has component-id "brake-disc-fl"');
    const assembly = await get<{ path: { id: string }[] }>("components/brake-disc-fl/assembly");
    expect(assembly.data.path.map((a) => a.id)).toEqual(["corner-fl", "chassis", "vehicle"]);
  });
});
