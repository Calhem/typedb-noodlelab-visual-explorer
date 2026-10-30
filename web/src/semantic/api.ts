// The only way the web app learns what components are and how they relate: named, read-only questions to
// the semantic API, which answers from TypeDB (docs/decisions/0001-typedb-sole-database.md).
// Every answer carries the exact TypeQL that produced it.
//
// There is no fallback data. If TypeDB (or the API) can't be reached, callers get an "unavailable" error
// and show it; the 3D model, which is a static asset, keeps working.

export interface Answer<T> {
  data: T;
  typeql: string[];
}

export type Failure = "unavailable" | "not-found" | "failed";

export class SemanticError extends Error {
  constructor(public readonly kind: Failure, message: string) {
    super(message);
  }
}

export const UNAVAILABLE = "TypeDB is not reachable, so semantic information cannot be shown. The 3D model still works.";

/** Every answer also tells the status indicator whether TypeDB is reachable, so it never lags behind. */
export const TYPEDB_STATUS_EVENT = "typedb-status";
const report = (available: boolean) => window.dispatchEvent(new CustomEvent(TYPEDB_STATUS_EVENT, { detail: available }));

export async function ask<T>(path: string, signal?: AbortSignal): Promise<Answer<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    report(false);
    throw new SemanticError("unavailable", UNAVAILABLE);
  }
  // 502/504: the development server could not reach the API itself.
  const available = ![502, 503, 504].includes(response.status);
  report(available);
  if (!available) throw new SemanticError("unavailable", UNAVAILABLE);
  const body = await response.json().catch(() => null);
  if (response.status === 404) throw new SemanticError("not-found", body?.message ?? "Not found in TypeDB.");
  if (!response.ok || !body || !("data" in body)) throw new SemanticError("failed", body?.message ?? "TypeDB could not answer.");
  return body as Answer<T>;
}

const id = (value: string) => encodeURIComponent(value);

// ---- Answers --------------------------------------------------------------------------------------------

export interface Named { id: string; name: string }

export interface ComponentDetails {
  id: string;
  name: string;
  description: string | null;
  type: string;
  /** the type and its supertypes, most specific first: e.g. brake-caliper, brake-component, chassis-component, component */
  types: string[];
  properties: { attribute: string; value: string | number }[];
}

export interface ComponentAssembly { assembly: Named; path: Named[] }

export interface ComponentSystem extends Named { description: string | null; parents: Named[] }

export interface Connection {
  kind: string;
  other: string;
  "other-name": string;
  "other-type": string;
  details: Record<string, string>;
}

/** A dependency seen from one side: the other component, and which function of each is involved. */
export interface Dependency extends Named {
  family: "physical" | "operational" | "control";
  kind: string;
  /** the dependent's function that relies on... */
  function: string;
  /** ...this function of the provider */
  needs: string;
  /** what happens to `function` if `needs` is lost / only degraded (null: nothing) */
  loss: "lost" | "degraded";
  degradation: "lost" | "degraded" | null;
  description: string | null;
  fallback: Named[];
}

export interface ComponentRelationships {
  connections: Connection[];
  needs: Dependency[];
  "needed-by": Dependency[];
  "control-loops": { name: string; description: string | null; role: string; system: string; "system-name": string }[];
}

/** A (component, function) reached from a failure or a requirement walk. */
export interface Reached extends Named { function: string; steps: number; via: string; kind: string }

export interface Impact {
  lost: (Reached & { "via-function": string })[];
  degraded: (Reached & { "via-function": string })[];
  fallbacks: (Named & { function: string; provider: string; "provider-name": string; needs: string; backup: string;
    "backup-name": string; description: string })[];
}

export interface Requirement extends Reached { role: "essential" | "backed up" | "supporting" }

export interface AssemblyDetails extends Named {
  description: string | null;
  parents: Named[];
  subassemblies: Named[];
  components: (Named & { type: string })[];
  "all-component-ids": string[];
}

export interface SystemSummary extends Named { description: string | null; parent: string | null }

export interface SystemDetails extends Named {
  description: string | null;
  subsystems: Named[];
  components: Named[];
  "control-loops": { name: string; description: string | null; controller: string; sensors: string[]; actuators: string[] }[];
}

export interface ComponentListing extends Named { type: string; asset: string; node: string }

export const semantic = {
  health: async () => {
    const response = await fetch("/api/health").catch(() => null);
    return response?.ok === true;
  },
  components: (s?: AbortSignal) => ask<ComponentListing[]>("components", s),
  component: (c: string, s?: AbortSignal) => ask<ComponentDetails>(`components/${id(c)}`, s),
  assemblyOf: (c: string, s?: AbortSignal) => ask<ComponentAssembly>(`components/${id(c)}/assembly`, s),
  systemsOf: (c: string, s?: AbortSignal) => ask<ComponentSystem[]>(`components/${id(c)}/systems`, s),
  relationships: (c: string, s?: AbortSignal) => ask<ComponentRelationships>(`components/${id(c)}/relationships`, s),
  impact: (c: string, s?: AbortSignal) => ask<Impact>(`components/${id(c)}/impact`, s),
  requirements: (c: string, s?: AbortSignal) => ask<{ required: Requirement[] }>(`components/${id(c)}/requirements`, s),
  assembly: (a: string, s?: AbortSignal) => ask<AssemblyDetails>(`assemblies/${id(a)}`, s),
  systems: (s?: AbortSignal) => ask<SystemSummary[]>("systems", s),
  system: (sys: string, s?: AbortSignal) => ask<SystemDetails>(`systems/${id(sys)}`, s),
};
