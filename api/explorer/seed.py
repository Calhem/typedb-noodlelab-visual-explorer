"""Create the vehicle database: schema, functions and the seed data in data/seed/.

    python -m explorer.seed                 create the database (fails if it exists)
    python -m explorer.seed --if-missing    create it only if it doesn't exist yet (used by compose.yaml)
    python -m explorer.seed --replace       delete and recreate it
    python -m explorer.seed --write-tql     also save the generated insert to data/seed.generated.tql

How it works:
1. read_seed(): read the YAML files and expand placeholders (<c>, <a>, <s>, "each").
2. validate(): check everything refers to something that exists, before touching the database.
3. render(): turn the whole dataset into one TypeQL `insert` query.
4. load(): in one WRITE transaction, run the insert, count what arrived in TypeDB, and commit only if
   every count matches (an insert that silently matched nothing would otherwise go unnoticed).

The visual references (which 3D object draws each component) come from the build-time mapping files in
web/public/assets/*.map.json; components not in any model file are drawn procedurally in the browser.
"""

import argparse
import fnmatch
import itertools
import json
import re
import sys
from pathlib import Path

import yaml

from explorer.db import PROJECT, SCHEMA, WRITE, connect, rows, run_file, settings, string

SEED = PROJECT / "data" / "seed"
SCHEMA_FILES = [PROJECT / "schema" / "schema.tql", PROJECT / "schema" / "functions.tql"]
ASSETS = PROJECT / "web" / "public" / "assets"
GENERATED_TQL = PROJECT / "data" / "seed.generated.tql"

CORNERS = {"fl": ("front", "l"), "fr": ("front", "r"), "rl": ("rear", "l"), "rr": ("rear", "r")}
# Dependency kind -> family (the relation subtype in the schema).
FAMILIES = {"support": "physical-dependency", "torque": "physical-dependency",
            "power": "operational-dependency", "cooling": "operational-dependency", "hydraulic": "operational-dependency",
            "control": "control-dependency", "data": "control-dependency"}
CONNECTION_TYPES = {"mechanical": ("mechanical-connection", "joint-type", "joint"),
                    "power": ("power-connection", "voltage-class", "voltage"),
                    "data": ("data-connection", "network", "network"),
                    "fluid": ("fluid-connection", "fluid", "fluid")}


class SeedError(Exception):
    def __init__(self, problems):
        self.problems = problems
        super().__init__("The seed data has problems:\n  - " + "\n  - ".join(problems))


# ---- 1. Reading ---------------------------------------------------------------------------------------------

def _yaml(name):
    return yaml.safe_load((SEED / name).read_text())


def expand(entry):
    """All copies of an entry with its placeholders filled in.

    <c> repeats it for each wheel corner (and sets <a> and <s>); otherwise <a> and <s> repeat it for each
    axle and side. "each" gives lists for any other placeholder.
    """
    text = json.dumps({k: v for k, v in entry.items() if k != "each"})
    names = set(re.findall(r"<(\w+)>", text))
    axes = {k: [str(v) for v in vs] for k, vs in entry.get("each", {}).items()}
    if "c" in names:
        axes["c"] = list(CORNERS)
    else:
        if "a" in names:
            axes["a"] = ["front", "rear"]
        if "s" in names:
            axes["s"] = ["l", "r"]
    missing = names - set(axes) - ({"a", "s"} if "c" in names else set())
    if missing:
        raise SeedError([f"placeholder {sorted(missing)} has no values in {entry}"])
    out = []
    for combo in itertools.product(*axes.values()):
        values = dict(zip(axes, combo))
        if "c" in values:
            values["a"], values["s"] = CORNERS[values["c"]]
        filled = re.sub(r"<(\w+)>", lambda m: values[m.group(1)], text)
        out.append(json.loads(filled))
    return out


def read_seed():
    """The seed as plain Python data, with every placeholder expanded."""
    return {
        "assemblies": _yaml("assemblies.yaml")["assemblies"],
        "components": _yaml("components.yaml")["components"],
        "properties": _yaml("properties.yaml")["properties"],
        "systems": _yaml("systems.yaml")["systems"],
        "connections": [c for e in _yaml("connections.yaml")["connections"] for c in expand(e)],
        "dependencies": [d for e in _yaml("dependencies.yaml")["dependencies"] for d in expand(e)],
        "control_loops": _yaml("control-loops.yaml")["control-loops"],
        "visuals": read_visual_maps(),
    }


def read_visual_maps():
    """component id -> (asset name, node key), from the build-time mapping files."""
    visuals = {}
    for path in sorted(ASSETS.glob("*.map.json")):
        data = json.loads(path.read_text())
        for key, component in data["nodes"].items():
            visuals[component] = (data["asset"], key)
    return visuals


