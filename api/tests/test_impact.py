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
    """Revised in C3c step 2: without the rack the front wheels' steer angle is no longer held."""
    lost, degraded, _ = impact(client, "steering-rack")
    assert lost == {("tie-rod-fl", "steering motion"), ("tie-rod-fr", "steering motion"), ("ad-compute", "automated driving"),
                    ("knuckle-fl", "wheel alignment"), ("knuckle-fr", "wheel alignment"), ("tyre-fl", "road holding"), ("tyre-fr", "road holding")}


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


def propulsion(client, cid):
    p = get(client, f"/api/components/{cid}/impact")["data"]["propulsion"]
    return {a["system"]: a["state"] for a in p["axles"]}, p["vehicle"]


def test_14_rear_left_side_gear_open_differential(client):
    """Revised in C3b: an open differential cannot drive either wheel when one side spins free."""
    lost, degraded, _ = impact(client, "rear-side-gear-l")
    assert {("rear-differential", "drive torque"), ("rear-spider-gears", "drive torque"), ("rear-side-gear-r", "drive torque"),
            ("rear-halfshaft-l", "drive torque"), ("rear-halfshaft-r", "drive torque"), ("rear-halfshaft-l", "reaction path")} <= lost
    assert {(f"{p}-{c}", "drive torque") for p in ("hub", "wheel", "tyre") for c in ("rl", "rr")} <= lost
    assert ("rear-halfshaft-r", "reaction path") not in lost
    assert not {k for k in lost | degraded if k[1] in ("wheel rotation", "clamping force", "friction braking", "steering motion")}
    assert not rear_or_front(lost | degraded, "front")
    assert propulsion(client, "rear-side-gear-l") == ({"front-axle-drive": "kept", "rear-axle-drive": "lost"}, "reduced")


def test_17_front_right_drive_shaft(client):
    lost, degraded, _ = impact(client, "front-halfshaft-r")
    assert {("tyre-fl", "drive torque"), ("tyre-fr", "drive torque"), ("front-differential", "drive torque")} <= lost
    assert not {k for k in lost | degraded if k[1] in ("wheel rotation", "clamping force", "friction braking", "steering motion")}
    assert not rear_or_front(lost | degraded, "rear")
    assert propulsion(client, "front-halfshaft-r") == ({"front-axle-drive": "lost", "rear-axle-drive": "kept"}, "reduced")
    hub = next(c for c in get(client, "/api/components/front-halfshaft-r/impact")["data"]["components"] if c["id"] == "hub-fl")
    assert hub["lost"] == ["drive torque"] and "wheel rotation" in hub["kept"]


def test_18_rear_left_wheel_bearing(client):
    lost, degraded, _ = impact(client, "wheel-bearing-rl")
    assert lost == {("hub-rl", "wheel rotation")} and not degraded
    assert propulsion(client, "wheel-bearing-rl") == ({"front-axle-drive": "kept", "rear-axle-drive": "kept"}, "kept")


def test_vehicle_level_propulsion_for_earlier_scenarios(client):
    assert propulsion(client, "lv-battery") == ({"front-axle-drive": "lost", "rear-axle-drive": "lost"}, "lost")
    assert propulsion(client, "coolant-pump") == ({"front-axle-drive": "reduced", "rear-axle-drive": "reduced"}, "reduced")
    assert propulsion(client, "battery-module-5")[1] == "lost"
    assert propulsion(client, "brake-hose-fl") == ({"front-axle-drive": "kept", "rear-axle-drive": "kept"}, "kept")


def test_15_rear_park_lock(client):
    lost, degraded, _ = impact(client, "rear-park-lock")
    assert not lost and not degraded


def test_16_front_hv_connector(client):
    lost, degraded, _ = impact(client, "front-hv-connector")
    assert {("front-inverter-busbars", "DC supply"), ("front-dc-link-capacitor", "DC supply"), ("front-power-module", "phase current"),
            ("tyre-fl", "drive torque"), ("tyre-fr", "drive torque")} <= lost
    assert not rear_or_front(lost | degraded, "rear")


# ---- C3b: battery and high-voltage distribution (docs/dependency-semantics.md, scenarios 19-27) -----------------

ALL_TYRES = all_corners("tyre", "drive torque")


def test_19_pack_fuse(client):
    lost, degraded, _ = impact(client, "pack-fuse")
    assert {("main-contactor-pos", "HV switching"), ("hv-junction-box", "HV supply"), ("hv-harness-front", "HV distribution"),
            ("battery-rear-feed", "HV distribution"), ("pdu", "HV distribution"), ("hv-junction-box", "battery charging")} <= lost
    assert ALL_TYRES <= lost
    assert not {k for k in lost | degraded if k[0].startswith("battery-module-") or k[0] == "bms"}
    assert propulsion(client, "pack-fuse")[1] == "lost"


