"""Connecting to TypeDB and running queries. Everything else in the backend uses this.

Adapted from Project Apex's apex/db.py (same author).
"""

import os
import textwrap
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


def fetch(tx, query):
    """Run a fetch query inside an open transaction; returns a list of JSON-like documents."""
    return list(tx.query(query).resolve().as_concept_documents())


def rows(tx, query):
    """Run a match/reduce query inside an open transaction; returns a list of answer rows."""
    return list(tx.query(query).resolve().as_concept_rows())


class RecordingTransaction:
    """Wraps an open transaction and remembers every query run through it, in order.

    The API uses it so each answer carries the exact TypeQL that produced it (parameters included),
    never a hand-kept copy that could drift from what actually ran.
    """

    def __init__(self, tx):
        self._tx = tx
        self.queries = []

    def query(self, text):
        self.queries.append(textwrap.dedent(text).strip())
        return self._tx.query(text)


def run_file(driver, database, path, kind=SCHEMA):
    """Run a whole .tql file as one query and commit."""
    with driver.transaction(database, kind) as tx:
        tx.query(Path(path).read_text()).resolve()
        tx.commit()