# ---- 2. Checking -------------------------------------------------------------------------------------------

def schema_facts():
    """Entity types (and which are abstract) and attribute value types, read from schema/schema.tql."""
    text = SCHEMA_FILES[0].read_text()
    entities = dict(re.findall(r"^entity ([a-z-]+)( @abstract)?", text, re.M))
    attributes = dict(re.findall(r"^attribute ([a-z-]+), value (\w+)", text, re.M))
    return {"concrete": {e for e, abstract in entities.items() if not abstract}, "attributes": attributes}


def matching(patterns, ids, where, problems):
    """The ids matching any of the patterns; a pattern that matches nothing is a problem."""
    patterns = [patterns] if isinstance(patterns, str) else patterns
    found = []
    for p in patterns:
        hits = [i for i in ids if fnmatch.fnmatchcase(i, p)]
        if not hits:
            problems.append(f"{where}: pattern '{p}' matches no component")
        found += [h for h in hits if h not in found]
    return found


def resolve(seed):
    """Check the seed and work out the final facts: properties per component and system members.

    Returns the problems found (empty when the seed is good) and the resolved data.
    """
    problems = []
    facts = schema_facts()
    ids = [c["id"] for c in seed["components"]]
    id_set = set(ids)
    assemblies = {a["id"]: a for a in seed["assemblies"]}
    systems = {s["id"]: s for s in seed["systems"]}

    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        problems.append(f"component id '{dup}' appears more than once")
    roots = [a["id"] for a in seed["assemblies"] if a["parent"] is None]
    if len(roots) != 1:
        problems.append(f"there must be exactly one top assembly, found {roots}")
    for a in seed["assemblies"]:
        if a["parent"] is not None and a["parent"] not in assemblies:
            problems.append(f"assembly '{a['id']}' has unknown parent '{a['parent']}'")
    for c in seed["components"]:
        if c["type"] not in facts["concrete"]:
            problems.append(f"component '{c['id']}' has type '{c['type']}', which is not a concrete entity type in the schema")
        if c["assembly"] not in assemblies:
            problems.append(f"component '{c['id']}' is in unknown assembly '{c['assembly']}'")

    properties = {i: {} for i in ids}
    for entry in seed["properties"]:
        for i in matching(entry["match"], ids, f"properties {entry['match']}", problems):
            for attr, value in entry.items():
                if attr == "match":
                    continue
                if attr not in facts["attributes"]:
                    problems.append(f"properties of '{i}': unknown attribute '{attr}'")
                properties[i][attr] = value

    members = {}
    for s in seed["systems"]:
        if s.get("parent") is not None and s["parent"] not in systems:
            problems.append(f"system '{s['id']}' has unknown parent '{s['parent']}'")
        members[s["id"]] = matching(s.get("members", []), ids, f"system '{s['id']}'", problems)

    for c in seed["connections"]:
        a, b = c["ends"]
        for end in (a, b):
            if end not in id_set:
                problems.append(f"connection {a} -- {b}: unknown component '{end}'")
        if a == b:
            problems.append(f"connection joins '{a}' to itself")
        if c["kind"] not in CONNECTION_TYPES:
            problems.append(f"connection {a} -- {b}: unknown kind '{c['kind']}'")
    for d in seed["dependencies"]:
        where = f"dependency {d['dependent']}: {d.get('function')} <- {d['provider']}: {d.get('needs')}"
        for end in (d["dependent"], d["provider"]):
            if end not in id_set:
                problems.append(f"{where}: unknown component '{end}'")
        if d.get("kind") not in FAMILIES:
            problems.append(f"{where}: unknown kind '{d.get('kind')}'")
        if not d.get("function") or not d.get("needs"):
            problems.append(f"{where}: needs both 'function' and 'needs'")
        if d.get("loss") not in ("lost", "degraded"):
            problems.append(f"{where}: 'loss' must be lost or degraded")
        if d.get("degradation") not in (None, "lost", "degraded"):
            problems.append(f"{where}: 'degradation' must be lost or degraded")
        if "fallback" in d:
            backup = d["fallback"].get("backup")
            if backup not in id_set:
                problems.append(f"{where}: unknown fallback backup '{backup}'")
            if backup == d["provider"]:
                problems.append(f"{where}: a component cannot be its own fallback")
            if d.get("loss") != "lost":
                problems.append(f"{where}: a fallback only makes sense when the loss effect is 'lost'")

    loops = []
    for loop in seed["control_loops"]:
        where = f"control loop '{loop['name']}'"
        if loop["controller"] not in id_set:
            problems.append(f"{where}: unknown controller '{loop['controller']}'")
        if loop["system"] not in systems:
            problems.append(f"{where}: unknown system '{loop['system']}'")
        loops.append({**loop, "sensors": matching(loop["sensors"], ids, where, problems) if loop["sensors"] else [],
                      "actuators": matching(loop["actuators"], ids, where, problems)})

    for component in seed["visuals"]:
        if component not in id_set:
            problems.append(f"a 3D model file maps a node to unknown component '{component}'")

    # Identical facts written twice (e.g. a corner pattern that also matches its own axle) count once.
    connections = list({(c["kind"], tuple(sorted(c["ends"]))): c for c in seed["connections"]}.values())
    dependencies = list({(d["dependent"], d["function"], d["provider"], d["needs"]): d for d in seed["dependencies"]}.values())
    return problems, {"properties": properties, "members": members, "loops": loops,
                      "connections": connections, "dependencies": dependencies, "attributes": facts["attributes"]}


