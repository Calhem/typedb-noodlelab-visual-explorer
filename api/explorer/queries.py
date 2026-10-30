"""The named, read-only questions the API can ask TypeDB. Nothing else is ever run.

Every function takes an open RecordingTransaction (READ) and validated identifiers, and returns plain data.
The transaction records each query as it runs, so the API can show the exact TypeQL behind every answer.
"""

from explorer.db import fetch, rows, string

# The attributes every component has; everything else a component owns is an engineering property.
IDENTITY = {"component-id", "name", "description"}


class NotFound(Exception):
    pass


def _one(results, what):
    if not results:
        raise NotFound(what)
    return results[0]


def _label(t):
    return t["label"] if isinstance(t, dict) else t


# ---- Components -----------------------------------------------------------------------------------------

def component_list(tx):
    """Every component with its type and the 3D object that draws it."""
    found = fetch(tx, """
        match
          $c isa! $type, has component-id $id, has name $name;
          $type sub component;
          visual-representation (represented: $c, asset: $asset), has node-key $node;
          $asset has asset-name $asset-name;
        fetch { "id": $id, "name": $name, "type": $type, "asset": $asset-name, "node": $node };
    """)
    return sorted(({**c, "type": _label(c["type"])} for c in found), key=lambda c: c["id"])


def component(tx, component_id):
    """Identity, type (with its supertypes, most specific first) and engineering properties."""
    cid = string(component_id)
    doc = _one(fetch(tx, f"""
        match $c isa! $type, has component-id {cid};
        fetch {{ "type": $type, "attributes": {{ $c.* }} }};
    """), f"component {component_id}")
    supertypes = fetch(tx, f"""
        match
          $c isa! $type, has component-id {cid};
          $type sub $super;
          $super sub! $parent;
        fetch {{ "type": $super, "parent": $parent }};
    """)
    parents = {_label(s["type"]): _label(s["parent"]) for s in supertypes}
    chain = [_label(doc["type"])]
    while chain[-1] in parents:
        chain.append(parents[chain[-1]])
    attributes = doc["attributes"]
    properties = [{"attribute": name, "value": value} for name, value in sorted(attributes.items()) if name not in IDENTITY]
    return {
        "id": attributes["component-id"],
        "name": attributes.get("name"),
        "description": attributes.get("description"),
        "type": chain[0],
        "types": chain,
        "properties": properties,
    }


def component_assembly(tx, component_id):
    """The assembly the component sits in, and every assembly above it (nearest first)."""
    cid = string(component_id)
    direct = _one(fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          assembly-membership (assembly: $direct, member: $c);
        fetch {{ "id": $direct.assembly-id, "name": $direct.name }};
    """), f"component {component_id}")
    edges = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          assembly-membership (assembly: $direct, member: $c);
          {{ $a is $direct; }} or {{ let $a in assembly_ancestors($direct); }};
          assembly-membership (assembly: $parent, member: $a);
        fetch {{ "child": $a.assembly-id, "parent": $parent.assembly-id, "parent-name": $parent.name }};
    """)
    up = {e["child"]: {"id": e["parent"], "name": e["parent-name"]} for e in edges}
    path = [direct]
    while path[-1]["id"] in up:
        path.append(up[path[-1]["id"]])
    return {"assembly": direct, "path": path}


def component_systems(tx, component_id):
    """The systems the component takes part in, each with its parent systems (nearest first)."""
    cid = string(component_id)
    direct = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          system-membership (system: $s, member: $c);
        fetch {{ "id": $s.system-id, "name": $s.name, "description": $s.description }};
    """)
    edges = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          system-membership (system: $s, member: $c);
          {{ $x is $s; }} or {{ let $x in system_ancestors($s); }};
          system-membership (system: $parent, member: $x);
        fetch {{ "child": $x.system-id, "parent": $parent.system-id, "parent-name": $parent.name }};
    """)
    up = {e["child"]: {"id": e["parent"], "name": e["parent-name"]} for e in edges}
    result = []
    for s in sorted(direct, key=lambda s: s["id"]):
        parents = []
        while (parents[-1]["id"] if parents else s["id"]) in up:
            parents.append(up[parents[-1]["id"] if parents else s["id"]])
        result.append({**s, "parents": parents})
    return result


