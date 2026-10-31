"""Read-only fixed-lead preheat overlay and effective next-transition search."""
from datetime import timedelta
from .schedule_engine import calculate


def _base_transitions(start, horizon, timezone, profiles, weekly, exceptions, wakes, zone):
    """Walk *all* base temperature changes, not just the first one."""
    cursor = start
    for _ in range(512):
        state = calculate(cursor, timezone, profiles, weekly, exceptions, wakes, zone)
        boundary = state['next_change']
        if boundary is None or boundary > horizon:
            return
        yield boundary, float(state['target']), float(state['next_target'])
        cursor = boundary + timedelta(seconds=1)


def _effective_at(moment, timezone, profiles, weekly, exceptions, wakes, zone, lead):
    base = calculate(moment, timezone, profiles, weekly, exceptions, wakes, zone)
    target = float(base['target'])
    if lead <= 0:
        return target, None
    start = moment - timedelta(minutes=lead, seconds=1)
    horizon = moment + timedelta(minutes=lead)
    active = []
    for boundary, before, after in _base_transitions(
        start, horizon, timezone, profiles, weekly, exceptions, wakes, zone
    ):
        preheat_start = boundary - timedelta(minutes=lead)
        if after > before and preheat_start <= moment < boundary and after > target:
            active.append((after, preheat_start, boundary))
    if not active:
        return target, None
    after, preheat_start, _ = max(active, key=lambda item: (item[0], -item[1].timestamp()))
    return after, preheat_start


def calculate_with_preheat(now, timezone, profiles, weekly, exceptions, wakes, zone, lead_minutes):
    """Calculate current effective setpoint and its next *real* change."""
    lead = max(0, min(360, int(lead_minutes)))
    base = calculate(now, timezone, profiles, weekly, exceptions, wakes, zone)
    target, active_start = _effective_at(
        now, timezone, profiles, weekly, exceptions, wakes, zone, lead
    )
    result = dict(base)
    result.update(target=target, base_target=base['target'],
                  preheat_active=active_start is not None,
                  preheat_start=active_start,
                  preheat_target=target if active_start is not None else None,
                  preheat_minutes=lead, next_change=None, next_target=None)

    # Every base boundary can change the effective setpoint, including a
    # DOWNWARD boundary after an upward transition whose preheat is active.
    # Every upward boundary also introduces a possible earlier preheat start.
    horizon = now + timedelta(days=14)
    start = now - timedelta(minutes=lead, seconds=1)
    boundaries = set()
    for boundary, before, after in _base_transitions(
        start, horizon, timezone, profiles, weekly, exceptions, wakes, zone
    ):
        if boundary > now:
            boundaries.add(boundary)
        if lead and after > before:
            early = boundary - timedelta(minutes=lead)
            if now < early <= horizon:
                boundaries.add(early)

    for boundary in sorted(boundaries):
        future, _ = _effective_at(
            boundary + timedelta(microseconds=1), timezone, profiles,
            weekly, exceptions, wakes, zone, lead
        )
        if future != target:
            result['next_change'] = boundary
            result['next_target'] = future
            break
    return result
