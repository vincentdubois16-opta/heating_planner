"""Read-only fixed-lead preheat overlay on the effective schedule."""
from datetime import timedelta
from .schedule_engine import calculate


def calculate_with_preheat(now, timezone, profiles, weekly, exceptions, wakes, zone, lead_minutes):
    """Apply preheat only ahead of an upward temperature transition.

    The result is read-only and is never sent to actuators.
    """
    lead = max(0, min(360, int(lead_minutes)))
    base = calculate(now, timezone, profiles, weekly, exceptions, wakes, zone)
    result = dict(base)
    result.update(base_target=base['target'], preheat_active=False,
                  preheat_start=None, preheat_target=None, preheat_minutes=lead)
    if not lead:
        return result

    # Find all future *base* transitions. Look ahead from before the lead window
    # so that a preheat that started before 'now' can still be detected.
    lookback = now - timedelta(minutes=lead, seconds=1)
    cursor = lookback
    transitions = []
    for _ in range(80):
        state = calculate(cursor, timezone, profiles, weekly, exceptions, wakes, zone)
        boundary = state['next_change']
        if boundary is None or boundary > now + timedelta(days=14):
            break
        before = float(state['target'])
        after = float(state['next_target'])
        if after > before:
            start = boundary - timedelta(minutes=lead)
            transitions.append((start, boundary, after))
        cursor = boundary + timedelta(seconds=1)

    # Multiple upcoming preheats: highest target wins, then earliest start.
    active = [(start, end, temp) for start, end, temp in transitions
              if start <= now < end and temp > base['target']]
    if active:
        start, end, temp = max(active, key=lambda row: (row[2], -row[0].timestamp()))
        result.update(target=temp, preheat_active=True,
                      preheat_start=start, preheat_target=temp)

    # A preheat start is an effective change even when the normal schedule
    # transition occurs later. Do not advertise the normal boundary if it
    # will not change the temperature after preheat.
    candidates = []
    for start, end, temp in transitions:
        if start > now and temp != result['target']:
            candidates.append((start, temp))
        if end > now:
            # At end, the underlying schedule applies. Compute after boundary.
            post = calculate(end + timedelta(seconds=1), timezone, profiles,
                             weekly, exceptions, wakes, zone)
            if post['target'] != result['target']:
                candidates.append((end, post['target']))
    if base['next_change'] is not None:
        candidates.append((base['next_change'], base['next_target']))
    candidates.sort(key=lambda row: row[0])
    # Determine the next actual change by recalculating effective state just
    # after each candidate; this avoids false changes at the original boundary.
    for boundary, _ in candidates:
        if boundary <= now:
            continue
        future = _effective_at(boundary + timedelta(seconds=1), timezone,
                               profiles, weekly, exceptions, wakes, zone, lead)
        if future != result['target']:
            result['next_change'] = boundary
            result['next_target'] = future
            break
    else:
        result['next_change'] = None
        result['next_target'] = None
    return result


def _effective_at(moment, timezone, profiles, weekly, exceptions, wakes, zone, lead):
    base = calculate(moment, timezone, profiles, weekly, exceptions, wakes, zone)
    previous = calculate(moment - timedelta(minutes=lead, seconds=1),
                         timezone, profiles, weekly, exceptions, wakes, zone)
    cursor = moment - timedelta(minutes=lead, seconds=1)
    highest = base['target']
    for _ in range(10):
        state = calculate(cursor, timezone, profiles, weekly, exceptions, wakes, zone)
        end = state['next_change']
        if end is None or end > moment + timedelta(minutes=lead):
            break
        if end - timedelta(minutes=lead) <= moment < end and state['next_target'] > state['target']:
            highest = max(highest, state['next_target'])
        cursor = end + timedelta(seconds=1)
    return highest