def component_relationships(tx, component_id):
    """Direct connections, dependencies in both directions, and control loops the component is part of."""
    cid = string(component_id)
    if not rows(tx, f"match $c isa component, has component-id {cid};"):
        raise NotFound(f"component {component_id}")
    connections = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          $r isa! $kind, links (endpoint: $c, endpoint: $other);
          $other isa! $other-type;
        fetch {{ "kind": $kind, "other": $other.component-id, "other-name": $other.name, "other-type": $other-type,
                "details": {{ $r.* }} }};
    """)
    needs = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          $d isa dependency (dependent: $c, provider: $p), has dependency-kind $kind;
        fetch {{ "id": $p.component-id, "name": $p.name, "kind": $kind, "description": $d.description }};
    """)
    needed_by = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          $d isa dependency (provider: $c, dependent: $dep), has dependency-kind $kind;
        fetch {{ "id": $dep.component-id, "name": $dep.name, "kind": $kind, "description": $d.description }};
    """)
    loops = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          $loop isa control-loop, links ($role: $c), links (controlled-system: $s);
        fetch {{ "name": $loop.name, "description": $loop.description, "role": $role,
                "system": $s.system-id, "system-name": $s.name }};
    """)
    for c in connections:
        c["kind"] = _label(c["kind"])
        c["other-type"] = _label(c["other-type"])
    for loop in loops:
        loop["role"] = _label(loop["role"]).split(":")[-1]
    by_name = lambda items: sorted(items, key=lambda x: (x.get("kind", ""), x.get("other-name") or x.get("name") or ""))
    return {"connections": by_name(connections), "needs": by_name(needs), "needed-by": by_name(needed_by),
            "control-loops": sorted(loops, key=lambda x: x["name"])}


def _walk(start, edges):
    """Order the components reached through dependency edges by number of steps from the start."""
    nxt = {}
    for e in edges:
        nxt.setdefault(e["from"], []).append(e)
    steps, frontier, reached = 0, [start], {}
    while frontier:
        steps += 1
        new = []
        for node in frontier:
            for e in nxt.get(node, []):
                if e["to"] not in reached and e["to"] != start:
                    reached[e["to"]] = {"id": e["to"], "name": e["to-name"], "steps": steps, "via": node, "kind": e["kind"]}
                    new.append(e["to"])
        frontier = new
    return sorted(reached.values(), key=lambda r: (r["steps"], r["name"]))


def component_impact(tx, component_id):
    """Multi-step: everything affected if this component fails, following dependencies (see docs/dependency-semantics.md:
    today every edge is treated as a total loss, which overstates some answers)."""
    cid = string(component_id)
    if not rows(tx, f"match $c isa component, has component-id {cid};"):
        raise NotFound(f"component {component_id}")
    edges = fetch(tx, f"""
        match
          $start isa component, has component-id {cid};
          let $from, $to in impact_edges($start);
          dependency (provider: $from, dependent: $to), has dependency-kind $kind;
        fetch {{ "from": $from.component-id, "to": $to.component-id, "to-name": $to.name, "kind": $kind }};
    """)
    return {"affected": _walk(component_id, edges)}


def component_requirements(tx, component_id):
    """Multi-step: everything this component relies on, directly or indirectly."""
    cid = string(component_id)
    if not rows(tx, f"match $c isa component, has component-id {cid};"):
        raise NotFound(f"component {component_id}")
    edges = fetch(tx, f"""
        match
          $end isa component, has component-id {cid};
          let $from, $to in requirement_edges($end);
          dependency (dependent: $from, provider: $to), has dependency-kind $kind;
        fetch {{ "from": $from.component-id, "to": $to.component-id, "to-name": $to.name, "kind": $kind }};
    """)
    return {"required": _walk(component_id, edges)}


# ---- Assemblies and systems -------------------------------------------------------------------------------

