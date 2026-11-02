"""Read-only dynamic lead estimate; active windows stay latched until their deadline."""
import math
from datetime import timedelta
from .preheat_engine import calculate_with_preheat, _base_transitions


def positive(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (TypeError, ValueError):
        return None


def normalize_slope(value, unit="hour"):
    """Convert the configured source unit to degrees Celsius per hour."""
    number = positive(value)
    if number is None or unit not in ("hour", "minute"):
        return None
    result = number * (60 if unit == "minute" else 1)
    return positive(result)


def calculate_dynamic(now, timezone, profiles, weekly, exceptions, wakes, zone,
                      fixed_minutes, maximum, temperature, slope, cache):
    maximum = max(0, min(360, int(maximum)))
    try:
        valid_temp = float(temperature)
        if not math.isfinite(valid_temp):
            valid_temp = None
    except (TypeError, ValueError):
        valid_temp = None
    valid_slope = positive(slope)
    if valid_temp is None or valid_slope is None:
        cache.clear()
        result = calculate_with_preheat(now, timezone, profiles, weekly, exceptions, wakes, zone, fixed_minutes)
        result.update(preheat_strategy="fixed_fallback", dynamic_start=None,
                      dynamic_deadline=None, dynamic_minutes=None, dynamic_target=None,
                      dynamic_slope=valid_slope)
        return result
    for key in list(cache):
        if key <= now:
            del cache[key]

    def lead_for(boundary, target):
        if boundary in cache:
            return cache[boundary]
        lead = min(maximum, max(0, math.ceil((target-valid_temp)/valid_slope*60)))
        if lead and boundary-timedelta(minutes=lead) <= now < boundary:
            cache[boundary] = lead
        return lead

    # Freeze the current measurement for the forecast made during this update.
    result = calculate_with_preheat(now, timezone, profiles, weekly, exceptions, wakes, zone, maximum, lead_for)
    upcoming = []
    for boundary, before, after in _base_transitions(now, now+timedelta(days=14), timezone, profiles, weekly, exceptions, wakes, zone):
        if after > before:
            lead = lead_for(boundary, after)
            upcoming.append((boundary-timedelta(minutes=lead), boundary, lead, after))
    active = [item for item in upcoming if item[0] <= now < item[1] and item[3] == result["preheat_target"]]
    selected = min(active or upcoming, key=lambda item:item[0]) if upcoming else (None,None,None,None)
    result.update(preheat_strategy="dynamic", dynamic_start=selected[0],
                  dynamic_deadline=selected[1], dynamic_minutes=selected[2],
                  dynamic_target=selected[3], dynamic_slope=valid_slope)
    return result
