"""Named questions for the Questions tab: each shows a TypeDB capability that goes beyond looking up one part.

Every question is read-only TypeQL against the live database; the answer carries a short summary, a table,
the component ids to highlight in 3D, and (through the API) the exact TypeQL with its timing. The titles and
explanations below describe the questions, not the vehicle: every fact in an answer comes from TypeDB.
"""

from explorer.db import fetch, rows
from explorer.queries import NotFound, _label


def _num(row, column):
    """A number from a reduce answer (sums of doubles come back as doubles, counts as integers)."""
    value = row.get(column)
    return float(value.get_double()) if value.is_double() else float(value.get_integer())


def pack_energy(tx):
    r = rows(tx, """
        match $m isa battery-module, has energy-capacity-kwh $e, has nominal-voltage-v $v;
        reduce $kwh = sum($e), $volts = sum($v), $modules = count;
    """)[0]
    ids = fetch(tx, 'match $m isa battery-module; fetch { "id": $m.component-id };')
    kwh, volts, n = _num(r, "kwh"), _num(r, "volts"), int(_num(r, "modules"))
    return {"summary": f"{kwh:g} kWh from {n} modules; {volts:g} V with the modules in series",
            "columns": ["Modules", "Energy (kWh)", "Voltage in series (V)"], "rows": [[n, kwh, volts]],
            "highlight": [i["id"] for i in ids]}


def drive_power(tx):
    r = rows(tx, """
        match $m isa electric-motor, has peak-power-kw $p, has peak-torque-nm $t;
        reduce $kw = sum($p), $nm = sum($t), $motors = count;
    """)[0]
    motors = fetch(tx, """
        match $m isa electric-motor, has peak-power-kw $p, has peak-torque-nm $t;
        fetch { "id": $m.component-id, "name": $m.name, "kw": $p, "nm": $t };
    """)
    return {"summary": f"{_num(r, 'kw'):g} kW and {_num(r, 'nm'):g} N·m peak from {int(_num(r, 'motors'))} motors",
            "columns": ["Motor", "Peak power (kW)", "Peak torque (N·m)"],
            "rows": [[m["name"], m["kw"], m["nm"]] for m in sorted(motors, key=lambda m: m["name"])],
            "highlight": [m["id"] for m in motors]}


def sensors_by_type(tx):
    counts = fetch(tx, """
        match $x isa sensor; $x isa! $type;
        reduce $n = count groupby $type;
        fetch { "type": $type, "n": $n };
    """)
    ids = fetch(tx, 'match $x isa sensor; fetch { "id": $x.component-id };')
    table = sorted(([_label(c["type"]), c["n"]] for c in counts), key=lambda r: (-r[1], r[0]))
    return {"summary": f"{len(ids)} sensors of {len(table)} types, found with one query for the abstract type 'sensor'",
            "columns": ["Type", "Count"], "rows": table, "highlight": [i["id"] for i in ids]}


def multi_system(tx):
    found = fetch(tx, """
        match $c isa component; system-membership (system: $s, member: $c);
        reduce $n = count groupby $c;
        match $n > 1;
        fetch { "id": $c.component-id, "name": $c.name, "systems": $n,
                "names": [ match system-membership (system: $s2, member: $c); fetch { "name": $s2.name }; ] };
    """)
    found.sort(key=lambda f: (-f["systems"], f["name"]))
    return {"summary": f"{len(found)} parts serve more than one functional system",
            "columns": ["Part", "Systems"],
            "rows": [[f["name"], ", ".join(sorted(n["name"] for n in f["names"]))] for f in found],
            "highlight": [f["id"] for f in found]}


def shared_sensors(tx):
    found = fetch(tx, """
        match $x isa sensor; $loop isa control-loop, links (sensor: $x);
        reduce $n = count groupby $x;
        match $n > 1;
        fetch { "id": $x.component-id, "name": $x.name, "loops": $n,
                "names": [ match $l isa control-loop, links (sensor: $x); fetch { "name": $l.name }; ] };
    """)
    found.sort(key=lambda f: f["name"])
    return {"summary": f"{len(found)} sensors feed more than one control loop",
            "columns": ["Sensor", "Control loops"],
            "rows": [[f["name"], ", ".join(sorted(n["name"] for n in f["names"]))] for f in found],
            "highlight": [f["id"] for f in found]}


