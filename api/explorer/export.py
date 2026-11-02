"""The downloadable TypeDB model: the live database written out as TypeQL, so anyone can load the demonstrator's
exact model into their own TypeDB 3.14 server.

    schema.tql  the schema, functions included, exactly as TypeDB returns it (database.schema())
    data.tql    every entity and relation with its attributes and role players, as one `insert` query
    README.md   how to load it and some representative queries to try

Everything is read from TypeDB in one READ transaction, never from the seed files, so the export is the database
the app shows. It is generic: it reads instances, attributes and role players without knowing the vehicle's types.
"""

import io
import re
import zipfile
from datetime import date
from decimal import Decimal

from explorer.db import READ, string

ENTITIES = "match $x isa! $t; entity $t;"
RELATIONS = "match $x isa! $t; relation $t;"
OWNERSHIPS = "match $x isa! $t; {kind} $t; $x has $a;"
ROLE_PLAYERS = "match $r isa! $t; relation $t; $r links ($role: $p);"


def _literal(attribute):
    """An attribute's value as a TypeQL literal of its own value type."""
    v = attribute.get_value()
    kind = attribute.get_value_type()
    if kind == "string":
        return string(v)
    if kind == "boolean":
        return "true" if v else "false"
    if kind == "double":
        # plain decimal notation, never an exponent (1e-07): the shortest exact form, written out
        text = format(Decimal(repr(float(v))), "f")
        return text if "." in text else text + ".0"
    if kind == "integer":
        return str(int(v))
    raise ValueError(f"value type {kind} is not exported")


def _rows(tx, query):
    return list(tx.query(query).resolve().as_concept_rows())


def read_model(tx):
    """Every instance with its type, attributes and role players, keyed by IID."""
    instances = {}
    for kind, query in (("entity", ENTITIES), ("relation", RELATIONS)):
        for r in _rows(tx, query):
            instances[r.get("x").get_iid()] = {"kind": kind, "type": r.get("t").get_label(), "has": [], "links": []}
    for kind in ("entity", "relation"):
        for r in _rows(tx, OWNERSHIPS.format(kind=kind)):
            a = r.get("a")
            instances[r.get("x").get_iid()]["has"].append((a.get_type().get_label(), _literal(a)))
    for r in _rows(tx, ROLE_PLAYERS):
        role = r.get("role").get_label().split(":")[-1]
        instances[r.get("r").get_iid()]["links"].append((role, r.get("p").get_iid()))
    return instances


# The largest query written (bytes). Some TypeDB servers and clients accept only about 100 KB in one query (a 446 KB
# single insert was cut off at about 106 KB), so the data is written as a series of smaller queries.
MAX_QUERY_BYTES = 60_000
# The most entities one match step looks up (see render_data).
LOOKUPS_PER_STAGE = 8