def test_20_module_monitor(client):
    lost, degraded, _ = impact(client, "battery-monitor-3")
    assert {("bms", "battery supervision"), ("main-contactor-pos", "HV switching"), ("main-contactor-neg", "HV switching"),
            ("hv-junction-box", "HV supply")} <= lost
    assert ALL_TYRES <= lost
    assert not {k for k in lost | degraded if k[0] in ("battery-module-5", "battery-module-6")}
    assert propulsion(client, "battery-monitor-3")[1] == "lost"


def test_21_pack_current_sensor(client):
    lost, degraded, _ = impact(client, "pack-current-sensor")
    assert not lost
    assert {("bms", "battery supervision"), ("hv-junction-box", "HV supply")} | ALL_TYRES <= degraded
    assert propulsion(client, "pack-current-sensor") == ({"front-axle-drive": "reduced", "rear-axle-drive": "reduced"}, "reduced")


def test_22_dc_charge_harness(client):
    lost, degraded, fallbacks = impact(client, "hv-harness-charge")
    assert lost == {("battery-rear-feed", "DC charging")}
    assert degraded == {("hv-junction-box", "battery charging")}
    assert ("hv-junction-box", "battery charging", "obc") in fallbacks
    assert propulsion(client, "hv-harness-charge")[1] == "kept"


def test_22b_charge_port_is_a_shared_cause(client):
    """The on-board charger cannot stand in for DC charging when the charge port itself fails."""
    lost, degraded, fallbacks = impact(client, "charge-port")
    assert {("hv-harness-charge", "DC charging"), ("battery-rear-feed", "DC charging"), ("obc", "AC charging"),
            ("hv-junction-box", "battery charging")} <= lost
    assert not fallbacks


def test_23_precharge(client):
    lost, _, _ = impact(client, "precharge-circuit")
    assert {("main-contactor-pos", "HV switching"), ("hv-junction-box", "HV supply")} | ALL_TYRES <= lost
    assert propulsion(client, "precharge-circuit")[1] == "lost"


def test_24_rear_feed(client):
    lost, degraded, _ = impact(client, "battery-rear-feed")
    assert {("hv-harness-rear", "HV distribution"), ("tyre-rl", "drive torque"), ("tyre-rr", "drive torque")} <= lost
    assert not {k for k in lost | degraded if k[0] in ("tyre-fl", "tyre-fr")}
    assert propulsion(client, "battery-rear-feed") == ({"front-axle-drive": "kept", "rear-axle-drive": "lost"}, "reduced")
    _, _, fallbacks = impact(client, "battery-rear-feed")
    assert ("hv-junction-box", "battery charging") in degraded and ("hv-junction-box", "battery charging", "obc") in fallbacks


def test_25_lv_fuse_box(client):
    lost, _, _ = impact(client, "lv-fuse-box")
    assert {("lv-harness", "12 V distribution"), ("bms", "battery supervision"), ("hv-junction-box", "HV supply")} | ALL_TYRES <= lost
    assert propulsion(client, "lv-fuse-box")[1] == "lost"


def test_26_dc_dc(client):
    lost, degraded, _ = impact(client, "dc-dc")
    assert not lost and degraded == {("lv-battery", "12 V supply")}
    assert propulsion(client, "dc-dc")[1] == "kept"


def test_27_auxiliary_harness(client):
    lost, degraded, _ = impact(client, "hv-harness-aux")
    assert {("pdu", "HV distribution"), ("dc-dc", "12 V charging"), ("heat-pump-compressor", "refrigerant compression"),
            ("obc", "AC charging")} <= lost
    assert {("lv-battery", "12 V supply"), ("battery-cooling-plate", "cell cooling")} <= degraded
    # corrected expectation (docs/dependency-semantics.md): degraded chilling does not reach the modules (C1 rule)
    assert not {k for k in lost | degraded if k[1] == "drive torque"}
    assert propulsion(client, "hv-harness-aux") == ({"front-axle-drive": "kept", "rear-axle-drive": "kept"}, "kept")


# ---- C3c step 2: suspension (docs/dependency-semantics.md, scenarios 28-35) ----------------------------------------

def others(keys, corner):
    """Affected (component, function) pairs belonging to any other wheel corner."""
    return {k for k in keys if any(k[0].endswith(f"-{c}") for c in CORNERS if c != corner)}


