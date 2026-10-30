"""Test set-up. These tests need a running TypeDB server (docker compose up -d typedb) and fail, rather
than skip, when it is missing: the point is to test against the real database.

Each test session creates its own database ("vehicle-test-<random>") from the schema and seed, and deletes
it afterwards. The real "vehicle" database is never touched.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from explorer.api import Database, create_app
from explorer.db import connect
from explorer.seed import create_database


def disposable_name():
    return f"vehicle-test-{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="session")
def driver():
    d = connect()
    yield d
    d.close()


@pytest.fixture(scope="session")
def database(driver):
    """A freshly seeded database shared by tests that only read."""
    name = disposable_name()
    create_database(driver, name)
    yield name
    driver.databases.get(name).delete()


@pytest.fixture
def scratch_database(driver):
    """A freshly seeded database for a test that changes data."""
    name = disposable_name()
    create_database(driver, name)
    yield name
    driver.databases.get(name).delete()


@pytest.fixture(scope="session")
def client(database):
    return TestClient(create_app(Database(database=database)))


def get(client, path, status=200):
    response = client.get(path)
    assert response.status_code == status, f"{path}: {response.status_code} {response.text}"
    return response.json()
