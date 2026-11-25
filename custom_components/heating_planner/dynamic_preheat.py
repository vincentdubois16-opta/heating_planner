"""Read-only dynamic lead estimate; active windows stay latched until their deadline."""
import math
from datetime import timedelta
from .schedule_engine import build_timeline
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


def normalize_dead_time(value):
    """Return a finite, non-negative delay in minutes, or None."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and 0 <= number <= 360 else None


def lead_minutes(gap, slope, dead_time=0, maximum=360):
    """Minutes needed to gain `gap` °C: delay before the rise, then gap / slope (°C/h).

    No positive gap means no preheat at all, not even the delay.
    """
    if gap <= 0:
        return 0
    return min(maximum, max(0, math.ceil((dead_time or 0) + gap / slope * 60)))


def calculate_dynamic(now, timezone, profiles, weekly, exceptions, wakes, zone,
                      fixed_minutes, maximum, temperature, slope, cache, timeline=None, dead_time=0):
    timeline = timeline or build_timeline(now, timezone, profiles, weekly, exceptions, wakes, zone)
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
        result = calculate_with_preheat(now, timezone, profiles, weekly, exceptions, wakes, zone, fixed_minutes, timeline=timeline)
        result.update(preheat_strategy="fixed_fallback", dynamic_start=None,
                      dynamic_deadline=None, dynamic_minutes=None, dynamic_target=None,
                      dynamic_slope=valid_slope, dynamic_dead_time=None)
        return result
    for key in list(cache):
        if key <= now:
            del cache[key]

    def lead_for(boundary, target):
        if boundary in cache:
            return cache[boundary]
        lead = lead_minutes(target-valid_temp, valid_slope, dead_time, maximum)
        if lead and boundary-timedelta(minutes=lead) <= now < boundary:
            cache[boundary] = lead
        return lead

    # Freeze the current measurement for the forecast made during this update.
    result = calculate_with_preheat(now, timezone, profiles, weekly, exceptions, wakes, zone, maximum, lead_for, timeline=timeline)
    upcoming = []
    for boundary, before, after in _base_transitions(now, now+timedelta(days=14), timezone, profiles, weekly, exceptions, wakes, zone, timeline=timeline):
        if after > before:
            lead = lead_for(boundary, after)
            upcoming.append((boundary-timedelta(minutes=lead), boundary, lead, after))
    active = [item for item in upcoming if item[0] <= now < item[1] and item[3] == result["preheat_target"]]
    selected = min(active or upcoming, key=lambda item:item[0]) if upcoming else (None,None,None,None)
    result.update(preheat_strategy="dynamic", dynamic_start=selected[0],
                  dynamic_deadline=selected[1], dynamic_minutes=selected[2],
                  dynamic_target=selected[3], dynamic_slope=valid_slope,
                  dynamic_dead_time=dead_time or 0)
    return result
