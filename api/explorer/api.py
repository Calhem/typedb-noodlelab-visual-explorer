"""The semantic HTTP API (FastAPI). Read-only: every endpoint is a GET, opens only READ transactions and runs
only the named queries in explorer/queries.py. The browser never sends TypeQL and never sees credentials.

Every answer has the shape {"data": ..., "typeql": [...], "timings-ms": [...], "purposes": [...],
"result-queries": [...], "processing": [...]}: "typeql" lists the exact queries that produced it, in the order
they ran (recorded as they ran, parameters included); "timings-ms" how long each took in TypeDB, measured to its
last answer; "purposes" what each was for; "result-queries" the indexes of the queries whose answers are the
components the answer is about; and "processing" the steps the API did itself, in Python, with the answers.

If TypeDB is unreachable, every endpoint answers 503 with {"error": "typedb-unavailable"}: there is no
fallback data. The connection is opened on first use and reopened after a failure, so the API recovers
by itself when TypeDB comes back.
"""

import logging
import threading
import time
from typing import Annotated

from fastapi import FastAPI, Path
from fastapi.responses import JSONResponse, Response

from explorer import export, queries, questions
from explorer.db import READ, RecordingTransaction, connect, settings

log = logging.getLogger("explorer.api")

# Stable ids: lower-case words separated by single hyphens (the same rule the schema enforces).
ID = r"^[a-z0-9]+(-[a-z0-9]+)*$"
Id = Annotated[str, Path(pattern=ID, max_length=64)]
# Schema names: type labels (hyphens) and function names (underscores).
Name = Annotated[str, Path(pattern=r"^[a-z0-9]+([-_][a-z0-9]+)*$", max_length=64)]

UNAVAILABLE = "TypeDB is not reachable, so semantic information cannot be shown. The 3D model still works."
QUERY_FAILED = "TypeDB could not answer this question. The API log has the details."


class Unavailable(Exception):
    pass


class QueryFailed(Exception):
    pass


class Database:
    """One shared TypeDB connection, opened on first use. The driver is thread-safe, and FastAPI runs these
    plain (non-async) endpoints in a thread pool."""

    def __init__(self, address=None, database=None):
        self.address = address
        self.name = database or settings()["database"]
        self._driver = None
        self._lock = threading.Lock()

    def driver(self):
        with self._lock:
            if self._driver is None:
                try:
                    driver = connect(self.address)
                    if not driver.databases.contains(self.name):
                        driver.close()
                        raise Unavailable(f"TypeDB is running but has no '{self.name}' database. Run the seed step.")
                except Unavailable:
                    raise
                except Exception as error:
                    log.warning("TypeDB connection failed: %s", error)
                    raise Unavailable(UNAVAILABLE) from error
                self._driver = driver
            return self._driver

    def schema(self):
        """The database's schema as TypeDB writes it (one `define`), and how long reading it took in ms. This is a
        driver call, not a TypeQL query."""
        driver = self.driver()
        start = time.perf_counter()
        try:
            text = driver.databases.get(self.name).schema()
        except Exception as error:
            log.warning("TypeDB schema read failed: %s", error)
            self.reset()
            raise Unavailable(UNAVAILABLE) from error
        return text, round((time.perf_counter() - start) * 1000, 1)

    def model(self):
        """The whole model as TypeQL files (see explorer/export.py), read from this database."""
        driver = self.driver()
        try:
            return export.build(driver, self.name)[0]
        except Exception as error:
            log.warning("TypeDB export failed: %s", error)
            try:
                driver.databases.contains(self.name)
            except Exception:
                self.reset()
                raise Unavailable(UNAVAILABLE) from error
            raise QueryFailed(QUERY_FAILED) from error

    def reset(self):
        with self._lock:
            if self._driver is not None:
                try:
                    self._driver.close()
                except Exception:
                    pass
                self._driver = None

    def read(self, question, *args):
        """Run one named question in a READ transaction; returns (answer, the recording of the queries that ran)."""
        driver = self.driver()
        try:
            with driver.transaction(self.name, READ) as tx:
                recorder = RecordingTransaction(tx)
                return question(recorder, *args), recorder
        except queries.NotFound:
            raise
        except Exception as error:
            log.warning("TypeDB query failed: %s", error)
            # Tell a broken connection apart from a failing query: only the first is "unavailable".
            try:
                driver.databases.contains(self.name)
            except Exception:
                self.reset()   # the next request reconnects
                raise Unavailable(UNAVAILABLE) from error
            raise QueryFailed(QUERY_FAILED) from error


