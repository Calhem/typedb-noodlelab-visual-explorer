"""Connecting to TypeDB and running queries. Everything else in the backend uses this.

Adapted from Project Apex's apex/db.py (same author).
"""

import os
import textwrap
import time
from pathlib import Path

from typedb.driver import Credentials, DriverOptions, DriverTlsConfig, TransactionType, TypeDB

READ, WRITE, SCHEMA = TransactionType.READ, TransactionType.WRITE, TransactionType.SCHEMA

PROJECT = Path(__file__).resolve().parents[2]


def settings():
    """Connection settings from the environment. The defaults are TypeDB's own for a local server
    (compose.yaml binds it to 127.0.0.1, so only this computer can reach it)."""
    return {
        "address": os.environ.get("TYPEDB_ADDRESS", "127.0.0.1:1733"),
        "username": os.environ.get("TYPEDB_USERNAME", "admin"),
        "password": os.environ.get("TYPEDB_PASSWORD", "password"),
        "database": os.environ.get("TYPEDB_DATABASE", "vehicle"),
    }


def connect(address=None):
    """Open a connection ("driver") to the TypeDB server."""
    s = settings()
    return TypeDB.driver(
        address or s["address"],
        Credentials(s["username"], s["password"]),
        # The local server has TLS (encryption) switched off.
        DriverOptions(DriverTlsConfig.disabled()),
    )


def string(value):
    """Write a Python string as a TypeQL string literal, escaping characters that would break it.

    Always use this when putting text into a query, never plain quotes.
    """
    escaped = (
        value.replace("\\", "\\\\").replace('"', '\\"')
        .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
    )
    return f'"{escaped}"'


def fetch(tx, query, purpose=None, result=False):
    """Run a fetch query inside an open transaction; returns a list of JSON-like documents.

    `purpose` says in a few words what the query is for, and `result` marks the query whose answers are the
    components an answer is about (the ones the app highlights), so the app can show which query did what.
    """
    start = time.perf_counter()
    out = list(tx.query(query).resolve().as_concept_documents())
    _note(tx, start, purpose, result)
    return out


def rows(tx, query, purpose=None, result=False):
    """Run a match/reduce query inside an open transaction; returns a list of answer rows."""
    start = time.perf_counter()
    out = list(tx.query(query).resolve().as_concept_rows())
    _note(tx, start, purpose, result)
    return out


def _note(tx, start, purpose, result):
    """Record how long the last query took (until every answer was read) and what it was for, if the
    transaction is recording."""
    if isinstance(tx, RecordingTransaction):
        tx.timings_ms.append(round((time.perf_counter() - start) * 1000, 1))
        tx.purposes.append(purpose)
        if result:
            tx.results.append(len(tx.queries) - 1)


def processing(tx, text):
    """Note a step the API itself does with the answers, in Python, after TypeDB has answered (such as walking
    parent links or counting). The app shows these apart from the queries, so it never credits TypeDB with
    work it did not do."""
    if isinstance(tx, RecordingTransaction):
        tx.processing.append(text)


class RecordingTransaction:
    """Wraps an open transaction and remembers every query run through it, in order.

    The API uses it so each answer carries the exact TypeQL that produced it (parameters included),
    never a hand-kept copy that could drift from what actually ran.
    """

    def __init__(self, tx):
        self._tx = tx
        self.queries = []
        self.timings_ms = []     # one per query, in the same order (time to the last answer)
        self.purposes = []       # one per query: what it is for (or None)
        self.results = []        # indexes of the queries whose answers are the components the answer is about
        self.processing = []     # steps done in Python after TypeDB answered

    def query(self, text):
        self.queries.append(textwrap.dedent(text).strip())
        return self._tx.query(text)


def run_file(driver, database, path, kind=SCHEMA):
    """Run a whole .tql file as one query and commit."""
    with driver.transaction(database, kind) as tx:
        tx.query(Path(path).read_text()).resolve()
        tx.commit()
