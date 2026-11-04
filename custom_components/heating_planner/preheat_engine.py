"""Preheat overlays derived from one pre-expanded transition list."""
from datetime import timedelta
from .schedule_engine import build_timeline


def _base_transitions(start, horizon, timezone, profiles, weekly, exceptions, wakes, zone, timeline=None):
    timeline = timeline or build_timeline(start, timezone, profiles, weekly, exceptions, wakes, zone)
    yield from timeline.transitions(start, horizon)


def calculate_with_preheat(now, timezone, profiles, weekly, exceptions, wakes, zone, lead_minutes, lead_for=None, timeline=None):
    timeline = timeline or build_timeline(now, timezone, profiles, weekly, exceptions, wakes, zone)
    lead = max(0, min(360, int(lead_minutes)))
    base = timeline.at(now)
    horizon = now + timedelta(days=14)
    windows = []
    candidates = set()
    for boundary, before, after in timeline.transitions(now-timedelta(minutes=lead, seconds=1), horizon+timedelta(minutes=lead)):
        if now < boundary <= horizon:
            candidates.add(boundary)
        if lead and after > before:
            duration = lead_for(boundary, after) if lead_for else lead
            start = boundary-timedelta(minutes=duration)
            if duration:
                windows.append((start, boundary, after))
                if now < start <= horizon:
                    candidates.add(start)

    def effective(moment):
        target = float(timeline.at(moment)["target"])
        active = [(after, start) for start, end, after in windows if start <= moment < end and after > target]
        if not active:
            return target, None
        return max(active, key=lambda item:(item[0], -item[1].timestamp()))

    target, start = effective(now)
    result = dict(base, target=target, base_target=base["target"],
                  preheat_active=start is not None, preheat_start=start,
                  preheat_target=target if start is not None else None,
                  preheat_minutes=lead, next_change=None, next_target=None)
    for boundary in sorted(candidates):
        future, _ = effective(boundary)
        if future != target:
            result.update(next_change=boundary, next_target=future)
            break
    return result
