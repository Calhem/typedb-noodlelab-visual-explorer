"""Check the downloadable model: take the ZIP the app serves, load it into a fresh database exactly as its README
says (running the README's own Python instructions in a separate interpreter), and compare with the source.

    python -m explorer.export_check [source-database]

Checks the files' syntax (generated variables are letters and digits only; no comments, blank lines or exponent
numbers), then compares the named totals (components, connections, dependencies, assemblies, systems, functions...),
every instance (type, attribute values and role players, matched without IIDs), every type's instance count, the
schema, representative explorer answers and the README's example queries. Prints a report; exits non-zero on any
difference. The fresh database ("vehicle-export-check-<random>") is deleted afterwards.
"""

import io
import json
import re
import subprocess
import sys
import tempfile
import uuid
import zipfile
from collections import Counter
from pathlib import Path
from pathlib import Path

from explorer import export, queries, questions
from explorer.db import READ, connect, settings

# The totals compared by name (each counts instances of the type and its subtypes).
TOTALS = ["component", "connection", "dependency", "assembly", "system", "vehicle-function", "fallback", "control-loop",
          "assembly-membership", "system-membership", "visual-representation"]


def unzip(data):
    """{file name: text} from the model ZIP."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return {n.split("/", 1)[1]: z.read(n).decode() for n in z.namelist()}


def syntax_problems(files):
    """Generated syntax that a strict or size-limited TypeQL client could reject: data.tql must be queries
    separated by blank lines, each under export.MAX_QUERY_BYTES and starting with insert or match, with plain
    variables (letters and digits), no comments and no exponent numbers; schema.tql must have no blank lines."""
    data, problems = files["data.tql"], []
    queries = [q for q in data.split("\n\n") if q.strip()]
    if not queries:
        problems.append("data.tql has no queries")
    for n, q in enumerate(queries, 1):
        if len(q.encode()) > export.MAX_QUERY_BYTES:
            problems.append(f"data.tql query {n} is {len(q.encode())} bytes")
        if not q.lstrip("\n").startswith(("insert", "match")):
            problems.append(f"data.tql query {n} does not start with insert or match")
        if not q.rstrip().endswith("end;"):
            problems.append(f"data.tql query {n} does not end with end;")
    outside_strings = re.sub(r'"(?:[^"\\]|\\.)*"', '""', data)
    bad = sorted(set(v for v in re.findall(r"\$[^\s,;():]+", outside_strings) if not re.fullmatch(r"\$[a-z][a-z0-9]*", v)))
    if bad:
        problems.append(f"variables that are not plain letters and digits: {bad[:5]}")
    if any(not line.strip() for line in files["schema.tql"].splitlines()):
        problems.append("schema.tql has blank lines")
    if "#" in outside_strings:
        problems.append("data.tql has comments")
    if re.search(r"(?<![\w$])\d+(\.\d+)?[eE][-+]?\d", outside_strings):
        problems.append("data.tql has numbers in exponent notation")
    return problems


def load_with_readme(files, database):
    """Load the files into a new database by running the README's Python instructions unchanged, apart from this
    server's address, credentials and the database name, in a fresh interpreter in a folder holding the files."""
    s = settings()
    code = files["README.md"].split("```python", 1)[1].split("```", 1)[0]
    code = (code.replace('"127.0.0.1:1729"', repr(s["address"]))
                .replace('Credentials("admin", "password")', f'Credentials({s["username"]!r}, {s["password"]!r})')
                .replace('"vehicle"', repr(database)))
    with tempfile.TemporaryDirectory() as folder:
        for name, text in files.items():
            Path(folder, name).write_text(text)
        Path(folder, "load.py").write_text(code)
        run = subprocess.run([sys.executable, "-I", "load.py"], cwd=folder, capture_output=True, text=True, timeout=600)
    if run.returncode != 0:
        raise RuntimeError("loading with the README's instructions failed:\n" + run.stderr[-2000:])


def totals(driver, database):
    out = {}
    with driver.transaction(database, READ) as tx:
        for t in TOTALS:
            rows = list(tx.query(f"match $x isa {t}; reduce $n = count;").resolve().as_concept_rows())
            out[t] = rows[0].get("n").get_integer() if rows else 0
    return out


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


def check(driver, source, files=None, loaded=None):
    """Returns (problems, report lines, {type: (source total, loaded total)}). `files` defaults to a fresh export
    of the source, packed and unpacked through the same ZIP the app serves. `loaded` names a database already
    loaded from those files some other way (for example with TypeDB Console); it is compared, not deleted."""
    files = files or unzip(export.zip_bytes(export.build(driver, source)[0]))
    problems = syntax_problems(files)
    report = [f"syntax: {'clean' if not problems else '; '.join(problems)}"]
    target = loaded or f"vehicle-export-check-{uuid.uuid4().hex[:8]}"
    try:
        if loaded:
            report.append(f"comparing {loaded}, loaded beforehand")
        else:
            load_with_readme(files, target)
            report.append("loaded into a fresh database with the README's Python instructions")
        ta, tb = totals(driver, source), totals(driver, target)
        named = {t: (ta[t], tb[t]) for t in TOTALS}
        for t, (a, b) in named.items():
            report.append(f"{t}: {a} source, {b} loaded")
            if a != b:
                problems.append(f"{t} totals differ")
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
        return problems, report, named
    finally:
        if not loaded and driver.databases.contains(target):
            driver.databases.get(target).delete()


def main():
    """python -m explorer.export_check [source] [--zip FILE --loaded DATABASE]: with --loaded, compare a database
    already loaded from that ZIP (e.g. with TypeDB Console) instead of loading one."""
    args = sys.argv[1:]
    opt = lambda name: args[args.index(name) + 1] if name in args else None
    positional = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))]
    source = positional[0] if positional else settings()["database"]
    driver = connect()
    files = unzip(Path(opt("--zip")).read_bytes()) if opt("--zip") else None
    problems, report, _ = check(driver, source, files, opt("--loaded"))
    print("\n".join(report))
    print("OK: the export reproduces the database" if not problems else "PROBLEMS: " + "; ".join(problems))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
