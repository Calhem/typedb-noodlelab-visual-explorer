"""Query results against an independent oracle: the same answers worked out in Python from the seed files.

If TypeDB, a function or a query were wrong, the two would disagree.
"""

import fnmatch

from explorer.seed import read_seed, validate
from tests.conftest import get

SEED = read_seed()
RESOLVED = validate(SEED)
COMPONENTS = {c["id"]: c for c in SEED["components"]}
PARENT = {a["id"]: a["parent"] for a in SEED["assemblies"]}


def assembly_chain(assembly_id):
    chain = [assembly_id]
    while PARENT[chain[-1]] is not None:
        chain.append(PARENT[chain[-1]])
    return chain


def reach(start, edges):
    """Everything reachable from start along (from, to) edges."""
    seen, frontier = set(), [start]
    while frontier:
        node = frontier.pop()
        for a, b in edges:
            if a == node and b not in seen and b != start:
                seen.add(b)
                frontier.append(b)
    return seen


def test_component_ids_in_typedb_match_the_seed(client):
    ids = {c["id"] for c in get(client, "/api/components")["data"]}
    assert ids == set(COMPONENTS)


def test_component_details(client):
    data = get(client, "/api/components/brake-disc-fr")["data"]
    assert data["type"] == "brake-disc"
    assert data["types"] == ["brake-disc", "brake-component", "chassis-component", "component"]
    props = {p["attribute"]: p["value"] for p in data["properties"]}
    assert props["diameter-mm"] == 380 and props["thickness-mm"] == 34


def test_assembly_path_matches_seed(client):
    for cid in ["caliper-fr", "battery-module-7", "front-stator", "door-handle-rl"]:
        path = [a["id"] for a in get(client, f"/api/components/{cid}/assembly")["data"]["path"]]
        assert path == assembly_chain(COMPONENTS[cid]["assembly"])


def test_assembly_membership_matches_seed(client):
    for aid in ["vehicle", "powertrain", "corner-fl", "body"]:
        data = get(client, f"/api/assemblies/{aid}")["data"]
        expected = {cid for cid, c in COMPONENTS.items() if aid in assembly_chain(c["assembly"])}
        assert set(data["all-component-ids"]) == expected
        assert {c["id"] for c in data["components"]} == {cid for cid, c in COMPONENTS.items() if c["assembly"] == aid}


def test_systems_of_a_component(client):
    systems = {s["id"]: s for s in get(client, "/api/components/wheel-speed-sensor-fl/systems")["data"]}
    # one sensor, three functions: the same component in several systems
    assert set(systems) == {"brake-control", "traction-control", "perception"}
    assert [p["id"] for p in systems["perception"]["parents"]] == ["automated-driving"]


def test_system_components_include_subsystems(client):
    for sid in ["braking", "propulsion", "automated-driving"]:
        data = get(client, f"/api/systems/{sid}")["data"]
        subsystems = {s["id"] for s in SEED["systems"] if s.get("parent") == sid}
        expected = set(RESOLVED["members"][sid]).union(*(RESOLVED["members"][s] for s in subsystems))
        assert {c["id"] for c in data["components"]} == expected


def test_relationships(client):
    data = get(client, "/api/components/caliper-fr/relationships")["data"]
    connected = {(c["kind"], c["other"]) for c in data["connections"]}
    expected = {(f"{c['kind']}-connection", (set(c["ends"]) - {"caliper-fr"}).pop())
                for c in RESOLVED["connections"] if "caliper-fr" in c["ends"]}
    assert connected == expected
    assert {(d["id"], d["kind"]) for d in data["needs"]} == {("brake-hose-fr", "hydraulic")}
    loops = {(loop["name"], loop["role"]) for loop in data["control-loops"]}
    assert loops == {("Anti-lock braking and stability control", "actuator")}


def test_failure_impact_is_multi_step_and_matches_the_dependency_graph(client):
    edges = [(d["provider"], d["dependent"]) for d in RESOLVED["dependencies"]]
    for cid in ["lv-battery", "coolant-pump", "front-gate-driver", "esc-module"]:
        affected = get(client, f"/api/components/{cid}/impact")["data"]["affected"]
        assert {a["id"] for a in affected} == reach(cid, edges), cid
        assert max(a["steps"] for a in affected) >= 2 or cid == "esc-module"
    # the 12 V battery's failure reaches the wheels through the battery contactors and the drive units
    lv = {a["id"]: a for a in get(client, "/api/components/lv-battery/impact")["data"]["affected"]}
    assert "tyre-rl" in lv and lv["tyre-rl"]["steps"] > 5


def test_requirements_are_the_reverse_walk(client):
    edges = [(d["dependent"], d["provider"]) for d in RESOLVED["dependencies"]]
    required = get(client, "/api/components/tyre-fr/requirements")["data"]["required"]
    assert {r["id"] for r in required} == reach("tyre-fr", edges)


def test_pattern_matching_in_seed_is_exact():
    assert not fnmatch.fnmatchcase("hub-nut-fl", "hub-??")