def render_data(instances, keys, supertypes):
    """The data as a series of queries, each under MAX_QUERY_BYTES, ended by `end;` and a blank line, so TypeDB
    Console's `source` runs them one by one (without `end;` it sends the whole file as one query) and a driver can
    split the file at blank lines. Run them in order in one write transaction.

    - Entities first, in `insert` batches, ordered by type and key.
    - Then relations. Each relation query is a pipeline of small steps: `match` up to LOOKUPS_PER_STAGE entities
      by their keys, then `insert` the relations that use them, and so on; entities found earlier in the query are
      reused. (One `match` finding hundreds of entities at once is slow to plan: 80 key lookups take about a
      second, 250 took two minutes and gigabytes of memory.) A relation that plays a role in another (a fallback
      protects a dependency) is inserted in the same query as the relations that refer to it.

    Variables are plain generated names ($e1... for entities, $r1... for relations): letters and digits only, so
    every TypeQL parser accepts them; ids stay attribute values (component-id and the other keys). No comments and
    no blank lines inside a query. The output is stable from one export to the next."""
    def key_of(inst):
        for t in [inst["type"], *supertypes.get(inst["type"], [])]:
            if t in keys:
                value = next((v for a, v in inst["has"] if a == keys[t]), None)
                if value is not None:
                    return keys[t], value
        raise ValueError(f"an instance of {inst['type']} has no key, so relations cannot find it")

    entities = sorted((i for i in instances if instances[i]["kind"] == "entity"),
                      key=lambda i: (instances[i]["type"], key_of(instances[i])[1], sorted(instances[i]["has"])))
    names = {i: f"$e{n}" for n, i in enumerate(entities, 1)}

    def rel_sort(i):
        inst = instances[i]
        return (inst["type"], sorted((role, names.get(p, "")) for role, p in inst["links"]), sorted(inst["has"]))
    relations = sorted((i for i in instances if instances[i]["kind"] == "relation"), key=rel_sort)
    names.update({i: f"$r{n}" for n, i in enumerate(relations, 1)})

    def has_clause(inst):
        return "".join(f", has {a} {v}" for a, v in sorted(inst["has"]))

    def insert_line(i):
        inst = instances[i]
        if inst["kind"] == "entity":
            return f"  {names[i]} isa {inst['type']}{has_clause(inst)};"
        players = ", ".join(f"{role}: {names[p]}" for role, p in sorted(inst["links"], key=lambda x: (x[0], names[x[1]])))
        return f"  {names[i]} isa {inst['type']} ({players}){has_clause(inst)};"

    def match_line(i):
        attribute, value = key_of(instances[i])
        return f"  {names[i]} isa {instances[i]['type']}, has {attribute} {value};"

    queries = []

    # Entities: insert batches.
    batch, size = [], 0
    for i in entities:
        line = insert_line(i)
        if batch and size + len(line) + 1 > MAX_QUERY_BYTES - 16:
            queries.append("insert\n" + "\n".join(batch))
            batch, size = [], 0
        batch.append(line)
        size += len(line.encode()) + 1
    if batch:
        queries.append("insert\n" + "\n".join(batch))

    # Relations: group those linked through relation role players, so each group goes into one query, in the order
    # that defines a relation before it is used.
    group = {i: i for i in relations}
    def root(i):
        while group[i] != i:
            group[i] = group[group[i]]
            i = group[i]
        return i
    for i in relations:
        for _, p in instances[i]["links"]:
            if instances[p]["kind"] == "relation":
                group[root(i)] = root(p)
    units = {}
    for i in relations:
        units.setdefault(root(i), []).append(i)
    played = {p for i in relations for _, p in instances[i]["links"]}
    ordered = sorted(units.values(), key=lambda u: rel_sort(min(u, key=rel_sort)))
    for u in ordered:
        u.sort(key=lambda i: (0 if i in played else 1, rel_sort(i)))

    def relation_query(unit_list):
        rels = [i for u in unit_list for i in u]
        bound, stages, lookups, inserts = set(), [], [], []

        def flush():
            if lookups:
                stages.append("match\n" + "\n".join(lookups))
            if inserts:
                stages.append("insert\n" + "\n".join(inserts))
            lookups.clear()
            inserts.clear()
        for i in rels:
            new = sorted({p for _, p in instances[i]["links"] if instances[p]["kind"] == "entity" and p not in bound},
                         key=lambda e: int(names[e][2:]))
            if lookups and len(lookups) + len(new) > LOOKUPS_PER_STAGE:
                flush()
            lookups.extend(match_line(e) for e in new)
            bound.update(new)
            inserts.append(insert_line(i))
        flush()
        return "\n".join(stages)

    batch = []
    for u in ordered:
        if batch and len(relation_query(batch + [u]).encode()) > MAX_QUERY_BYTES:
            queries.append(relation_query(batch))
            batch = []
        batch.append(u)
    if batch:
        queries.append(relation_query(batch))
    queries = [q + "\nend;" for q in queries]
    for q in queries:
        if len(q.encode()) > MAX_QUERY_BYTES:
            raise ValueError(f"a query of {len(q.encode())} bytes is over the limit")
    return "\n\n".join(queries) + "\n\n"


def render_schema(schema):
    """The schema as TypeDB returns it, without blank lines (for the same reason as the data)."""
    return "\n".join(line for line in schema.splitlines() if line.strip()) + "\n"


def keys_of(schema):
    """{type: its key attribute} from the schema text (TypeDB 3.14 cannot yet query annotations such as @key)."""
    keys, current = {}, None
    for line in schema.splitlines():
        if line and not line[0].isspace():
            current = line.split()[1].rstrip(",;") if len(line.split()) > 1 else None
        m = re.search(r"owns ([a-z0-9-]+) @key", line)
        if m and current:
            keys[current] = m.group(1)
    return keys


def supertypes_of(schema):
    """{type: [its supertypes, nearest first]} from the schema text."""
    parent = {}
    current = None
    for line in schema.splitlines():
        if line and not line[0].isspace() and line.split()[0] in ("entity", "relation", "attribute"):
            current = line.split()[1].rstrip(",;")
        m = re.match(r"\s+sub ([a-z0-9-]+)", line)
        if m and current:
            parent[current] = m.group(1)
    out = {}
    for t in parent:
        chain, p = [], parent.get(t)
        while p:
            chain.append(p)
            p = parent.get(p)
        out[t] = chain
    return out


def counts(instances):
    """How many instances of each type (most specific), and how many attribute ownerships and role players."""
    by_type = {}
    for inst in instances.values():
        by_type[inst["type"]] = by_type.get(inst["type"], 0) + 1
    return {"by-type": dict(sorted(by_type.items())),
            "entities": sum(1 for i in instances.values() if i["kind"] == "entity"),
            "relations": sum(1 for i in instances.values() if i["kind"] == "relation"),
            "ownerships": sum(len(i["has"]) for i in instances.values()),
            "role-players": sum(len(i["links"]) for i in instances.values())}


