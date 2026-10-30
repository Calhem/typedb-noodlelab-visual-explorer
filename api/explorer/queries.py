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
    dependency_fields = """ "family": $family, "kind": $kind, "function": $f.function-name, "needs": $g.function-name,
                "loss": $d.loss-effect, "degradation": $d.degradation-effect, "description": $d.description,
                "fallback": [ match fallback (protected: $d, backup: $b); fetch { "id": $b.component-id, "name": $b.name }; ] """
    needs = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          $d isa! $family, links (dependent: $c, affected-function: $f, provider: $p, required-function: $g), has dependency-kind $kind;
        fetch {{ "id": $p.component-id, "name": $p.name, {dependency_fields} }};
    """)
    needed_by = fetch(tx, f"""
        match
          $c isa component, has component-id {cid};
          $d isa! $family, links (provider: $c, required-function: $g, dependent: $p, affected-function: $f), has dependency-kind $kind;
        fetch {{ "id": $p.component-id, "name": $p.name, {dependency_fields} }};
    """)
    for dep in needs + needed_by:
        dep["family"] = _label(dep["family"]).replace("-dependency", "")
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
    by_name = lambda items: sorted(items, key=lambda x: (x.get("kind", ""), x.get("other-name") or x.get("name") or "", x.get("function", "")))
    return {"connections": by_name(connections), "needs": by_name(needs), "needed-by": by_name(needed_by),
            "control-loops": sorted(loops, key=lambda x: x["name"])}


def _steps_from(start, edges):
    """Steps from the start along (provider, function) -> (dependent, function) edges, breadth first.

    The failed component counts as having lost all its functions, so every edge leaving it is a first step.
    Returns {(component, function): (steps, edge that first reached it)}.
    """
    out = {}
    for e in edges:
        out.setdefault((e["from"], e["needs"]), []).append(e)
    first = [e for e in edges if e["from"] == start]
    reached, frontier, steps = {}, first, 1
    while frontier:
        nxt = []
        for e in frontier:
            key = (e["to"], e["function"])
            if key not in reached and e["to"] != start:
                reached[key] = (steps, e)
                nxt += out.get(key, [])
        frontier, steps = nxt, steps + 1
    return reached


def component_impact(tx, component_id):
    """Multi-step, function by function: what is lost, what is degraded and which fallbacks take over if this
    component fails (docs/dependency-semantics.md, C1). Reasoning runs in TypeDB (lost_steps, degraded_steps)."""
    cid = string(component_id)
    if not rows(tx, f"match $c isa component, has component-id {cid};"):
        raise NotFound(f"component {component_id}")
    step_fields = """ "from": $p.component-id, "needs": $g.function-name, "to": $c.component-id, "to-name": $c.name,
                "function": $f.function-name, "kind": $kind """
    lost = fetch(tx, f"""
        match
          $start isa component, has component-id {cid};
          let $p, $g, $c, $f in lost_steps($start);
          dependency (provider: $p, required-function: $g, dependent: $c, affected-function: $f), has dependency-kind $kind;
        fetch {{ {step_fields} }};
    """)
    # Degraded steps also carry their dependency's loss effect and fallbacks: a fallback is "in use" when its
    # dependency's provider function is lost (worked out below from the lost steps, without a third recursive query).
    degraded = fetch(tx, f"""
        match
          $start isa component, has component-id {cid};
          let $p, $g, $c, $f in degraded_steps($start);
          $d isa dependency (provider: $p, required-function: $g, dependent: $c, affected-function: $f), has dependency-kind $kind,
            has loss-effect $loss;
        fetch {{ {step_fields}, "provider-name": $p.name, "loss": $loss,
                "fallback": [ match fallback (protected: $d, backup: $b), has description $why;
                              fetch {{ "id": $b.component-id, "name": $b.name, "description": $why }}; ] }};
    """)
    lost_pairs = {(e["to"], e["function"]) for e in lost}
    fallbacks = [
        {"id": e["to"], "name": e["to-name"], "function": e["function"], "provider": e["from"], "provider-name": e["provider-name"],
         "needs": e["needs"], "backup": b["id"], "backup-name": b["name"], "description": b["description"]}
        for e in degraded if e["loss"] == "lost" and (e["from"] == component_id or (e["from"], e["needs"]) in lost_pairs)
        for b in e["fallback"] if b["id"] != component_id
    ]
    # Every function each component has (as a provider or a dependent), to show what an affected part keeps.
    functions = fetch(tx, """
        match
          $c isa component;
          { dependency (dependent: $c, affected-function: $f); } or { dependency (provider: $c, required-function: $f); };
        fetch { "id": $c.component-id, "name": $c.name, "function": $f.function-name };
    """)
    has = {}
    for x in functions:
        has.setdefault(x["id"], set()).add(x["function"])
    lost_keys = {(e["to"], e["function"]) for e in lost}
    reached = _steps_from(component_id, lost + degraded)

    def item(key):
        steps, e = reached[key]
        return {"id": key[0], "name": e["to-name"], "function": key[1], "steps": steps,
                "via": e["from"], "via-function": e["needs"], "kind": e["kind"]}
    order = lambda x: (x["steps"], x["name"], x["function"])
    unique_fallbacks = {(f["id"], f["function"], f["backup"]): f for f in fallbacks}
    lost_items = sorted((item(k) for k in reached if k in lost_keys), key=order)
    degraded_items = sorted((item(k) for k in reached if k not in lost_keys), key=order)
    # Per component: which of its functions are lost, degraded, or kept. A failure usually takes functions,
    # not whole components (the failed part itself is the exception: it loses everything).
    components = {}
    for x in lost_items + degraded_items:
        c = components.setdefault(x["id"], {"id": x["id"], "name": x["name"], "steps": x["steps"], "lost": [], "degraded": []})
        c["lost" if (x["id"], x["function"]) in lost_keys else "degraded"].append(x["function"])
        c["steps"] = min(c["steps"], x["steps"])
    for c in components.values():
        c["kept"] = sorted(has.get(c["id"], set()) - set(c["lost"]) - set(c["degraded"]))
    failed_name = next((x["name"] for x in functions if x["id"] == component_id), None)
    propulsion = _propulsion(tx, lost_keys, {(x["id"], x["function"]) for x in degraded_items}, component_id)
    return {
        "failed": {"id": component_id, "name": failed_name, "functions": sorted(has.get(component_id, set()))},
        "components": sorted(components.values(), key=lambda c: (0 if c["lost"] else 1, c["steps"], c["name"])),
        "lost": lost_items,
        "degraded": degraded_items,
        "fallbacks": sorted(unique_fallbacks.values(), key=lambda f: (f["name"], f["function"])),
        "propulsion": propulsion,
    }


def _propulsion(tx, lost, degraded, failed):
    """Axle-level and vehicle-level propulsion after a failure (docs/dependency-semantics.md, C3b). Which tyres
    each axle drives comes from TypeDB: the drive-torque chain from each axle-drive system's drive shafts
    through hub and wheel to the tyre. An axle is lost when all its tyres lose drive torque, reduced when any
    is degraded or only some are lost; the vehicle is lost only when every axle is."""
    rows_ = fetch(tx, """
        match
          $sys isa system, has system-id $sid, has name $sname;
          system-membership (system: $sys, member: $h); $h isa drive-shaft;
          $dt isa vehicle-function, has function-name "drive torque";
          dependency (provider: $h, required-function: $dt, dependent: $hub, affected-function: $dt);
          dependency (provider: $hub, required-function: $dt, dependent: $w, affected-function: $dt);
          dependency (provider: $w, required-function: $dt, dependent: $t, affected-function: $dt); $t isa tyre;
        fetch { "system": $sid, "name": $sname, "tyre": $t.component-id };
    """)
    axles = {}
    for r in rows_:
        axles.setdefault(r["system"], {"system": r["system"], "name": r["name"], "tyres": set()})["tyres"].add(r["tyre"])
    out = []
    for a in sorted(axles.values(), key=lambda a: a["system"]):
        tyres = sorted(a["tyres"])
        n_lost = sum((t, "drive torque") in lost or t == failed for t in tyres)
        n_degraded = sum((t, "drive torque") in degraded for t in tyres)
        state = "lost" if n_lost == len(tyres) else "reduced" if n_lost or n_degraded else "kept"
        out.append({"system": a["system"], "name": a["name"], "tyres": tyres, "lost": n_lost, "degraded": n_degraded, "state": state})
    states = [a["state"] for a in out]
    vehicle = "lost" if states and all(s == "lost" for s in states) else "reduced" if any(s != "kept" for s in states) else "kept"
    return {"axles": out, "vehicle": vehicle}


def component_requirements(tx, component_id):
    """Multi-step: every (component, function) this component's functions rely on, directly or indirectly, and how
    much each matters: essential (its loss loses the function), backed up (a fallback exists) or supporting
    (its loss only degrades)."""
    cid = string(component_id)
    if not rows(tx, f"match $c isa component, has component-id {cid};"):
        raise NotFound(f"component {component_id}")
    edges = fetch(tx, f"""
        match
          $end isa component, has component-id {cid};
          let $c, $f, $p, $g in requirement_steps($end);
          $d isa dependency (dependent: $c, affected-function: $f, provider: $p, required-function: $g), has loss-effect $loss,
            has dependency-kind $kind;
        fetch {{ "from": $c.component-id, "needs": $f.function-name, "to": $p.component-id, "to-name": $p.name,
                "function": $g.function-name, "loss": $loss, "kind": $kind,
                "fallback": [ match fallback (protected: $d, backup: $b); fetch {{ "id": $b.component-id }}; ] }};
    """)
    reached = _steps_from(component_id, edges)
    required = []
    for (comp, function), (steps, e) in reached.items():
        role = "backed up" if e["fallback"] else ("essential" if e["loss"] == "lost" else "supporting")
        required.append({"id": comp, "name": e["to-name"], "function": function, "steps": steps, "via": e["from"],
                         "kind": e["kind"], "role": role})
    return {"required": sorted(required, key=lambda x: (x["steps"], x["name"], x["function"]))}


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
    total = fetch(tx, """
        match $s isa system; let $c in system_components($s);
        reduce $n = count groupby $s;
        fetch { "id": $s.system-id, "n": $n };
    """)
    up = {p["child"]: p["parent"] for p in parents}
    t = {x["id"]: x["n"] for x in total}
    return sorted(({**s, "parent": up.get(s["id"]), "total": t.get(s["id"], 0)} for s in systems), key=lambda s: s["name"])


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
        fetch {{ "id": $c.component-id, "name": $c.name,
                "systems": [ match system-membership (system: $o, member: $c); fetch {{ "id": $o.system-id, "name": $o.name }}; ] }};
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


# ---- Browsing: trees and the type hierarchy ------------------------------------------------------------------

def assembly_tree(tx):
    """Every assembly with its parent, how many components sit in it directly, and how many it contains in total
    (through its sub-assemblies, counted by the recursive assembly_components function)."""
    assemblies = fetch(tx, """
        match $a isa assembly;
        fetch { "id": $a.assembly-id, "name": $a.name,
                "parent": [ match assembly-membership (assembly: $p, member: $a); fetch { "id": $p.assembly-id }; ] };
    """)
    direct = fetch(tx, """
        match $a isa assembly; assembly-membership (assembly: $a, member: $c); $c isa component;
        reduce $n = count groupby $a;
        fetch { "id": $a.assembly-id, "n": $n };
    """)
    total = fetch(tx, """
        match $a isa assembly; let $c in assembly_components($a);
        reduce $n = count groupby $a;
        fetch { "id": $a.assembly-id, "n": $n };
    """)
    d = {x["id"]: x["n"] for x in direct}
    t = {x["id"]: x["n"] for x in total}
    return sorted(({"id": a["id"], "name": a["name"], "parent": a["parent"][0]["id"] if a["parent"] else None,
                    "direct": d.get(a["id"], 0), "total": t.get(a["id"], 0)} for a in assemblies), key=lambda a: a["name"])


def type_hierarchy(tx):
    """The component type hierarchy, with instance counts: "total" counts every instance of the type and its
    subtypes (one polymorphic query), "direct" only those whose most specific type it is."""
    tree = fetch(tx, """
        match $t sub! $parent; $parent sub component;
        fetch { "type": $t, "parent": $parent };
    """)
    total = fetch(tx, """
        match $t sub component; $x isa $t;
        reduce $n = count groupby $t;
        fetch { "type": $t, "n": $n };
    """)
    direct = fetch(tx, """
        match $t sub component; $x isa! $t;
        reduce $n = count groupby $t;
        fetch { "type": $t, "n": $n };
    """)
    t = {_label(x["type"]): x["n"] for x in total}
    d = {_label(x["type"]): x["n"] for x in direct}
    types = [{"type": "component", "parent": None}] + [{"type": _label(x["type"]), "parent": _label(x["parent"])} for x in tree]
    return sorted(({**x, "total": t.get(x["type"], 0), "direct": d.get(x["type"], 0)} for x in types), key=lambda x: x["type"])


def type_detail(tx, label):
    """One type: its supertypes, the attributes it owns and roles it plays (inherited included), and every
    instance of it or any subtype (polymorphism)."""
    known = {_label(x["t"]) for x in fetch(tx, "match $t sub component; fetch { \"t\": $t };")}
    if label not in known:
        raise NotFound(f"component type {label}")
    supertypes = fetch(tx, f"match $t label {label}; $t sub $s; $s sub component; fetch {{ \"s\": $s }};")
    owns = fetch(tx, f"match $t label {label}; $t owns $a; fetch {{ \"a\": $a }};")
    plays = fetch(tx, f"match $t label {label}; $t plays $r; fetch {{ \"r\": $r }};")
    instances = fetch(tx, f"""
        match $x isa {label}; $x isa! $type;
        fetch {{ "id": $x.component-id, "name": $x.name, "type": $type }};
    """)
    return {
        "type": label,
        "supertypes": sorted({_label(s["s"]) for s in supertypes} - {label}),
        "owns": sorted(_label(a["a"]) for a in owns),
        "plays": sorted(_label(r["r"]) for r in plays),
        "instances": sorted(({**i, "type": _label(i["type"])} for i in instances), key=lambda i: (i["type"], i["name"])),
    }
