"""The downloadable TypeDB model reproduces the database it was exported from (explorer/export_check.py)."""

import io
import zipfile

from explorer import export, export_check


def test_the_export_reproduces_the_database(driver, database):
    problems, report = export_check.check(driver, database)
    assert problems == [], "\n".join(report)


def test_the_zip_holds_the_schema_the_data_and_a_readme(client):
    response = client.get("/api/export/model.zip")
    assert response.status_code == 200 and response.headers["content-type"] == "application/zip"
    assert "noodlelab-vehicle-typedb-model.zip" in response.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        names = sorted(n.split("/", 1)[1] for n in z.namelist())
        assert names == ["README.md", "data.tql", "schema.tql"]
        schema = z.read("noodlelab-vehicle-typedb-model/schema.tql").decode()
        data = z.read("noodlelab-vehicle-typedb-model/data.tql").decode()
    assert schema.startswith("define") and "fun system_components(" in schema and "fun lost_steps(" in schema
    assert data.startswith("insert") and '$caliper-fr isa brake-caliper, has component-id "caliper-fr"' in data


def test_values_are_written_as_typeql_literals():
    class Attr:
        def __init__(self, v, k): self.v, self.k = v, k
        def get_value(self): return self.v
        def get_value_type(self): return self.k
    assert export._literal(Attr('say "hi"', "string")) == '"say \\"hi\\""'
    assert export._literal(Attr(800, "double")) == "800.0"
    assert export._literal(Attr(1e-7, "double")) == "1e-07"
    assert export._literal(Attr(6, "integer")) == "6"
