"""Failure impact, function by function (docs/dependency-semantics.md, C1).

1. The ten representative failures, exactly as written in the expected-outcomes table before implementation.
2. An independent oracle: the same rules worked out in Python from the seed files, for EVERY component as the
   failed part, compared with TypeDB's answer. The oracle checks fallbacks exactly (a backup only counts if it
   keeps all its functions in that failure), so agreement also confirms the simpler rule in TypeDB is sound here.
"""

import pytest

from explorer.db import READ, fetch, rows
from explorer.seed import read_seed, validate
from tests.conftest import get

SEED = read_seed()
DEPS = validate(SEED)["dependencies"]
IDS = [c["id"] for c in SEED["components"]]
CORNERS = ("fl", "fr", "rl", "rr")


def oracle(start):
    """{(component, function): "lost" | "degraded"} when `start` fails (the start's own functions excluded)."""
    state = {}
    while True:
        changed = False
        for d in DEPS:
            provided = "lost" if d["provider"] == start else state.get((d["provider"], d["needs"]))
            if provided == "lost":
                if d["loss"] == "degraded":
                    result = "degraded"
                else:
                    backup = d.get("fallback", {}).get("backup")
                    available = backup is not None and backup != start and not any(
                        c == backup and v == "lost" for (c, _), v in state.items())
                    result = "degraded" if available else "lost"
            elif provided == "degraded" and d.get("degradation"):
                result = d["degradation"]
            else:
                continue
            key = (d["dependent"], d["function"])
            if key[0] == start:
                continue
            if state.get(key) != "lost" and state.get(key) != result:
                state[key] = "lost" if "lost" in (state.get(key), result) else result
                changed = True
        if not changed:
            return state


def impact(client, cid):
    data = get(client, f"/api/components/{cid}/impact")["data"]
    return ({(x["id"], x["function"]) for x in data["lost"]}, {(x["id"], x["function"]) for x in data["degraded"]},
            {(f["id"], f["function"], f["backup"]) for f in data["fallbacks"]})


def all_corners(component, function):
    return {(f"{component}-{c}", function) for c in CORNERS}


# ---- 1. The expected-outcomes table ---------------------------------------------------------------------------

def test_1_wheel_speed_sensor(client):
    lost, degraded, _ = impact(client, "wheel-speed-sensor-fl")
    assert lost == {("esc-module", "anti-lock braking"), ("esc-module", "stability control"),
                    ("vcu", "traction control"), ("ad-compute", "automated driving")}
    assert not degraded
    assert ("esc-module", "brake pressure") not in lost | degraded
    assert not {k for k in lost if k[1] in ("clamping force", "drive torque", "friction braking")}


def test_2_brake_booster(client):
    lost, degraded, fallbacks = impact(client, "brake-booster")
    assert lost == {("ad-compute", "automated driving")}
    assert all_corners("caliper", "clamping force") <= degraded
    assert {("master-cylinder", "brake pressure"), ("esc-module", "brake pressure")} <= degraded
    assert all_corners("brake-hose", "brake pressure") <= degraded
    assert ("master-cylinder", "brake pressure", "brake-pedal") in fallbacks


def test_3_twelve_volt_battery(client):
    lost, degraded, fallbacks = impact(client, "lv-battery")
    assert {("lv-harness", "12 V distribution"), ("bms", "battery supervision"), ("hv-junction-box", "HV supply"),
            ("esc-module", "anti-lock braking"), ("brake-booster", "brake assistance"),
            ("steering-rack", "steering assistance"), ("ad-compute", "automated driving")} <= lost
    assert all_corners("tyre", "drive torque") <= lost
    assert all_corners("caliper", "clamping force") <= degraded
    assert not {k for k in lost if k[1] in ("clamping force", "friction braking", "steering motion")}
    assert ("master-cylinder", "brake pressure", "brake-pedal") in fallbacks


