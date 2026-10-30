"""The integration tests listed in docs/decisions/0001-typedb-sole-database.md, against a real TypeDB server.

1. component metadata comes from TypeDB
2. assembly relationships come from TypeDB
3. semantic perspectives are produced by TypeQL
4. every component id in TypeDB resolves to a visual asset node, and every visual node to a component
   (this side checks TypeDB against the model files; web/src/semantic/integration.test.ts checks it
   against the web app's visual manifest)
5. no other database is used (also web/src/architecture.test.ts, which reads the whole project)
6. a stopped TypeDB produces the explicit error state, not mock data
Plus 7: the explosion grouping (an animation asset) is generated from TypeDB and still matches it.
"""

import json
import re
import tomllib
from pathlib import Path

from fastapi.testclient import TestClient

from explorer.api import Database, create_app
from explorer.db import PROJECT, READ, WRITE, fetch
from tests.conftest import get


def test_1_component_metadata_comes_from_typedb(driver, scratch_database):
    """Change a name and a property in TypeDB only: the API must return the new values at once."""
    client = TestClient(create_app(Database(database=scratch_database)))
    before = get(client, "/api/components/caliper-fr")["data"]
    assert before["name"] == "Front right brake calliper"
    with driver.transaction(scratch_database, WRITE) as tx:
        tx.query('match $c isa brake-caliper, has component-id "caliper-fr", has name $n, has piston-count $p; delete has $n of $c; has $p of $c;').resolve()
        tx.query('match $c isa brake-caliper, has component-id "caliper-fr"; insert $c has name "Renamed only in TypeDB", has piston-count 8;').resolve()
        tx.commit()
    after = get(client, "/api/components/caliper-fr")["data"]
    assert after["name"] == "Renamed only in TypeDB"
    assert {"attribute": "piston-count", "value": 8} in after["properties"]


def test_2_assembly_relationships_come_from_typedb(driver, scratch_database):
    """Move a component to another assembly in TypeDB only: its assembly path must follow."""
    client = TestClient(create_app(Database(database=scratch_database)))
    assert [a["id"] for a in get(client, "/api/components/lidar/assembly")["data"]["path"]] == ["sensor-suite", "vehicle"]
    with driver.transaction(scratch_database, WRITE) as tx:
        tx.query('match $c isa component, has component-id "lidar"; $m isa assembly-membership (member: $c); delete $m;').resolve()
        tx.query('match $c isa component, has component-id "lidar"; $a isa assembly, has assembly-id "greenhouse"; '
                 'insert assembly-membership (assembly: $a, member: $c);').resolve()
        tx.commit()
    path = [a["id"] for a in get(client, "/api/components/lidar/assembly")["data"]["path"]]
    assert path == ["greenhouse", "body", "vehicle"]
    assert "lidar" in get(client, "/api/assemblies/body")["data"]["all-component-ids"]
    assert "lidar" not in get(client, "/api/assemblies/sensor-suite")["data"]["all-component-ids"]


def _ids_in(value, found):
    """Every string that looks like an id, anywhere in a query result."""
    if isinstance(value, dict):
        for v in value.values():
            _ids_in(v, found)
    elif isinstance(value, list):
        for v in value:
            _ids_in(v, found)
    elif isinstance(value, str) and re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", value):
        found.add(value)
    return found


def test_3_semantic_perspectives_are_produced_by_typeql(client, driver, database):
    """Every answer lists its TypeQL; running exactly that TypeQL in TypeDB yields every id the answer shows."""
    for path, key in [("/api/systems/braking", "components"), ("/api/assemblies/front-drive-unit", "all-component-ids"),
                      ("/api/components/lv-battery/impact", "affected"), ("/api/components/tyre-fr/requirements", "required")]:
        body = get(client, path)
        assert body["typeql"], f"{path} returned no TypeQL"
        shown = body["data"][key]
        shown_ids = {x if isinstance(x, str) else x["id"] for x in shown}
        assert shown_ids, f"{path} returned nothing"
        found = set()
        with driver.transaction(database, READ) as tx:
            for query in body["typeql"]:
                if "fetch" in query:          # the others are existence checks that return no ids
                    _ids_in(fetch(tx, query), found)
        assert shown_ids <= found, f"{path}: ids not produced by its TypeQL: {sorted(shown_ids - found)[:5]}"