def create_app(db=None):
    db = db or Database()
    app = FastAPI(title="Noodlelab Visual Explorer semantic API", docs_url="/api/docs", openapi_url="/api/openapi.json")

    @app.exception_handler(Unavailable)
    def unavailable(_, error):
        return JSONResponse(status_code=503, content={"error": "typedb-unavailable", "message": str(error)})

    @app.exception_handler(QueryFailed)
    def query_failed(_, error):
        return JSONResponse(status_code=500, content={"error": "query-failed", "message": str(error)})

    @app.exception_handler(queries.NotFound)
    def not_found(_, error):
        return JSONResponse(status_code=404, content={"error": "not-found", "message": f"No {error} in TypeDB."})

    def answer(question, *args):
        data, r = db.read(question, *args)
        return {"data": data, "typeql": r.queries, "timings-ms": r.timings_ms, "purposes": r.purposes,
                "result-queries": r.results, "processing": r.processing}

    @app.get("/api/health")
    def health():
        try:
            db.read(lambda tx: queries.rows(tx, "match $c isa component; limit 1;"))
            return {"typedb": "available", "database": db.name}
        except Unavailable as error:
            return JSONResponse(status_code=503, content={"typedb": "unavailable", "error": "typedb-unavailable", "message": str(error)})

    @app.get("/api/components")
    def components():
        return answer(queries.component_list)

    @app.get("/api/components/{component_id}")
    def component(component_id: Id):
        return answer(queries.component, component_id)

    @app.get("/api/components/{component_id}/assembly")
    def component_assembly(component_id: Id):
        return answer(queries.component_assembly, component_id)

    @app.get("/api/components/{component_id}/systems")
    def component_systems(component_id: Id):
        return answer(queries.component_systems, component_id)

    @app.get("/api/components/{component_id}/relationships")
    def component_relationships(component_id: Id):
        return answer(queries.component_relationships, component_id)

    @app.get("/api/components/{component_id}/impact")
    def component_impact(component_id: Id):
        return answer(queries.component_impact, component_id)

    @app.get("/api/components/{component_id}/requirements")
    def component_requirements(component_id: Id):
        return answer(queries.component_requirements, component_id)

    @app.get("/api/assemblies")
    def assemblies():
        return answer(queries.assembly_tree)

    @app.get("/api/types")
    def types():
        return answer(queries.type_hierarchy)

    @app.get("/api/types/{label}")
    def type_detail(label: Id):
        return answer(queries.type_detail, label)

    @app.get("/api/questions")
    def question_list():
        return {"data": questions.question_list(None), "typeql": [], "timings-ms": [], "purposes": [], "result-queries": [],
                "processing": []}

    @app.get("/api/questions/{question_id}")
    def question(question_id: Id):
        return answer(questions.run, question_id)

    @app.get("/api/assemblies/{assembly_id}")
    def assembly(assembly_id: Id):
        return answer(queries.assembly, assembly_id)

    @app.get("/api/schema/{name}")
    def schema(name: Name):
        """A type's or function's definition (with its supertypes'), read from the database's schema. No TypeQL
        query runs, so "typeql" is empty and "schema-ms" says how long the read took."""
        text, ms = db.schema()
        return {"data": queries.schema_definitions(text, name), "typeql": [], "timings-ms": [], "purposes": [],
                "result-queries": [], "processing": ["Python cuts this definition from the schema text TypeDB returns."],
                "schema-ms": ms, "source": "database.schema()"}

    @app.get("/api/export/model.zip")
    def model_zip():
        """The downloadable TypeDB model: schema.tql, data.tql and README.md, exported from the live database."""
        return Response(export.zip_bytes(db.model()), media_type="application/zip",
                        headers={"Content-Disposition": 'attachment; filename="noodlelab-vehicle-typedb-model.zip"'})

    @app.get("/api/systems")
    def systems():
        return answer(queries.system_list)

    @app.get("/api/systems/{system_id}")
    def system(system_id: Id):
        return answer(queries.system, system_id)

    return app


app = create_app()
