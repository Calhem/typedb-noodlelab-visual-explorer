"""The API is read-only, accepts only validated ids, and the seed loader rejects bad data."""

import pytest
from fastapi.routing import APIRoute

from explorer.api import create_app
from explorer.seed import SeedError, expand, read_seed, validate
from tests.conftest import get


def test_every_endpoint_is_a_read_only_get():
    routes = [r for r in create_app().routes if isinstance(r, APIRoute)]
    assert routes
    for route in routes:
        assert route.methods == {"GET"}, f"{route.path} accepts {route.methods}"


def test_ids_are_validated_before_any_query(client):
    for bad in ['caliper-fr"; delete', "Caliper-FR", "a--b", "-x", "x" * 65, "x y"]:
        assert client.get(f"/api/components/{bad}").status_code in (404, 422), bad
        response = client.get(f"/api/components/{bad}")
        assert "data" not in response.json()


def test_unknown_id_is_a_clear_not_found(client):
    body = get(client, "/api/components/no-such-part", status=404)
    assert body["error"] == "not-found"


def test_answers_carry_the_typeql_that_ran(client):
    body = get(client, "/api/components/hub-fr")
    assert len(body["typeql"]) == 2
    assert '"hub-fr"' in body["typeql"][0] and body["typeql"][0].startswith("match")


def test_placeholders_expand_for_corners_axles_and_lists():
    copies = expand({"ends": ["<a>-halfshaft-<s>", "hub-<c>"], "kind": "mechanical"})
    assert [c["ends"] for c in copies] == [["front-halfshaft-l", "hub-fl"], ["front-halfshaft-r", "hub-fr"],
                                          ["rear-halfshaft-l", "hub-rl"], ["rear-halfshaft-r", "hub-rr"]]
    assert len(expand({"ends": ["wheel-nut-<c>-<n>", "hub-<c>"], "each": {"n": [1, 2, 3, 4, 5]}})) == 20


def test_seed_problems_are_reported_before_loading():
    seed = read_seed()
    seed["connections"].append({"kind": "mechanical", "joint": "bolted", "ends": ["caliper-fr", "no-such-part"]})
    seed["components"].append({"id": "caliper-fr", "type": "brake-caliper", "assembly": "corner-fr", "name": "Duplicate"})
    seed["systems"].append({"id": "x", "name": "X", "members": ["nothing-*"]})
    with pytest.raises(SeedError) as error:
        validate(seed)
    text = "\n".join(error.value.problems)
    assert "unknown component 'no-such-part'" in text
    assert "'caliper-fr' appears more than once" in text
    assert "pattern 'nothing-*' matches no component" in text
