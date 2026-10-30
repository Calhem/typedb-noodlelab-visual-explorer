"""The Questions tab's answers against oracles worked out from the seed files."""

from collections import Counter

from explorer.seed import read_seed, validate
from tests.conftest import get
from tests.test_impact import oracle

SEED = read_seed()
RESOLVED = validate(SEED)
COMPONENTS = {c["id"]: c for c in SEED["components"]}
PROPS = RESOLVED["properties"]


def ask(client, qid):
    body = get(client, f"/api/questions/{qid}")
    assert body["typeql"] and len(body["timings-ms"]) == len(body["typeql"])
    return body["data"]


def test_question_list(client):
    ids = [q["id"] for q in get(client, "/api/questions")["data"]]
    assert len(ids) == 8 and len(set(ids)) == 8


def test_pack_energy(client):
    modules = [c for c in COMPONENTS if COMPONENTS[c]["type"] == "battery-module"]
    data = ask(client, "pack-energy")
    assert data["rows"] == [[len(modules), sum(PROPS[m]["energy-capacity-kwh"] for m in modules),
                             sum(PROPS[m]["nominal-voltage-v"] for m in modules)]]
    assert set(data["highlight"]) == set(modules)


def test_drive_power(client):
    motors = [c for c in COMPONENTS if COMPONENTS[c]["type"] == "electric-motor"]
    data = ask(client, "drive-power")
    assert sum(r[1] for r in data["rows"]) == sum(PROPS[m]["peak-power-kw"] for m in motors)


def test_sensors_by_type(client):
    sensor_types = {"camera", "radar", "lidar", "gnss-receiver", "wheel-speed-sensor", "position-sensor", "current-sensor", "cell-monitor"}
    expected = Counter(c["type"] for c in SEED["components"] if c["type"] in sensor_types)
    assert {r[0]: r[1] for r in ask(client, "sensors-by-type")["rows"]} == dict(expected)


def test_multi_system(client):
    memberships = Counter(m for members in RESOLVED["members"].values() for m in members)
    assert set(ask(client, "multi-system")["highlight"]) == {c for c, n in memberships.items() if n > 1}


def test_shared_sensors(client):
    counts = Counter(s for loop in RESOLVED["loops"] for s in loop["sensors"])
    assert set(ask(client, "shared-sensors")["highlight"]) == {s for s, n in counts.items() if n > 1}


def test_connections_by_kind(client):
    expected = Counter(c["kind"] for c in RESOLVED["connections"])
    assert {r[0]: r[1] for r in ask(client, "connections-by-kind")["rows"]} == dict(expected)


def test_battery_to_wheel_is_a_real_chain(client):
    deps = {(d["provider"], d["needs"], d["dependent"], d["function"]) for d in RESOLVED["dependencies"]}
    names = {c["name"]: c["id"] for c in SEED["components"]}
    split = lambda cell: cell.rsplit(": ", 1)
    rows = [(step, *split(a), *split(b)) for step, a, b in ask(client, "battery-to-wheel")["rows"]]
    assert names[rows[0][1]].startswith("battery-module-") and names[rows[-1][3]] == "tyre-fl"
    for step, provider, supplies, dependent, function in rows:
        assert (names[provider], supplies, names[dependent], function) in deps
    for a, b in zip(rows, rows[1:]):
        assert a[3] == b[1]          # each step's dependent supplies the next step


def test_propulsion_single_points_match_the_failure_oracle(client):
    tyres = {(f"tyre-{c}", "drive torque") for c in ("fl", "fr", "rl", "rr")}
    expected = {c for c in COMPONENTS if all(oracle(c).get(t) == "lost" for t in tyres)}
    assert set(ask(client, "propulsion-single-points")["highlight"]) == expected


def test_unknown_question(client):
    assert get(client, "/api/questions/nonsense", status=404)["error"] == "not-found"