def validate(seed):
    problems, resolved = resolve(seed)
    if problems:
        raise SeedError(problems)
    return resolved


# ---- 3. Writing the query -----------------------------------------------------------------------------------

def var(prefix, identifier):
    return f"${prefix}_" + re.sub(r"[^a-z0-9]", "_", identifier.lower())


def function_names(resolved):
    return sorted({d["function"] for d in resolved["dependencies"]} | {d["needs"] for d in resolved["dependencies"]})


def literal(value, value_type):
    if value_type == "string":
        return string(str(value))
    if value_type == "double":
        return repr(float(value))
    if value_type == "integer":
        return str(int(value))
    raise ValueError(f"unsupported value type {value_type}")


def has(attributes, value_types):
    parts = [f"has {name} {literal(value, value_types[name])}" for name, value in attributes.items() if value is not None]
    return "".join(", " + p for p in parts)


def render(seed, resolved):
    """The whole dataset as one TypeQL insert query."""
    types = resolved["attributes"]
    lines = ["# GENERATED by api/explorer/seed.py from data/seed/*.yaml and web/public/assets/*.map.json.",
             "# Do not edit by hand. Load in a WRITE transaction after schema/schema.tql and schema/functions.tql.",
             "insert"]
    out = lines.append

    out("  # ---- assemblies ----")
    for a in seed["assemblies"]:
        out(f"  {var('a', a['id'])} isa assembly" + has({"assembly-id": a["id"], "name": a["name"],
                                                          "description": a.get("description")}, types) + ";")
    for a in seed["assemblies"]:
        if a["parent"] is not None:
            out(f"  assembly-membership (assembly: {var('a', a['parent'])}, member: {var('a', a['id'])});")

    out("  # ---- components ----")
    for c in seed["components"]:
        attributes = {"component-id": c["id"], "name": c["name"], **resolved["properties"][c["id"]]}
        out(f"  {var('c', c['id'])} isa {c['type']}" + has(attributes, types) + ";")
        out(f"  assembly-membership (assembly: {var('a', c['assembly'])}, member: {var('c', c['id'])});")

    out("  # ---- systems ----")
    for s in seed["systems"]:
        out(f"  {var('s', s['id'])} isa system" + has({"system-id": s["id"], "name": s["name"],
                                                        "description": s.get("description")}, types) + ";")
    for s in seed["systems"]:
        if s.get("parent") is not None:
            out(f"  system-membership (system: {var('s', s['parent'])}, member: {var('s', s['id'])});")
        for m in resolved["members"][s["id"]]:
            out(f"  system-membership (system: {var('s', s['id'])}, member: {var('c', m)});")

    out("  # ---- connections ----")
    for c in resolved["connections"]:
        relation, attribute, key = CONNECTION_TYPES[c["kind"]]
        a, b = c["ends"]
        out(f"  $conn_{len(lines)} isa {relation} (endpoint: {var('c', a)}, endpoint: {var('c', b)})"
            + has({attribute: c[key], "description": c.get("description")}, types) + ";")

    out("  # ---- functions and dependencies (function to function) ----")
    for name in function_names(resolved):
        out(f"  {var('fn', name)} isa vehicle-function, has function-name {string(name)};")
    for i, d in enumerate(resolved["dependencies"]):
        out(f"  $dep_{i} isa {FAMILIES[d['kind']]} (dependent: {var('c', d['dependent'])}, affected-function: {var('fn', d['function'])}, "
            f"provider: {var('c', d['provider'])}, required-function: {var('fn', d['needs'])})"
            + has({"dependency-kind": d["kind"], "loss-effect": d["loss"], "degradation-effect": d.get("degradation"),
                   "description": d.get("description")}, types) + ";")
        if "fallback" in d:
            out(f"  fallback (protected: $dep_{i}, backup: {var('c', d['fallback']['backup'])})"
                + has({"description": d["fallback"].get("description")}, types) + ";")

    out("  # ---- control loops ----")
    for i, loop in enumerate(resolved["loops"]):
        roles = [f"controller: {var('c', loop['controller'])}", f"controlled-system: {var('s', loop['system'])}"]
        roles += [f"sensor: {var('c', s)}" for s in loop["sensors"]]
        roles += [f"actuator: {var('c', a)}" for a in loop["actuators"]]
        out(f"  $loop_{i} isa control-loop ({', '.join(roles)})"
            + has({"name": loop["name"], "description": loop.get("description")}, types) + ";")

    out("  # ---- 3D geometry ----")
    visuals = {c["id"]: seed["visuals"].get(c["id"], ("procedural", c["id"])) for c in seed["components"]}
    for asset in sorted({a for a, _ in visuals.values()}):
        out(f"  {var('v', asset)} isa visual-asset, has asset-name {string(asset)};")
    for component, (asset, key) in visuals.items():
        out(f"  visual-representation (represented: {var('c', component)}, asset: {var('v', asset)}), has node-key {string(key)};")
    return "\n".join(lines) + "\n"