def connections_by_kind(tx):
    counts = fetch(tx, """
        match $r isa! $kind; $kind sub connection;
        reduce $n = count groupby $kind;
        fetch { "kind": $kind, "n": $n };
    """)
    table = sorted(([_label(c["kind"]).replace("-connection", ""), c["n"]] for c in counts), key=lambda r: -r[1])
    return {"summary": f"{sum(r[1] for r in table)} connections of {len(table)} kinds (subtypes of one relation type)",
            "columns": ["Kind", "Count"], "rows": table, "highlight": []}


def battery_to_wheel(tx):
    edges = fetch(tx, """
        match
          $end isa component, has component-id "tyre-fl";
          let $c, $f, $p, $g in requirement_steps($end);
        fetch { "from": $c.component-id, "from-name": $c.name, "function": $f.function-name,
                "to": $p.component-id, "to-name": $p.name, "needs": $g.function-name };
    """)
    # Shortest chain of requirements from the tyre back to a battery module (breadth first).
    by_from = {}
    for e in edges:
        by_from.setdefault(e["from"], []).append(e)
    frontier, came = ["tyre-fl"], {"tyre-fl": None}
    target = None
    while frontier and not target:
        nxt = []
        for node in frontier:
            for e in by_from.get(node, []):
                if e["to"] not in came:
                    came[e["to"]] = e
                    if e["to"].startswith("battery-module-"):
                        target = e["to"]
                        break
                    nxt.append(e["to"])
            if target:
                break
        frontier = nxt
    if not target:
        return {"summary": "No path found", "columns": [], "rows": [], "highlight": []}
    chain, node = [], target
    while came[node]:
        chain.append(came[node])
        node = came[node]["from"]
    chain.reverse()
    table = [[i + 1, f"{e['to-name']}: {e['needs']}", f"{e['from-name']}: {e['function']}"] for i, e in enumerate(reversed(chain))]
    return {"summary": f"{len(chain)} steps from a battery module to the front-left tyre, found by a recursive walk",
            "columns": ["Step", "Provider: what it supplies", "to: the function it serves"], "rows": table,
            "highlight": ["tyre-fl"] + [e["to"] for e in chain]}


def propulsion_single_points(tx):
    # Two stages (docs/optimisation-backlog.md). A failure only spreads along dependencies, so a part can only
    # stop all four wheels if it is in the requirement chain of every tyre: the reverse walk finds those few
    # candidates first, and the forward failure reasoning (about 15 ms per part, however little it reaches)
    # then runs for them alone instead of for every part.
    found = fetch(tx, """
        match
          $t isa tyre;
          let $c, $f, $start, $g in requirement_steps($t);
        select $t, $start;
        distinct;
        reduce $needed-by = count groupby $start;
        match $needed-by == 4;
          let $p1, $g1, $t1, $f1 in lost_steps($start);
          $t1 isa tyre; $f1 has function-name "drive torque";
        reduce $tyres = count groupby $start;
        match $tyres == 4;
        fetch { "id": $start.component-id, "name": $start.name };
    """)
    found.sort(key=lambda f: f["name"])
    return {"summary": f"{len(found)} parts whose failure alone loses drive torque at all four wheels",
            "columns": ["Part"], "rows": [[f["name"]] for f in found], "highlight": [f["id"] for f in found]}


