// A small label for the selected part: its name, where it sits in the assembly, and its stable id.
// (Phase 3 replaces the local manifest lookup with the TypeDB entity behind the same id.)

import { ASSEMBLY_BY_ID, PART_BY_ID } from "../vehicle/manifest";

export function PartLabel({ id, onClose }: { id: string; onClose: () => void }) {
  const part = PART_BY_ID.get(id);
  if (!part) return null;
  const path: string[] = [];
  for (let a = ASSEMBLY_BY_ID.get(part.assembly); a && a.parent; a = ASSEMBLY_BY_ID.get(a.parent)) path.unshift(a.name);
  return (
    <aside className="part-label" aria-live="polite">
      <button type="button" className="part-close" onClick={onClose} aria-label="Clear selection">×</button>
      <p className="part-path">{path.join("  ›  ")}</p>
      <h2>{part.name}</h2>
      <p className="part-id">{part.id}</p>
    </aside>
  );
}
