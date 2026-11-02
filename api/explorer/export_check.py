"""Check the downloadable model: export the database, load the export into a fresh database, and compare the two.

    python -m explorer.export_check [source-database]

Compares every instance (type, attribute values and role players, matched without IIDs), the instance count of
every type, and the answers to representative explorer queries. Prints a report; exits non-zero on any difference.
The fresh database ("vehicle-export-check-<random>") is deleted afterwards.
"""

import json
import sys
import uuid
from collections import Counter
from pathlib import Path

from explorer import export, queries, questions
from explorer.db import READ, SCHEMA, WRITE, connect, settings


def canonical(instances):
    """Each instance as text without IIDs: entities by type and attributes, relations also by their role players'
    canonical forms (relations playing roles are resolved first)."""
    memo = {}

    def form(i):
        if i not in memo:
            inst = instances[i]
            players = sorted(f"{role}={form(p)}" for role, p in inst["links"])
            memo[i] = f"{inst['type']}{sorted(inst['has'])}{players}"
        return memo[i]
    return Counter(form(i) for i in instances)


def readme_queries(readme):
    """The TypeQL examples in the README (fenced blocks starting with match)."""
    blocks = readme.split("```")[1::2]
    return [b.strip() for b in blocks if b.strip().startswith("match")]


def normalise(value):
    """Answers with every list sorted: TypeDB returns answers in no particular order, and the comparison is about
    what the answers are."""
    if isinstance(value, dict):
        return {k: normalise(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return sorted((normalise(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True, default=str))
    return value


def answers(driver, database):
    """Representative explorer answers, as plain data."""
    with driver.transaction(database, READ) as tx:
        return {
            "systems": queries.system_list(tx),
            "propulsion": sorted(c["id"] for c in queries.system(tx, "propulsion")["components"]),
            "powertrain": queries.assembly(tx, "powertrain")["all-component-ids"],
            "types": queries.type_hierarchy(tx),
            "sensors": queries.type_detail(tx, "sensor")["instances"],
            "caliper-relationships": queries.component_relationships(tx, "caliper-fr"),
            "lv-battery-impact": queries.component_impact(tx, "lv-battery"),
            "front-motor-requirements": queries.component_requirements(tx, "front-motor"),
            "pack-energy": questions.run(tx, "pack-energy"),
            "load-path": questions.run(tx, "load-path"),
        }


def check(driver, source, files=None):
    """Returns (problems, report lines)."""
    files = files or export.build(driver, source)[0]
    target = f"vehicle-export-check-{uuid.uuid4().hex[:8]}"
    driver.databases.create(target)
    try:
        for name, kind in (("schema.tql", SCHEMA), ("data.tql", WRITE)):
            with driver.transaction(target, kind) as tx:
                tx.query(files[name]).resolve()
                tx.commit()
        report, problems = [], []
        with driver.transaction(source, READ) as a, driver.transaction(target, READ) as b:
            ia, ib = export.read_model(a), export.read_model(b)
        ca, cb = export.counts(ia), export.counts(ib)
        for k in ("entities", "relations", "ownerships", "role-players"):
            report.append(f"{k}: {ca[k]} original, {cb[k]} loaded")
            if ca[k] != cb[k]:
                problems.append(f"{k} differ")
        if ca["by-type"] != cb["by-type"]:
            problems.append("per-type counts differ: " + str({t: (ca["by-type"].get(t), cb["by-type"].get(t))
                            for t in set(ca["by-type"]) | set(cb["by-type"]) if ca["by-type"].get(t) != cb["by-type"].get(t)}))
        report.append(f"types with instances: {len(ca['by-type'])}, every count equal: {ca['by-type'] == cb['by-type']}")
        same = canonical(ia) == canonical(ib)
        report.append(f"every instance identical (type, attributes, role players): {same}")
        if not same:
            problems.append("instances differ")
        if driver.databases.get(source).schema() != driver.databases.get(target).schema():
            problems.append("schemas differ")
        report.append("schema identical: " + str("schemas differ" not in problems))
        qa, qb = normalise(answers(driver, source)), normalise(answers(driver, target))
        for name in qa:
            ok = qa[name] == qb[name]
            report.append(f"query {name}: {'same answer' if ok else 'DIFFERENT'}")
            if not ok:
                problems.append(f"query {name} differs")
        for i, q in enumerate(readme_queries(files["README.md"]), 1):
            with driver.transaction(target, READ) as tx:
                try:
                    answer = tx.query(q).resolve()
                    n = len(list(answer.as_concept_documents() if answer.is_concept_documents() else answer.as_concept_rows()))
                    report.append(f"README query {i}: {n} answers")
                    if n == 0:
                        problems.append(f"README query {i} has no answers")
                except Exception as error:
                    problems.append(f"README query {i} fails: {error}")
        return problems, report
    finally:
        driver.databases.get(target).delete()


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else settings()["database"]
    driver = connect()
    problems, report = check(driver, source)
    print("\n".join(report))
    print("OK: the export reproduces the database" if not problems else "PROBLEMS: " + "; ".join(problems))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