def load_path(tx):
    """The physical support steps behind the front-right tyre (D1.2): through the suspension and subframe into
    the body structure. The recursive walk returns every requirement; the support steps are kept and followed
    from the tyre, breadth first."""
    edges = fetch(tx, """
        match
          $end isa component, has component-id "tyre-fr";
          let $c, $f, $p, $g in requirement_steps($end);
          $d isa physical-dependency (dependent: $c, affected-function: $f, provider: $p, required-function: $g),
            has dependency-kind "support";
        fetch { "from": $c.component-id, "from-name": $c.name, "function": $f.function-name,
                "to": $p.component-id, "to-name": $p.name, "needs": $g.function-name };
    """)
    by_from = {}
    for e in edges:
        by_from.setdefault(e["from"], []).append(e)
    seen, frontier, steps = {"tyre-fr"}, ["tyre-fr"], []
    while frontier:
        nxt = []
        for node in frontier:
            for e in sorted(by_from.get(node, []), key=lambda e: (e["to-name"], e["needs"])):
                steps.append(e)
                if e["to"] not in seen:
                    seen.add(e["to"])
                    nxt.append(e["to"])
        frontier = nxt
    structure = {r["id"] for r in fetch(tx, 'match $x isa structural-member; fetch { "id": $x.component-id };')}
    ends = sorted({e["to-name"] for e in steps if e["to"] in structure and e["to"] not in by_from})
    rows = [[i + 1, f"{e['from-name']}: {e['function']}", f"{e['to-name']}: {e['needs']}"] for i, e in enumerate(steps)]
    return {"summary": f"{len(steps)} support steps from the front-right tyre, ending in the body structure: {', '.join(ends)}",
            "columns": ["Step", "Part: function", "rests on"], "rows": rows, "highlight": sorted(seen)}


QUESTIONS = {
    "pack-energy": ("How much energy does the battery store?", "Aggregation",
                    "Sums an engineering property over every battery module (reduce ... sum).", pack_energy),
    "drive-power": ("What is the combined drive power?", "Aggregation over a type",
                    "Sums peak power and torque over every instance of the electric-motor type.", drive_power),
    "sensors-by-type": ("Which sensors does the vehicle have?", "Polymorphism",
                        "One query for the abstract type 'sensor' returns cameras, radars, lidar, satellite and wheel-speed "
                        "sensors, grouped by their most specific type.", sensors_by_type),
    "multi-system": ("Which parts serve more than one system?", "Multiple membership",
                     "Counts each part's system memberships, then keeps those with more than one (a two-stage pipeline).",
                     multi_system),
    "shared-sensors": ("Which sensors feed more than one control loop?", "Cross-system relationships",
                       "Control loops are four-role relations (controller, sensors, actuators, system); this finds sensors "
                       "shared between loops.", shared_sensors),
    "connections-by-kind": ("How are the parts connected?", "Relation subtypes",
                            "Counts physical connections by their subtype: mechanical, power, data and fluid.", connections_by_kind),
    "battery-to-wheel": ("How does battery energy reach the front-left wheel?", "Recursive traversal",
                         "Walks the function-level dependencies back from the tyre with a recursive function and shows the "
                         "shortest chain to a battery module.", battery_to_wheel),
    "load-path": ("What carries the front-right wheel's load into the body?", "Recursive traversal, filtered",
                  "Walks the function-level dependencies back from the tyre with a recursive function, keeps the physical "
                  "support steps and follows them: through the knuckle, arms, spring and subframe to the towers, rails and "
                  "floor of the body structure.", load_path),
    "propulsion-single-points": ("Which single failures stop all propulsion?", "Function-level failure reasoning",
                                 "Walks back from the four tyres to find the parts every wheel's drive needs, then runs the "
                                 "failure reasoning for each of those and keeps the parts whose loss alone takes drive torque "
                                 "from all four wheels. The heaviest question: about a second.", propulsion_single_points),
}


def question_list(tx):
    return [{"id": k, "title": t, "capability": c, "explanation": e} for k, (t, c, e, _) in QUESTIONS.items()]


def run(tx, question_id):
    if question_id not in QUESTIONS:
        raise NotFound(f"question {question_id}")
    title, capability, explanation, fn = QUESTIONS[question_id]
    return {"id": question_id, "title": title, "capability": capability, "explanation": explanation, **fn(tx)}