def test_28_lower_arm_loses_wheel_location(client):
    lost, degraded, _ = impact(client, "lower-arm-fl")
    assert lost == {("knuckle-fl", "wheel location"), ("tyre-fl", "road holding")}
    assert not degraded
    assert not {k for k in lost if k[1] in ("drive torque", "clamping force", "friction braking", "steering motion")}
    assert propulsion(client, "lower-arm-fl")[1] == "kept"


def test_29_spring_only_degrades(client):
    lost, degraded, _ = impact(client, "spring-rr")
    assert not lost
    assert degraded == {("tyre-rr", "road holding")}


def test_30_damper_only_degrades(client):
    lost, degraded, _ = impact(client, "coilover-fl")
    assert not lost
    assert degraded == {("tyre-fl", "road holding")}


def test_31_drop_link_loses_roll_control_degrades_the_axle(client):
    lost, degraded, _ = impact(client, "drop-link-rl")
    assert lost == {("rear-anti-roll-bar", "roll control")}
    assert degraded == {("tyre-rl", "road holding"), ("tyre-rr", "road holding")}


def test_32_subframe_mount_degrades_the_axle(client):
    lost, degraded, _ = impact(client, "front-subframe-mount-2")
    assert not lost
    assert {("front-subframe", "subframe location"), ("lower-arm-fl", "knuckle location"), ("lower-arm-fr", "knuckle location"),
            ("knuckle-fl", "wheel location"), ("knuckle-fr", "wheel location"), ("tyre-fl", "road holding"), ("tyre-fr", "road holding")} <= degraded
    assert not {k for k in degraded if k[0].endswith(("-rl", "-rr")) or k[0].startswith("rear-")}


def test_33_tie_rod_loses_that_wheels_alignment(client):
    lost, degraded, _ = impact(client, "tie-rod-fr")
    assert {("knuckle-fr", "wheel alignment"), ("tyre-fr", "road holding")} <= lost
    assert not others(lost | degraded, "fr")


def test_34_toe_link_loses_that_wheels_alignment(client):
    lost, degraded, _ = impact(client, "toe-link-rr")
    assert lost == {("knuckle-rr", "wheel alignment"), ("tyre-rr", "road holding")}
    assert not degraded


def test_35_top_mount(client):
    lost, degraded, _ = impact(client, "top-mount-fl")
    assert lost == {("spring-fl", "load support"), ("coilover-fl", "damping")}
    assert degraded == {("tyre-fl", "road holding")}



# ---- C3c step 3: steering (docs/dependency-semantics.md, scenarios 36-39) --------------------------------------------

FRONT_STEERING_CHAIN = {("steering-rack", "steering motion"), ("tie-rod-fl", "steering motion"), ("tie-rod-fr", "steering motion"),
                        ("knuckle-fl", "wheel alignment"), ("knuckle-fr", "wheel alignment"), ("tyre-fl", "road holding"),
                        ("tyre-fr", "road holding"), ("ad-compute", "automated driving")}
ASSISTANCE = {("steering-ecu", "steering control"), ("eps-motor", "power assistance"), ("steering-rack", "steering assistance")}


def test_36_torque_sensor_stops_assistance_not_steering(client):
    lost, degraded, _ = impact(client, "steering-torque-sensor")
    assert lost == ASSISTANCE | {("ad-compute", "automated driving")}
    assert not degraded


def test_37_intermediate_shaft(client):
    lost, degraded, _ = impact(client, "steering-intermediate-shaft")
    assert lost == FRONT_STEERING_CHAIN | ASSISTANCE | {("steering-torque-sensor", "steering torque")}
    assert not {k for k in lost | degraded if k[0].endswith(("-rl", "-rr")) or k[0].startswith(("caliper", "brake", "front-motor", "rear-"))}


def test_38_one_rack_mount_only_degrades(client):
    lost, degraded, _ = impact(client, "steering-rack-mount-l")
    assert not lost
    assert degraded == {("steering-rack", "steering motion")}


def test_39_steering_wheel(client):
    lost, _, _ = impact(client, "steering-wheel")
    assert lost == FRONT_STEERING_CHAIN | ASSISTANCE | {("steering-torque-sensor", "steering torque"),
                                                        ("steering-column", "driver steering input"),
                                                        ("steering-intermediate-shaft", "driver steering input")}


def test_power_steering_loop_has_its_sensor(client):
    data = get(client, "/api/components/steering-torque-sensor/relationships")["data"]
    assert {(loop["name"], loop["role"]) for loop in data["control-loops"]} == {("Electric power steering", "sensor")}

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