def test_4_every_component_has_a_visual_node_and_every_node_a_component(client):
    """TypeDB's visual references agree with the model files' mapping, in both directions."""
    components = get(client, "/api/components")["data"]
    by_id = {c["id"]: c for c in components}
    model_nodes = {}
    for path in (PROJECT / "web" / "public" / "assets").glob("*.map.json"):
        data = json.loads(path.read_text())
        for node, component in data["nodes"].items():
            model_nodes[(data["asset"], node)] = component
    # every node in a model file -> a component whose visual reference is that node
    for (asset, node), component in model_nodes.items():
        assert component in by_id, f"{asset} node {node} draws unknown component {component}"
        assert (by_id[component]["asset"], by_id[component]["node"]) == (asset, node)
    # every component -> a node in a model file, or drawn procedurally under its own id
    for c in components:
        if c["asset"] == "procedural":
            assert c["node"] == c["id"]
        else:
            assert (c["asset"], c["node"]) in model_nodes, f"{c['id']} points at missing node {c['asset']}/{c['node']}"


DATABASE_PACKAGES = re.compile(r"psycopg|sqlalchemy|sqlite|pymongo|motor|redis|neo4j|duckdb|mysql|mariadb|cassandra|elasticsearch|tinydb|peewee|pony", re.I)


def test_5_no_other_database_in_the_backend():
    """The backend depends on the TypeDB driver and nothing that stores data."""
    project = tomllib.loads((PROJECT / "api" / "pyproject.toml").read_text())
    deps = project["project"]["dependencies"] + [d for g in project.get("dependency-groups", {}).values() for d in g]
    assert any(d.startswith("typedb-driver") for d in deps)
    assert not [d for d in deps if DATABASE_PACKAGES.search(d)]
    for source in (PROJECT / "api").rglob("*.py"):
        if ".venv" in source.parts:
            continue
        text = source.read_text()
        assert not re.search(r"^\s*(import|from)\s+(sqlite3|shelve|dbm)\b", text, re.M), f"{source} imports a local data store"


def test_6_unreachable_typedb_gives_the_explicit_error_not_data():
    """With no TypeDB at the address, every semantic endpoint says so, with no data."""
    client = TestClient(create_app(Database(address="127.0.0.1:1", database="vehicle")))
    for path in ["/api/components", "/api/components/caliper-fr", "/api/components/caliper-fr/assembly",
                 "/api/components/caliper-fr/systems", "/api/components/caliper-fr/relationships",
                 "/api/components/caliper-fr/impact", "/api/components/caliper-fr/requirements",
                 "/api/assemblies/chassis", "/api/systems", "/api/systems/braking"]:
        response = client.get(path)
        assert response.status_code == 503, path
        body = response.json()
        assert body["error"] == "typedb-unavailable"
        assert "data" not in body
    health = client.get("/api/health")
    assert health.status_code == 503 and health.json()["typedb"] == "unavailable"


def test_7_explosion_grouping_is_generated_from_typedb_and_current(driver, database):
    """The animation's assembly grouping is exactly what TypeDB says now (regenerate with explorer.animation)."""
    from explorer.animation import explosion_groups, render

    with driver.transaction(database, READ) as tx:
        expected = render(explosion_groups(tx))
    committed = (PROJECT / "web" / "src" / "vehicle" / "explosion-groups.json").read_text()
    assert committed == expected, "web/src/vehicle/explosion-groups.json is out of date: regenerate it from TypeDB"
