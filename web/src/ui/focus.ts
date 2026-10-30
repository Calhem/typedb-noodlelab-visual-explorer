// A "focus" is a semantic perspective on the 3D model: the components TypeDB returns for one question
// (an assembly's contents, a system's members, a failure's impact) are highlighted and the rest is ghosted.

import { useCallback, useState } from "react";
import { SemanticError, semantic, type Reached } from "../semantic/api";

export type FocusKind = "assembly" | "system" | "impact" | "requirements";

export interface FocusRequest {
  kind: FocusKind;
  /** the assembly, system or component id the question is about */
  key: string;
  /** the selected component the question was asked from */
  anchor: string;
}

export interface Focus extends FocusRequest {
  title: string;
  ids: Set<string>;
  typeql: string[];
  /** for impact and requirements: the components reached, nearest first */
  reached?: Reached[];
}

export type FocusError = { request: FocusRequest; kind: SemanticError["kind"]; message: string };

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
        const { data, typeql } = await semantic.assembly(req.key);
        setFocus({ ...req, title: `${data.name}: ${data["all-component-ids"].length} components`, ids: new Set(data["all-component-ids"]), typeql });
      } else if (req.kind === "system") {
        const { data, typeql } = await semantic.system(req.key);
        setFocus({ ...req, title: `${data.name}: ${data.components.length} components`, ids: new Set(data.components.map((c) => c.id)), typeql });
      } else if (req.kind === "impact") {
        const { data, typeql } = await semantic.impact(req.key);
        const ids = new Set([req.key, ...data.affected.map((a) => a.id)]);
        setFocus({ ...req, title: `If it fails: ${data.affected.length} components affected`, ids, typeql, reached: data.affected });
      } else {
        const { data, typeql } = await semantic.requirements(req.key);
        const ids = new Set([req.key, ...data.required.map((a) => a.id)]);
        setFocus({ ...req, title: `Needs ${data.required.length} components to work`, ids, typeql, reached: data.required });
      }
    } catch (e) {
      setFocus(null);
      if (e instanceof SemanticError) setError({ request: req, kind: e.kind, message: e.message });
      else throw e;
    }
  }, [focus]);

  return { focus, error, request, clear: useCallback(() => { setFocus(null); setError(null); }, []) };
}