README = """# Noodlelab Visual Explorer: the vehicle model in TypeDB

The complete TypeDB model behind the Noodlelab Visual Explorer, exported from its live database on {day}.
The vehicle is an original concept vehicle for demonstration, not a production model. Its specifications are design
targets, not measured data.

| File | What it holds |
|---|---|
| `schema.tql` | The schema: entity, relation and attribute types, and the functions the explorer uses (TypeDB 3.14). |
| `data.tql` | The data: every entity and relation with its attributes and role players, as {queries} queries, each ended by `end;` and a blank line (each under 60 KB, as some servers and clients limit a query's size). Entities first; then relations, each batch finding its parts by key. Variables are generated (`$e1`, `$r1`...); each part's id is its `component-id` value. |

What is in it: {entities} entities and {relations} relations ({components} components, {assemblies} assemblies,
{systems} systems, {connections} connections, {dependencies} dependencies, {loops} control loops), {ownerships}
attribute values and {players} role players.

## Load it into your own TypeDB

You need a TypeDB 3.14 server (for example `docker run -p 1729:1729 typedb/typedb:3.14.1`) and TypeDB Console, a
TypeDB driver or TypeDB Studio. Load the schema in a schema transaction and commit; then run the data's queries
in order in one write transaction and commit.

**With TypeDB Console** (3.x), from the folder holding these files:

```
typedb console --address 127.0.0.1:1729 --username admin --password password --tls-disabled
>> database create vehicle
>> transaction schema vehicle
vehicle::schema>> source schema.tql
vehicle::schema>> commit
>> transaction write vehicle
vehicle::write>> source data.tql
vehicle::write>> commit
```

**With the Python driver** (`pip install typedb-driver==3.*`):

```python
from pathlib import Path
from typedb.driver import TypeDB, Credentials, DriverOptions, DriverTlsConfig, TransactionType

driver = TypeDB.driver("127.0.0.1:1729", Credentials("admin", "password"), DriverOptions(DriverTlsConfig.disabled()))
driver.databases.create("vehicle")
with driver.transaction("vehicle", TransactionType.SCHEMA) as tx:
    tx.query(Path("schema.tql").read_text()).resolve()
    tx.commit()
with driver.transaction("vehicle", TransactionType.WRITE) as tx:
    for query in Path("data.tql").read_text().split("\\n\\n"):  # the queries are separated by blank lines
        if query.strip():
            tx.query(query).resolve()
    tx.commit()
```

**With TypeDB Studio:** run `schema.tql` in a schema transaction and commit. Then open a write transaction, run
each of the {queries} queries in `data.tql` in order (each ends with `end;`), and commit.

Loading takes a few seconds. This export was checked by loading it into a fresh database and comparing every
type's instance count, the attribute values and role players, and the answers to the queries below with the
original.

## Queries to try (in a read transaction)

How many components of each kind (polymorphism: `component` is abstract, every instance has a more specific type):

```
match $c isa! $t; $t sub component;
reduce $n = count groupby $t;
```

Every part of the propulsion system, through sub-systems at any depth (a recursive function in `schema.tql`):

```
match
  $s isa system, has system-id "propulsion";
  let $c in system_components($s);
fetch {{ "id": $c.component-id, "name": $c.name }};
```

Every sensor, whatever its kind:

```
match $x isa sensor; $x isa! $type;
fetch {{ "id": $x.component-id, "name": $x.name, "type": $type }};
```

How the front-right brake calliper is connected (any subtype of the `connection` relation):

```
match
  $c isa component, has component-id "caliper-fr";
  $r isa! $kind, links (endpoint: $c, endpoint: $other);
fetch {{ "kind": $kind, "other": $other.name, "details": {{ $r.* }} }};
```

What stops working, function by function, if the 12 V battery fails (recursive failure reasoning):

```
match
  $start isa component, has component-id "lv-battery";
  let $p, $g, $c, $f in lost_steps($start);
fetch {{ "part": $c.name, "loses": $f.function-name, "because": $p.name, "needs": $g.function-name }};
```

The total energy stored in the battery modules:

```
match $m isa battery-module, has energy-capacity-kwh $e;
reduce $kwh = sum($e), $modules = count;
```
"""


def build(driver, database):
    """The model as {file name: text}, read from the database in one READ transaction."""
    schema = driver.databases.get(database).schema()
    with driver.transaction(database, READ) as tx:
        instances = read_model(tx)
    data = render_data(instances, keys_of(schema), supertypes_of(schema))
    c = counts(instances)
    t = c["by-type"]
    sup = supertypes_of(schema)
    total = lambda root: sum(n for ty, n in t.items() if ty == root or root in sup.get(ty, []))
    readme = README.format(
        queries=sum(1 for q in data.split("\n\n") if q.strip()), day=date.today().isoformat(), entities=c["entities"], relations=c["relations"], components=total("component"),
        assemblies=total("assembly"), systems=total("system"), connections=total("connection"),
        dependencies=total("dependency"), loops=total("control-loop"), ownerships=c["ownerships"], players=c["role-players"])
    return {"schema.tql": render_schema(schema), "data.tql": data, "README.md": readme}, c


def zip_bytes(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in files.items():
            z.writestr(f"noodlelab-vehicle-typedb-model/{name}", text)
    return buffer.getvalue()