# ---- 4. Loading -------------------------------------------------------------------------------------------

def expected_counts(seed, resolved):
    return {
        "assembly": len(seed["assemblies"]),
        "component": len(seed["components"]),
        "system": len(seed["systems"]),
        "assembly-membership": len(seed["assemblies"]) - 1 + len(seed["components"]),
        "system-membership": sum(1 for s in seed["systems"] if s.get("parent")) + sum(map(len, resolved["members"].values())),
        "connection": len(resolved["connections"]),
        "dependency": len(resolved["dependencies"]),
        "vehicle-function": len(function_names(resolved)),
        "fallback": sum(1 for d in resolved["dependencies"] if "fallback" in d),
        "control-loop": len(resolved["loops"]),
        "visual-representation": len(seed["components"]),
    }


def count(tx, type_label):
    return rows(tx, f"match $x isa {type_label}; reduce $n = count;")[0].get("n").get_integer()


def load(driver, database, seed=None):
    """Validate and load the seed into a database that already has the schema. Returns the counts.

    Raises SeedError (nothing saved) if the seed is wrong or anything is missing after the insert.
    """
    seed = seed if seed is not None else read_seed()
    resolved = validate(seed)
    expected = expected_counts(seed, resolved)
    with driver.transaction(database, WRITE) as tx:
        tx.query(render(seed, resolved)).resolve()
        actual = {label: count(tx, label) for label in expected}
        problems = [f"{label}: expected {n} in TypeDB, found {actual[label]}" for label, n in expected.items() if actual[label] != n]
        if problems:
            raise SeedError(problems)          # leaving the block without commit discards everything
        tx.commit()
    return actual


def create_database(driver, database, seed=None):
    """Create the database with the schema, functions and seed. Deletes it again if loading fails."""
    driver.databases.create(database)
    try:
        for path in SCHEMA_FILES:
            run_file(driver, database, path, SCHEMA)
        return load(driver, database, seed)
    except Exception:
        driver.databases.get(database).delete()
        raise


def main():
    parser = argparse.ArgumentParser(description="Create the vehicle database in TypeDB.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--if-missing", action="store_true", help="do nothing if the database already exists")
    group.add_argument("--replace", action="store_true", help="delete and recreate the database")
    parser.add_argument("--write-tql", action="store_true", help=f"also save the generated insert to {GENERATED_TQL.name}")
    args = parser.parse_args()

    database = settings()["database"]
    seed = read_seed()
    try:
        resolved = validate(seed)
    except SeedError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
    if args.write_tql:
        GENERATED_TQL.write_text(render(seed, resolved))
        print(f"Wrote {GENERATED_TQL}")

    driver = connect()
    if driver.databases.contains(database):
        if args.if_missing:
            print(f"Database '{database}' already exists; left as it is.")
            return
        if not args.replace:
            print(f"Database '{database}' already exists. Use --replace to recreate it.", file=sys.stderr)
            sys.exit(1)
        driver.databases.get(database).delete()
    counts = create_database(driver, database, seed)
    print(f"Created database '{database}':", ", ".join(f"{n} {label}" for label, n in counts.items()))


if __name__ == "__main__":
    main()