def assembly(tx, assembly_id):
    """An assembly: its parents, sub-assemblies, direct components and every component inside it."""
    aid = string(assembly_id)
    doc = _one(fetch(tx, f"""
        match $a isa assembly, has assembly-id {aid};
        fetch {{ "id": $a.assembly-id, "name": $a.name, "description": $a.description }};
    """), f"assembly {assembly_id}")
    parents = fetch(tx, f"""
        match
          $a isa assembly, has assembly-id {aid};
          let $p in assembly_ancestors($a);
        fetch {{ "id": $p.assembly-id, "name": $p.name }};
    """)
    subassemblies = fetch(tx, f"""
        match
          $a isa assembly, has assembly-id {aid};
          assembly-membership (assembly: $a, member: $sub);
          $sub isa assembly;
        fetch {{ "id": $sub.assembly-id, "name": $sub.name }};
    """)
    members = fetch(tx, f"""
        match
          $a isa assembly, has assembly-id {aid};
          assembly-membership (assembly: $a, member: $c);
          $c isa! $type;
          $type sub component;
        fetch {{ "id": $c.component-id, "name": $c.name, "type": $type }};
    """)
    everything = fetch(tx, f"""
        match
          $a isa assembly, has assembly-id {aid};
          let $c in assembly_components($a);
        fetch {{ "id": $c.component-id }};
    """)
    for m in members:
        m["type"] = _label(m["type"])
    return {**doc, "parents": parents, "subassemblies": sorted(subassemblies, key=lambda s: s["name"]),
            "components": sorted(members, key=lambda m: m["name"]),
            "all-component-ids": sorted({c["id"] for c in everything})}


def system_list(tx):
    """Every system with its parent (if any)."""
    systems = fetch(tx, """
        match $s isa system;
        fetch { "id": $s.system-id, "name": $s.name, "description": $s.description };
    """)
    parents = fetch(tx, """
        match system-membership (system: $parent, member: $s); $s isa system;
        fetch { "child": $s.system-id, "parent": $parent.system-id };
    """)
    up = {p["child"]: p["parent"] for p in parents}
    return sorted(({**s, "parent": up.get(s["id"])} for s in systems), key=lambda s: s["name"])


def system(tx, system_id):
    """A system: its subsystems, every component taking part (directly or through subsystems) and the control loops
    of the system and its subsystems. (Written as an `or` of two loop patterns: the shorter
    `{ $x is $s; } or { system-membership (system: $s, member: $x); }` hits a TypeDB 3.14.1 planner bug, QPL1.)"""
    sid = string(system_id)
    doc = _one(fetch(tx, f"""
        match $s isa system, has system-id {sid};
        fetch {{ "id": $s.system-id, "name": $s.name, "description": $s.description }};
    """), f"system {system_id}")
    subsystems = fetch(tx, f"""
        match
          $s isa system, has system-id {sid};
          system-membership (system: $s, member: $sub);
          $sub isa system;
        fetch {{ "id": $sub.system-id, "name": $sub.name }};
    """)
    components = fetch(tx, f"""
        match
          $s isa system, has system-id {sid};
          let $c in system_components($s);
        fetch {{ "id": $c.component-id, "name": $c.name }};
    """)
    loops = fetch(tx, f"""
        match
          $s isa system, has system-id {sid};
          {{ $loop isa control-loop, links (controlled-system: $s); }}
          or {{ system-membership (system: $s, member: $sub); $sub isa system;
               $loop isa control-loop, links (controlled-system: $sub); }};
          $loop links (controller: $ctrl);
        fetch {{ "name": $loop.name, "description": $loop.description, "controller": $ctrl.component-id,
                "sensors": [ match $loop links (sensor: $sensor); fetch {{ "id": $sensor.component-id }}; ],
                "actuators": [ match $loop links (actuator: $act); fetch {{ "id": $act.component-id }}; ] }};
    """)
    unique = {c["id"]: c for c in components}
    for loop in loops:
        loop["sensors"] = sorted(x["id"] for x in loop["sensors"])
        loop["actuators"] = sorted(x["id"] for x in loop["actuators"])
    return {**doc, "subsystems": sorted(subsystems, key=lambda s: s["name"]),
            "components": sorted(unique.values(), key=lambda c: c["name"]), "control-loops": loops}