def test_4_coolant_pump(client):
    lost, degraded, _ = impact(client, "coolant-pump")
    # revised in C3a: the drive units' oil coolers reject their heat into the same coolant
    assert lost == {("coolant-lines", "coolant flow"), ("battery-coolant-manifold", "coolant flow"),
                    ("battery-cooling-plate", "cell cooling"), ("front-oil-cooler", "oil cooling"), ("rear-oil-cooler", "oil cooling")}
    assert {(f"battery-module-{n}", "cell power") for n in range(1, 17)} <= degraded
    assert {("front-stator", "magnetic field"), ("rear-stator", "magnetic field")} <= degraded
    assert all_corners("tyre", "drive torque") <= degraded


def test_5_power_steering_motor(client):
    lost, degraded, _ = impact(client, "eps-motor")
    assert lost == {("steering-rack", "steering assistance"), ("ad-compute", "automated driving")}
    assert not degraded


def test_6_front_gate_driver(client):
    lost, degraded, _ = impact(client, "front-gate-driver")
    assert {("tyre-fl", "drive torque"), ("tyre-fr", "drive torque"), ("front-power-module", "phase current")} <= lost
    assert not {k for k in lost | degraded if k[0].startswith("rear-") or k[0].endswith(("-rl", "-rr"))}


def test_7_one_battery_module(client):
    lost, degraded, _ = impact(client, "battery-module-5")
    assert {("battery-busbar-l", "pack current"), ("hv-junction-box", "HV supply")} <= lost
    assert all_corners("tyre", "drive torque") <= lost
    assert ("battery-cooling-plate", "cell cooling") in degraded
    assert not {k for k in lost | degraded if k[0].startswith("battery-module-")}


def test_8_esc_module(client):
    lost, degraded, fallbacks = impact(client, "esc-module")
    assert lost == {("ad-compute", "automated driving")}
    assert all_corners("caliper", "clamping force") <= degraded
    assert {(f"brake-hose-{c}", "brake pressure", "master-cylinder") for c in CORNERS} <= fallbacks


def test_9_one_brake_hose(client):
    lost, degraded, _ = impact(client, "brake-hose-fl")
    assert lost == {("caliper-fl", "clamping force"), ("brake-pad-inner-fl", "friction braking"),
                    ("brake-pad-outer-fl", "friction braking")}
    assert not degraded


def test_10_steering_rack(client):
    lost, degraded, _ = impact(client, "steering-rack")
    assert lost == {("tie-rod-fl", "steering motion"), ("tie-rod-fr", "steering motion"), ("ad-compute", "automated driving")}


# ---- C3a: the drive units in detail (docs/dependency-semantics.md, scenarios 11-16) ---------------------------------

def rear_or_front(keys, axle):
    return {k for k in keys if k[0].startswith(f"{axle}-") or k[0].endswith(("-rl", "-rr") if axle == "rear" else ("-fl", "-fr"))}


def test_11_front_resolver(client):
    lost, degraded, _ = impact(client, "front-resolver")
    assert {("front-control-board", "motor control"), ("front-gate-driver", "switching control"),
            ("front-power-module", "phase current"), ("tyre-fl", "drive torque"), ("tyre-fr", "drive torque")} <= lost
    assert not rear_or_front(lost | degraded, "rear")


def test_12_rear_oil_pump(client):
    lost, degraded, _ = impact(client, "rear-oil-pump")
    assert lost == {("rear-oil-cooler", "oil cooling")}
    assert {("rear-stator", "magnetic field"), ("rear-intermediate-shaft", "drive torque"), ("rear-reduction-gear", "drive torque"),
            ("tyre-rl", "drive torque"), ("tyre-rr", "drive torque")} <= degraded
    assert not rear_or_front(lost | degraded, "front")


