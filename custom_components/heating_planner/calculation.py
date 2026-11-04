"""Pure snapshot computation; never access HA objects from the executor thread."""
import copy
from .schedule_engine import build_timeline
from .preheat_engine import calculate_with_preheat
from .dynamic_preheat import calculate_dynamic, normalize_slope
from .override_engine import apply_override
from .away_preheat import apply_temporary_mode


def configuration_key(snapshot):
    return repr(tuple(snapshot[key] for key in ("options", "weekly", "exceptions", "wakes", "override", "timezone", "zone")))


def calculate_cycle(snapshot, previous_cache):
    key = configuration_key(snapshot)
    cache = copy.deepcopy(previous_cache) if previous_cache.get("key") == key else {"key": key, "dynamic": {}, "away": {}}
    now = snapshot["now"]
    options = snapshot["options"]
    # Read override expiry without expanding the schedule once for this check.
    status = apply_override({"target": 0}, snapshot["override"], now)
    expiry = status.get("override_until")
    timeline = build_timeline(now, snapshot["timezone"], snapshot["profiles"], snapshot["weekly"],
                              snapshot["exceptions"], snapshot["wakes"], snapshot["zone"],
                              extra_moments=(expiry,) if expiry else ())
    args = (snapshot["timezone"], snapshot["profiles"], snapshot["weekly"], snapshot["exceptions"], snapshot["wakes"], snapshot["zone"])
    fixed = options.get("preheat_minutes", 0)
    speed = normalize_slope(snapshot["slope"], options.get("slope_unit", "hour"))
    def planner(moment):
        return calculate_with_preheat(moment, *args, fixed, timeline=timeline)
    if options.get("dynamic_preheat", False):
        base = calculate_dynamic(now, *args, fixed, options.get("max_preheat_minutes", 180),
                                 snapshot["temperature"], speed,
                                 cache["dynamic"] if status["active_mode"] == "planning" else {}, timeline=timeline)
    else:
        base = planner(now)
    effective = apply_temporary_mode(base, snapshot["override"], now, planner,
        options.get("dynamic_preheat", False), snapshot["temperature"], speed,
        options.get("max_preheat_minutes", 180), fixed, cache["away"])
    return effective, cache
