"""Anticipate an away expiry by testing a window, never an equality trigger."""
import math
from datetime import timedelta
from .override_engine import apply_override
from .dynamic_preheat import positive


def apply_temporary_mode(base, override, now, planner, dynamic, temperature, slope,
                         maximum, fixed_minutes, cache):
    result = apply_override(base, override, now)
    if result["active_mode"] == "planning":
        cache.clear()
        return result
    expiry = result["override_until"]
    resume = planner(expiry)
    if float(resume["target"]) != float(result["target"]):
        result.update(next_change=expiry, next_target=resume["target"])
    else:
        result.update(next_change=resume["next_change"], next_target=resume["next_target"])
    if result["active_mode"] != "away":
        cache.clear()
        return result
    target = float(resume["target"])
    if target <= float(override["temperature"]):
        cache.clear()
        return result
    try:
        measured = float(temperature)
        if not math.isfinite(measured):
            measured = None
    except (TypeError, ValueError):
        measured = None
    speed = positive(slope)
    strategy = "dynamic" if dynamic and measured is not None and speed is not None else "fixed_fallback" if dynamic else "fixed"
    if strategy == "dynamic":
        lead = min(max(0, min(360, int(maximum))), max(0, math.ceil((target-measured)/speed*60)))
    else:
        lead = max(0, min(360, int(fixed_minutes)))
    key = (expiry, target, strategy)
    if key in cache:
        lead = cache[key]
    else:
        cache.clear()
    start = expiry-timedelta(minutes=lead)
    if lead and start <= now < expiry:
        cache[key] = lead
        result.update(target=target, preheat_active=True, preheat_start=start, preheat_target=target,
                      next_change=resume["next_change"], next_target=resume["next_target"])
    result.update(away_return_start=start if lead else None, away_return_deadline=expiry,
                  away_return_target=target, away_return_minutes=lead, away_return_strategy=strategy)
    if lead and now < start:
        result.update(next_change=start, next_target=target)
    return result