def test_13_front_disconnect(client):
    lost, degraded, _ = impact(client, "front-disconnect")
    assert {("front-intermediate-shaft", "drive torque"), ("front-reduction-gear", "drive torque"), ("front-differential", "drive torque"),
            ("front-halfshaft-l", "drive torque"), ("front-halfshaft-r", "drive torque"), ("tyre-fl", "drive torque"), ("tyre-fr", "drive torque")} <= lost
    assert not {k for k in lost | degraded if k[0] in ("front-stator", "front-rotor", "front-rotor-shaft")}
    assert not rear_or_front(lost | degraded, "rear")


def test_14_rear_left_side_gear(client):
    lost, degraded, _ = impact(client, "rear-side-gear-l")
    assert lost == {("rear-halfshaft-l", "drive torque"), ("hub-rl", "drive torque"), ("wheel-rl", "drive torque"), ("tyre-rl", "drive torque")}
    assert not degraded


def test_15_rear_park_lock(client):
    lost, degraded, _ = impact(client, "rear-park-lock")
    assert not lost and not degraded


def test_16_front_hv_connector(client):
    lost, degraded, _ = impact(client, "front-hv-connector")
    assert {("front-inverter-busbars", "DC supply"), ("front-dc-link-capacitor", "DC supply"), ("front-power-module", "phase current"),
            ("tyre-fl", "drive torque"), ("tyre-fr", "drive torque")} <= lost
    assert not rear_or_front(lost | degraded, "rear")


# ---- 2. Independent oracle for every component ------------------------------------------------------------------

def test_typedb_matches_the_oracle_for_every_failure(driver, database):
    mismatches = []
    with driver.transaction(database, READ) as tx:
        for cid in IDS:
            got = {}
            for fn, label in (("degraded_steps", "degraded"), ("lost_steps", "lost")):
                for r in fetch(tx, f'match $s isa component, has component-id "{cid}"; let $p, $g, $c, $f in {fn}($s); '
                                   f'fetch {{ "c": $c.component-id, "f": $f.function-name }};'):
                    if r["c"] != cid:
                        got[(r["c"], r["f"])] = label      # lost is written last, so it wins
            expected = oracle(cid)
            if got != expected:
                mismatches.append((cid, sorted(set(got.items()) ^ set(expected.items()))[:4]))
    assert not mismatches, mismatches[:5]


# ---- 3. Model integrity -----------------------------------------------------------------------------------------

def test_every_dependency_has_a_family_effect_and_functions(driver, database):
    with driver.transaction(database, READ) as tx:
        count = lambda q: rows(tx, f"match {q} reduce $n = count;")[0].get("n").get_integer()
        total = count("$d isa dependency;")
        assert total == len(DEPS)
        assert count("$d isa physical-dependency;") + count("$d isa operational-dependency;") + count("$d isa control-dependency;") == total
        assert count("$d isa dependency, has loss-effect $e;") == total
        assert count("$d isa dependency (affected-function: $f, required-function: $g);") == total


@pytest.mark.parametrize("dep", [d for d in DEPS if "fallback" in d], ids=lambda d: f"{d['dependent']}<-{d['provider']}")
def test_fallbacks_protect_a_loss(dep):
    assert dep["loss"] == "lost" and dep["fallback"]["backup"] != dep["provider"]


def test_function_level_consequences_per_component(client):
    """A failure takes functions, not whole components: the ESC module keeps its brake pressure when a
    wheel-speed sensor fails; the failed part itself loses everything it provides."""
    data = get(client, "/api/components/wheel-speed-sensor-fl/impact")["data"]
    esc = next(c for c in data["components"] if c["id"] == "esc-module")
    assert set(esc["lost"]) == {"anti-lock braking", "stability control"}
    assert "brake pressure" in esc["kept"] and not esc["degraded"]
    assert data["failed"]["functions"] == ["wheel speed"]
    rack = next(c for c in get(client, "/api/components/eps-motor/impact")["data"]["components"] if c["id"] == "steering-rack")
    assert rack["lost"] == ["steering assistance"] and "steering motion" in rack["kept"]
