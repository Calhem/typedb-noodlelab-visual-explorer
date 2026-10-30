"""The semantic HTTP API (FastAPI). Read-only: every endpoint is a GET, opens only READ transactions and runs
only the named queries in explorer/queries.py. The browser never sends TypeQL and never sees credentials.

Every answer has the shape {"data": ..., "typeql": [...], "timings-ms": [...]}: "typeql" lists the exact
queries that produced it, in the order they ran (recorded as they ran, parameters included), and
"timings-ms" how long each took in TypeDB, measured to its last answer.

If TypeDB is unreachable, every endpoint answers 503 with {"error": "typedb-unavailable"}: there is no
fallback data. The connection is opened on first use and reopened after a failure, so the API recovers
by itself when TypeDB comes back.
"""

import logging
import threading
from typing import Annotated

from fastapi import FastAPI, Path
from fastapi.responses import JSONResponse

from explorer import queries
from explorer.db import READ, RecordingTransaction, connect, settings

log = logging.getLogger("explorer.api")

# Stable ids: lower-case words separated by single hyphens (the same rule the schema enforces).
ID = r"^[a-z0-9]+(-[a-z0-9]+)*$"
Id = Annotated[str, Path(pattern=ID, max_length=64)]

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

    def reset(self):
        with self._lock:
            if self._driver is not None:
                try:
                    self._driver.close()
                except Exception:
                    pass
                self._driver = None

    def read(self, question, *args):
        """Run one named question in a READ transaction; returns (answer, the queries that ran, their timings in ms)."""
        driver = self.driver()
        try:
            with driver.transaction(self.name, READ) as tx:
                recorder = RecordingTransaction(tx)
                return question(recorder, *args), recorder.queries, recorder.timings_ms
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
        data, typeql, timings = db.read(question, *args)
        return {"data": data, "typeql": typeql, "timings-ms": timings}

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

    @app.get("/api/assemblies/{assembly_id}")
    def assembly(assembly_id: Id):
        return answer(queries.assembly, assembly_id)

    @app.get("/api/systems")
    def systems():
        return answer(queries.system_list)

    @app.get("/api/systems/{system_id}")
    def system(system_id: Id):
        return answer(queries.system, system_id)

    return app


app = create_app()
