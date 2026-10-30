"""Generate the explosion's grouping file from TypeDB (an animation asset, not a source of facts).

    docker compose run --rm --no-deps api python -m explorer.animation > web/src/vehicle/explosion-groups.json

The exploded view moves each assembly relative to its parent and each part within its assembly, so the
animation needs the assembly tree. Decision 0001 allows choreography to be precomputed; this file is that
precomputation, written from TypeDB's assembly-membership relations. The web app uses it only to time and
group movements, never to display anything. tests/test_architecture.py fails if it no longer matches TypeDB.
"""

import json
import sys

from explorer.db import READ, connect, fetch, settings


def explosion_groups(tx):
    """{"assemblies": {assembly: parent or None}, "components": {component: assembly}}, sorted by id."""
    assemblies = fetch(tx, """
        match $a isa assembly, has assembly-id $id;
        fetch { "id": $id, "parent": [ match assembly-membership (assembly: $p, member: $a); fetch { "id": $p.assembly-id }; ] };
    """)
    components = fetch(tx, """
        match
          $c isa component, has component-id $id;
          assembly-membership (assembly: $a, member: $c);
        fetch { "id": $id, "assembly": $a.assembly-id };
    """)
    return {
        "assemblies": {a["id"]: (a["parent"][0]["id"] if a["parent"] else None) for a in sorted(assemblies, key=lambda a: a["id"])},
        "components": {c["id"]: c["assembly"] for c in sorted(components, key=lambda c: c["id"])},
    }


def render(groups):
    note = ("GENERATED from TypeDB by `python -m explorer.animation` (api/explorer/animation.py). Animation asset: "
            "used only to group and time the explosion, never displayed. Regenerate after changing assemblies.")
    return json.dumps({"_generated": note, **groups}, indent=1) + "\n"


def main():
    driver = connect()
    with driver.transaction(settings()["database"], READ) as tx:
        sys.stdout.write(render(explosion_groups(tx)))


if __name__ == "__main__":
    main()
