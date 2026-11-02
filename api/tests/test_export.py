"""The downloadable TypeDB model. The regression test takes the ZIP exactly as the app serves it, loads it into a
fresh database with the README's own instructions, and compares everything with the source (explorer/export_check.py).
"""

import io
import zipfile

from explorer import export, export_check


def test_the_downloaded_zip_recreates_the_database(client, driver, database):
    response = client.get("/api/export/model.zip")
    assert response.status_code == 200 and response.headers["content-type"] == "application/zip"
    assert "noodlelab-vehicle-typedb-model.zip" in response.headers["content-disposition"]
    files = export_check.unzip(response.content)
    assert sorted(files) == ["README.md", "data.tql", "schema.tql"]
    problems, report, totals = export_check.check(driver, database, files)
    assert problems == [], "\n".join(report)
    assert totals["component"] == (423, 423)
    assert totals["connection"] == (676, 676)
    assert totals["dependency"] == (396, 396)
    assert totals["assembly"][0] == totals["assembly"][1] > 0
    assert totals["vehicle-function"][0] == totals["vehicle-function"][1] > 0


def test_the_files_hold_the_schema_with_functions_and_the_data(client):
    with zipfile.ZipFile(io.BytesIO(client.get("/api/export/model.zip").content)) as z:
        schema = z.read("noodlelab-vehicle-typedb-model/schema.tql").decode()
        data = z.read("noodlelab-vehicle-typedb-model/data.tql").decode()
    assert schema.startswith("define") and "fun system_components(" in schema and "fun lost_steps(" in schema
    # ids are attribute values, never variable names
    assert data.startswith("insert") and 'isa brake-caliper, has component-id "caliper-fr"' in data
    assert "$caliper-fr" not in data
    # a series of queries, each small enough for size-limited servers and clients
    queries = [q for q in data.split("\n\n") if q.strip()]
    assert len(queries) > 1 and all(len(q.encode()) <= export.MAX_QUERY_BYTES for q in queries)


def test_the_syntax_check_catches_what_strict_parsers_reject():
    ok = {"schema.tql": "define\nentity a;\n",
          "data.tql": 'insert\n  $e1 isa a, has name "x-$y # z";\nend;\n\nmatch\n  $e1 isa a;\ninsert\n  $e2 isa a;\nend;\n\n'}
    assert export_check.syntax_problems(ok) == []
    for bad in ('insert\n  $brake-booster isa a;\nend;\n\n',          # hyphenated variable
                'insert\n  $e_1 isa a;\nend;\n\n',                    # underscore
                'insert\n  # note\n  $e1 isa a;\nend;\n\n',          # comment
                'insert\n  $e1 isa a;\n\n  $e2 isa a;\nend;\n\n',    # blank line inside a query
                'insert\n  $e1 isa a, has size 1e-07;\nend;\n\n',     # exponent
                'insert\n  $e1 isa a;\n\n',                          # no end;
                'insert\n' + '  $e1 isa a;\n' * 6000 + 'end;\n\n'):  # over the size limit
        assert export_check.syntax_problems({**ok, "data.tql": bad}), bad


def test_values_are_written_as_typeql_literals():
    class Attr:
        def __init__(self, v, k): self.v, self.k = v, k
        def get_value(self): return self.v
        def get_value_type(self): return self.k
    assert export._literal(Attr('say "hi"', "string")) == '"say \\"hi\\""'
    assert export._literal(Attr(800, "double")) == "800.0"
    assert export._literal(Attr(1e-7, "double")) == "0.0000001"
    assert export._literal(Attr(2.5e20, "double")) == "250000000000000000000.0"
    assert export._literal(Attr(6, "integer")) == "6"
