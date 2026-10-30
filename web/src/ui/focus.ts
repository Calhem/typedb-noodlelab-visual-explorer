// A "focus" is a semantic perspective on the 3D model: the components TypeDB returns for one question
// (an assembly's contents, a system's members, a failure's impact) are highlighted and the rest is ghosted.
// Two highlight levels: "primary" (in the assembly or system; a function lost; essential to the part) and
// "secondary" (a function degraded; backed up or merely supporting).

import { useCallback, useState } from "react";
import { SemanticError, semantic, type AssemblyDetails, type Impact, type Requirement, type SystemDetails, type TypeDetail } from "../semantic/api";

export type FocusKind = "assembly" | "system" | "impact" | "requirements" | "type";
export type Level = "primary" | "secondary";

export interface FocusRequest {
  kind: FocusKind;
  /** the assembly, system or component id the question is about */
  key: string;
  /** the selected component the question was asked from */
  anchor: string;
}

export interface Focus extends FocusRequest {
  title: string;
  /** component id -> highlight level; components not listed are ghosted */
  ids: Map<string, Level>;
  typeql: string[];
  "timings-ms": number[];
  impact?: Impact;
  requirements?: Requirement[];
  /** the answer behind an assembly or system focus, so views can show it without asking again */
  assembly?: AssemblyDetails;
  system?: SystemDetails;
  typeDetail?: TypeDetail;
}

export type FocusError = { request: FocusRequest; kind: SemanticError["kind"]; message: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Highlight levels for a set of (component, level) entries: a component listed as primary anywhere is primary. */
function levels(entries: [string, Level][]) {
  const map = new Map<string, Level>();
  for (const [id, level] of entries) if (map.get(id) !== "primary") map.set(id, level);
  return map;
}

export function useFocus() {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [error, setError] = useState<FocusError | null>(null);

  const request = useCallback(async (req: FocusRequest) => {
    // Asking the same question again turns the perspective off.
    if (focus && focus.kind === req.kind && focus.key === req.key) {
      setFocus(null);
      return;
    }
    setError(null);
    try {
      if (req.kind === "assembly") {
        const { data, typeql, "timings-ms": timings } = await semantic.assembly(req.key);
        const ids = levels(data["all-component-ids"].map((id) => [id, "primary"]));
        setFocus({ ...req, title: `${data.name}: ${plural(ids.size, "component")}`, ids, typeql, "timings-ms": timings, assembly: data });
      } else if (req.kind === "system") {
        const { data, typeql, "timings-ms": timings } = await semantic.system(req.key);
        const ids = levels(data.components.map((c) => [c.id, "primary"]));
        setFocus({ ...req, title: `${data.name}: ${plural(ids.size, "component")}`, ids, typeql, "timings-ms": timings, system: data });
      } else if (req.kind === "type") {
        const { data, typeql, "timings-ms": timings } = await semantic.type(req.key);
        const ids = levels(data.instances.map((i) => [i.id, "primary"]));
        setFocus({ ...req, title: `Every ${data.type.replace(/-/g, " ")}: ${plural(ids.size, "component")}`, ids, typeql,
          "timings-ms": timings, typeDetail: data });
      } else if (req.kind === "impact") {
        const { data, typeql, "timings-ms": timings } = await semantic.impact(req.key);
        const ids = levels([[req.key, "primary"], ...data.lost.map((x): [string, Level] => [x.id, "primary"]),
          ...data.degraded.map((x): [string, Level] => [x.id, "secondary"])]);
        const title = data.lost.length + data.degraded.length === 0
          ? "If it fails: no other function is affected"
          : `If it fails: ${plural(data.lost.length, "function")} lost, ${data.degraded.length} degraded`;
        setFocus({ ...req, title, ids, typeql, "timings-ms": timings, impact: data });
      } else {
        const { data, typeql, "timings-ms": timings } = await semantic.requirements(req.key);
        const ids = levels([[req.key, "primary"], ...data.required.map((x): [string, Level] =>
          [x.id, x.role === "essential" ? "primary" : "secondary"])]);
        const essential = data.required.filter((r) => r.role === "essential").length;
        setFocus({ ...req, title: `To work it needs ${plural(data.required.length, "function")} (${essential} essential)`, ids, typeql, "timings-ms": timings,
          requirements: data.required });
      }
    } catch (e) {
      setFocus(null);
      if (e instanceof SemanticError) setError({ request: req, kind: e.kind, message: e.message });
      else throw e;
    }
  }, [focus]);

  return { focus, error, request, clear: useCallback(() => { setFocus(null); setError(null); }, []) };
}
