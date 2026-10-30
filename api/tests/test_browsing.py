"""Browsing answers (assembly tree, systems, type hierarchy, schema of a type) against oracles worked out in
Python from the seed and schema files."""

import re
from collections import Counter

from explorer.db import PROJECT
from explorer.seed import read_seed, validate
from tests.conftest import get

SEED = read_seed()
RESOLVED = validate(SEED)
PARENT = {a["id"]: a["parent"] for a in SEED["assemblies"]}
SCHEMA = (PROJECT / "schema" / "schema.tql").read_text()
SUPER = {e: (a or b) for e, a, b in re.findall(r"^entity ([a-z-]+)(?: @abstract)?(?:, sub ([a-z-]+)| sub ([a-z-]+))?", SCHEMA, re.M)}


def chain(assembly):
    out = [assembly]
    while PARENT[out[-1]]:
        out.append(PARENT[out[-1]])
    return out


def is_a(type_label, ancestor):
    while type_label:
        if type_label == ancestor:
            return True
        type_label = SUPER.get(type_label)
    return False


def test_assembly_tree_counts(client):
    tree = {a["id"]: a for a in get(client, "/api/assemblies")["data"]}
    assert set(tree) == set(PARENT)
    for aid, a in tree.items():
        assert a["parent"] == PARENT[aid]
        assert a["direct"] == sum(1 for c in SEED["components"] if c["assembly"] == aid)
        assert a["total"] == sum(1 for c in SEED["components"] if aid in chain(c["assembly"]))


def test_system_totals_include_subsystems(client):
    systems = {s["id"]: s for s in get(client, "/api/systems")["data"]}
    for s in SEED["systems"]:
        subtree = {s["id"]} | {x["id"] for x in SEED["systems"] if x.get("parent") == s["id"]}
        expected = set().union(*(RESOLVED["members"][x] for x in subtree))
        assert systems[s["id"]]["total"] == len(expected), s["id"]


def test_system_members_list_their_other_systems(client):
    data = get(client, "/api/systems/brake-control")["data"]
    sensor = next(c for c in data["components"] if c["id"] == "wheel-speed-sensor-fl")
    assert {s["id"] for s in sensor["systems"]} == {"brake-control", "traction-control", "perception"}


def test_type_hierarchy_counts_are_polymorphic(client):
    types = {t["type"]: t for t in get(client, "/api/types")["data"]}
    direct = Counter(c["type"] for c in SEED["components"])
    for label, t in types.items():
        assert t["direct"] == direct.get(label, 0), label
        assert t["total"] == sum(n for ty, n in direct.items() if is_a(ty, label)), label
    assert types["component"]["total"] == len(SEED["components"])
    assert types["sensor"]["direct"] == 0 and types["sensor"]["total"] == 19  # 15 vehicle sensors + 2 resolvers + 2 current sensors (C3a)


def test_type_detail_shows_schema_and_every_subtype_instance(client):
    data = get(client, "/api/types/sensor")["data"]
    assert "sensing-range-m" in data["owns"] and "control-loop:sensor" in data["plays"]
    assert {i["id"] for i in data["instances"]} == {c["id"] for c in SEED["components"] if is_a(c["type"], "sensor")}
    assert {i["type"] for i in data["instances"]} == {"camera", "radar", "lidar", "gnss-receiver", "wheel-speed-sensor",
                                                     "position-sensor", "current-sensor"}
    caliper = get(client, "/api/types/brake-caliper")["data"]
    assert caliper["supertypes"] == ["brake-component", "chassis-component", "component"]
    assert "piston-count" in caliper["owns"]


def test_unknown_type_is_not_found(client):
    assert get(client, "/api/types/spaceship", status=404)["error"] == "not-found"
